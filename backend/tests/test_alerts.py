from datetime import date, datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import Alert, AlertType, Bureau, Case, CaseCategory, CaseStatus, Institution, Priority, Region
from app.services.alerts import refresh_alerts
from tests.test_auth import get_coordinator_token

FIXED_TODAY = date(2026, 10, 24)


@pytest.fixture(name="client_and_session")
def client_and_session_fixture():
    """Create in-memory SQLite database, seed test cases, and provide test client and session."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        inst = Institution(
            permanent_id="DEMO-TEST-ALERT",
            name="Alert Testing Academy",
            region=Region.SOUTH,
        )
        session.add(inst)
        session.commit()
        session.refresh(inst)

        # 1. Overdue Case -> Expected to get sla_breach (HIGH)
        c_breach = Case(
            case_no="RB-2026-BREACH",
            institution_id=inst.id,
            bureau=Bureau.RB,
            category=CaseCategory.INFRASTRUCTURE,
            description="Case overdue for disposal",
            received_date=FIXED_TODAY - timedelta(days=40),
            status=CaseStatus.UNDER_PROCESS,
            last_action="Inquiry completed",
            last_action_date=FIXED_TODAY - timedelta(days=2),
            expected_disposal_date=FIXED_TODAY - timedelta(days=4),  # Earlier than today
            priority=Priority.HIGH,
        )

        # 2. Due within 2 days -> Expected to get sla_warning (MEDIUM)
        c_warn = Case(
            case_no="PG-2026-WARN",
            institution_id=inst.id,
            bureau=Bureau.PGRC,
            category=CaseCategory.FACULTY,
            description="Case due within 3 days",
            received_date=FIXED_TODAY - timedelta(days=20),
            status=CaseStatus.PENDING,
            last_action="Notice sent",
            last_action_date=FIXED_TODAY - timedelta(days=3),
            expected_disposal_date=FIXED_TODAY + timedelta(days=2),  # Due in 2 days (<= 3)
            priority=Priority.MEDIUM,
        )

        # 3. No action > 7 days -> Expected to get pending_reminder (LOW)
        c_remind = Case(
            case_no="RO-2026-REMIND",
            institution_id=inst.id,
            bureau=Bureau.RO,
            category=CaseCategory.APPROVAL,
            description="Case with no action for 12 days",
            received_date=FIXED_TODAY - timedelta(days=30),
            status=CaseStatus.UNDER_PROCESS,
            last_action="Letter dispatched",
            last_action_date=FIXED_TODAY - timedelta(days=12),  # > 7 days
            expected_disposal_date=FIXED_TODAY + timedelta(days=25),
            priority=Priority.LOW,
        )

        # 4. Healthy active case -> Expected to get NO alert
        c_normal = Case(
            case_no="OC-2026-NORMAL",
            institution_id=inst.id,
            bureau=Bureau.OC,
            category=CaseCategory.ADMISSION,
            description="Healthy case",
            received_date=FIXED_TODAY - timedelta(days=5),
            status=CaseStatus.UNDER_PROCESS,
            last_action="Scrutiny done",
            last_action_date=FIXED_TODAY - timedelta(days=1),
            expected_disposal_date=FIXED_TODAY + timedelta(days=20),
            priority=Priority.LOW,
        )

        # 5. Disposed case -> Expected to get NO alert
        c_disp = Case(
            case_no="RB-2026-DISP",
            institution_id=inst.id,
            bureau=Bureau.RB,
            category=CaseCategory.OTHER,
            description="Disposed case",
            received_date=FIXED_TODAY - timedelta(days=50),
            status=CaseStatus.DISPOSED,
            last_action="Disposal order issued",
            last_action_date=FIXED_TODAY - timedelta(days=15),
            expected_disposal_date=FIXED_TODAY - timedelta(days=10),
            priority=Priority.LOW,
        )

        session.add_all([c_breach, c_warn, c_remind, c_normal, c_disp])
        session.commit()

    def get_test_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_test_session
    with TestClient(app) as test_client:
        token = get_coordinator_token()
        test_client.headers["Authorization"] = f"Bearer {token}"
        with Session(engine) as session:
            yield test_client, session
    app.dependency_overrides.clear()
    SQLModel.metadata.drop_all(engine)


def test_each_alert_type_appears_for_right_case_and_not_others(client_and_session):
    """Test each alert type appears for the correct case and messages include 'demo rule'."""
    client, session = client_and_session

    created = refresh_alerts(session, today=FIXED_TODAY)
    assert created == 3

    # Check breach alert
    res_breach = client.get("/api/v1/alerts?case_no=RB-2026-BREACH")
    assert res_breach.status_code == 200
    data_breach = res_breach.json()
    assert data_breach["total"] == 1
    alert_b = data_breach["items"][0]
    assert alert_b["type"] == "sla_breach"
    assert alert_b["priority"] == "high"
    assert alert_b["status"] == "open"
    assert "demo rule" in alert_b["message"]

    # Check warning alert
    res_warn = client.get("/api/v1/alerts?case_no=PG-2026-WARN")
    assert res_warn.status_code == 200
    data_warn = res_warn.json()
    assert data_warn["total"] == 1
    alert_w = data_warn["items"][0]
    assert alert_w["type"] == "sla_warning"
    assert alert_w["priority"] == "medium"
    assert alert_w["status"] == "open"
    assert "demo rule" in alert_w["message"]

    # Check reminder alert
    res_remind = client.get("/api/v1/alerts?case_no=RO-2026-REMIND")
    assert res_remind.status_code == 200
    data_remind = res_remind.json()
    assert data_remind["total"] == 1
    alert_r = data_remind["items"][0]
    assert alert_r["type"] == "pending_reminder"
    assert alert_r["priority"] == "low"
    assert alert_r["status"] == "open"
    assert "demo rule" in alert_r["message"]

    # Check normal and disposed cases have no alerts
    res_normal = client.get("/api/v1/alerts?case_no=OC-2026-NORMAL")
    assert res_normal.json()["total"] == 0

    res_disp = client.get("/api/v1/alerts?case_no=RB-2026-DISP")
    assert res_disp.json()["total"] == 0


def test_running_refresh_twice_creates_no_duplicates(client_and_session):
    """Test running refresh_alerts twice creates no duplicate alerts."""
    client, session = client_and_session

    first_run = refresh_alerts(session, today=FIXED_TODAY)
    assert first_run == 3

    second_run = refresh_alerts(session, today=FIXED_TODAY)
    assert second_run == 0

    res = client.get("/api/v1/alerts?status=open")
    assert res.json()["total"] == 3


def test_disposing_case_closes_its_alerts(client_and_session):
    """Test that disposing a case closes its existing open alerts."""
    client, session = client_and_session

    refresh_alerts(session, today=FIXED_TODAY)

    # Verify open alert on RB-2026-BREACH
    res = client.get("/api/v1/alerts?case_no=RB-2026-BREACH&status=open")
    assert res.json()["total"] == 1

    # Dispose the case
    case_b = session.exec(select(Case).where(Case.case_no == "RB-2026-BREACH")).first()
    case_b.status = CaseStatus.DISPOSED
    session.add(case_b)
    session.commit()

    # Re-evaluate alerts
    refresh_alerts(session, today=FIXED_TODAY)

    # Alert should now be closed
    res_open = client.get("/api/v1/alerts?case_no=RB-2026-BREACH&status=open")
    assert res_open.json()["total"] == 0

    res_closed = client.get("/api/v1/alerts?case_no=RB-2026-BREACH&status=closed")
    assert res_closed.json()["total"] == 1


def test_escalation_event_creates_escalation_alert(client_and_session):
    """Test that recording an escalation event automatically triggers an escalation alert."""
    client, session = client_and_session

    # Record escalation event on OC-2026-NORMAL
    payload = {
        "event_type": "escalation",
        "remarks": "Escalated for immediate coordinator attention",
    }
    event_res = client.post("/api/v1/cases/OC-2026-NORMAL/events", json=payload)
    assert event_res.status_code == 201

    # Check alert was created
    alerts_res = client.get("/api/v1/alerts?case_no=OC-2026-NORMAL&type=escalation")
    assert alerts_res.status_code == 200
    data = alerts_res.json()
    assert data["total"] == 1
    alert = data["items"][0]
    assert alert["type"] == "escalation"
    assert alert["priority"] == "high"
    assert alert["status"] == "open"
    assert "Escalated for immediate coordinator attention" in alert["message"]


def test_acknowledge_alert(client_and_session):
    """Test POST /alerts/{id}/ack sets status to 'acknowledged'."""
    client, session = client_and_session

    refresh_alerts(session, today=FIXED_TODAY)

    # Get an open alert
    alerts_res = client.get("/api/v1/alerts?status=open")
    alert_id = alerts_res.json()["items"][0]["id"]

    ack_res = client.post(f"/api/v1/alerts/{alert_id}/ack")
    assert ack_res.status_code == 200
    assert ack_res.json()["status"] == "acknowledged"

    # Query back to verify persistence
    verify_res = client.get(f"/api/v1/alerts?status=acknowledged")
    assert verify_res.json()["total"] == 1
    assert verify_res.json()["items"][0]["id"] == alert_id


def test_unknown_alert_id_returns_404(client_and_session):
    """Test POST /alerts/{id}/ack with non-existent ID returns 404 in shared error format."""
    client, session = client_and_session

    ack_res = client.post("/api/v1/alerts/99999/ack")
    assert ack_res.status_code == 404
    data = ack_res.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert "99999" in data["error"]["message"]


def test_alert_refresh_demo_endpoint(client_and_session):
    """Test POST /alerts/refresh helper endpoint."""
    client, session = client_and_session

    res = client.post("/api/v1/alerts/refresh")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "Alerts refreshed" in data["message"]
