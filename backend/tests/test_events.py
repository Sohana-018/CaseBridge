from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import Bureau, Case, CaseCategory, CaseEvent, CaseStatus, Institution, Priority, Region


from tests.test_auth import get_coordinator_token


@pytest.fixture(name="client")
def client_fixture():
    """Create in-memory SQLite database and test client with session override."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    # Seed test institution and initial case
    with Session(engine) as session:
        inst = Institution(
            permanent_id="DEMO-TEST-100",
            name="Testing Institute of Technology",
            region=Region.CENTRAL,
        )
        session.add(inst)
        session.commit()
        session.refresh(inst)

        test_case = Case(
            case_no="RB-2026-00001",
            institution_id=inst.id,
            bureau=Bureau.RB,
            category=CaseCategory.INFRASTRUCTURE,
            description="Initial test case description",
            received_date=date(2026, 9, 1),
            status=CaseStatus.PENDING,
            priority=Priority.MEDIUM,
        )
        session.add(test_case)
        session.commit()

    def get_test_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_test_session
    with TestClient(app) as test_client:
        token = get_coordinator_token()
        test_client.headers["Authorization"] = f"Bearer {token}"
        yield test_client
    app.dependency_overrides.clear()
    SQLModel.metadata.drop_all(engine)


def test_status_change_event(client: TestClient):
    """Test status_change: requires to_status; sets status and updates last_action."""
    payload = {
        "event_type": "status_change",
        "to_status": "under_process",
    }
    response = client.post("/api/v1/cases/RB-2026-00001/events", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data["event_type"] == "status_change"
    assert data["from_status"] == "pending"
    assert data["to_status"] == "under_process"
    assert data["from_bureau"] == "RB"
    assert data["actor"] == "Demo Coordinator"
    assert data["ts"] is not None


def test_transfer_event(client: TestClient):
    """Test transfer RB to PGRC records from_bureau, to_bureau, timestamp, and status='transferred'."""
    # Transfer from RB to PGRC
    payload = {
        "event_type": "transfer",
        "to_bureau": "PGRC",
    }
    response = client.post("/api/v1/cases/RB-2026-00001/events", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data["event_type"] == "transfer"
    assert data["from_bureau"] == "RB"
    assert data["to_bureau"] == "PGRC"
    assert data["to_status"] == "transferred"
    assert data["ts"] is not None

    # Retrieve timeline to confirm last_action update
    events_res = client.get("/api/v1/cases/RB-2026-00001/events")
    assert events_res.status_code == 200
    events = events_res.json()
    assert len(events) == 1
    assert events[0]["remarks"] == "Transferred from RB to PGRC"
    assert events[0]["from_bureau"] == "RB"
    assert events[0]["to_bureau"] == "PGRC"


def test_escalation_event(client: TestClient):
    """Test escalation: requires remarks; sets status to 'escalated'."""
    payload = {
        "event_type": "escalation",
        "remarks": "SLA warning breached; escalation to coordinator",
    }
    response = client.post("/api/v1/cases/RB-2026-00001/events", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data["event_type"] == "escalation"
    assert data["to_status"] == "escalated"
    assert data["remarks"] == "SLA warning breached; escalation to coordinator"


def test_remark_event(client: TestClient):
    """Test remark: requires remarks; does not alter status or bureau."""
    payload = {
        "event_type": "remark",
        "remarks": "Institution submitted inquiry clarification documents",
    }
    response = client.post("/api/v1/cases/RB-2026-00001/events", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data["event_type"] == "remark"
    assert data["from_status"] == "pending"
    assert data["to_status"] is None
    assert data["remarks"] == "Institution submitted inquiry clarification documents"


def test_timeline_order_and_immutability(client: TestClient):
    """Test that events stay in chronological order and none are overwritten."""
    # 1. status_change
    client.post("/api/v1/cases/RB-2026-00001/events", json={"event_type": "status_change", "to_status": "under_process"})
    # 2. transfer
    client.post("/api/v1/cases/RB-2026-00001/events", json={"event_type": "transfer", "to_bureau": "PGRC"})
    # 3. escalation
    client.post("/api/v1/cases/RB-2026-00001/events", json={"event_type": "escalation", "remarks": "Urgent review required"})
    # 4. remark
    client.post("/api/v1/cases/RB-2026-00001/events", json={"event_type": "remark", "remarks": "Meeting scheduled"})

    response = client.get("/api/v1/cases/RB-2026-00001/events")
    assert response.status_code == 200
    events = response.json()

    assert len(events) == 4
    event_types = [e["event_type"] for e in events]
    assert event_types == ["status_change", "transfer", "escalation", "remark"]

    # Ensure IDs are incremental and chronological
    event_ids = [e["id"] for e in events]
    assert event_ids == sorted(event_ids)


def test_invalid_input_error_format(client: TestClient):
    """Test validation errors return shared error format."""
    # Missing to_status on status_change
    res1 = client.post("/api/v1/cases/RB-2026-00001/events", json={"event_type": "status_change"})
    assert res1.status_code == 422
    err1 = res1.json()
    assert "error" in err1
    assert err1["error"]["code"] == "VALIDATION_ERROR"

    # Missing to_bureau on transfer
    res2 = client.post("/api/v1/cases/RB-2026-00001/events", json={"event_type": "transfer"})
    assert res2.status_code == 422
    assert res2.json()["error"]["code"] == "VALIDATION_ERROR"

    # Transfer to same bureau
    res3 = client.post("/api/v1/cases/RB-2026-00001/events", json={"event_type": "transfer", "to_bureau": "RB"})
    assert res3.status_code == 422
    assert res3.json()["error"]["code"] == "VALIDATION_ERROR"

    # Missing remarks on escalation
    res4 = client.post("/api/v1/cases/RB-2026-00001/events", json={"event_type": "escalation", "remarks": ""})
    assert res4.status_code == 422
    assert res4.json()["error"]["code"] == "VALIDATION_ERROR"

    # Missing remarks on remark
    res5 = client.post("/api/v1/cases/RB-2026-00001/events", json={"event_type": "remark", "remarks": "   "})
    assert res5.status_code == 422
    assert res5.json()["error"]["code"] == "VALIDATION_ERROR"

    # Disallowed event types (created, link, review)
    for disallowed_type in ["created", "link", "review"]:
        res = client.post("/api/v1/cases/RB-2026-00001/events", json={"event_type": disallowed_type})
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"


def test_unknown_case_returns_404(client: TestClient):
    """Test unknown case returns 404 in shared error format."""
    res_get = client.get("/api/v1/cases/UNKNOWN-CASE-99999/events")
    assert res_get.status_code == 404
    data_get = res_get.json()
    assert "error" in data_get
    assert data_get["error"]["code"] == "NOT_FOUND"

    res_post = client.post(
        "/api/v1/cases/UNKNOWN-CASE-99999/events",
        json={"event_type": "remark", "remarks": "test"},
    )
    assert res_post.status_code == 404
    data_post = res_post.json()
    assert "error" in data_post
    assert data_post["error"]["code"] == "NOT_FOUND"


def test_put_and_delete_return_405(client: TestClient):
    """Test PUT and DELETE on events return HTTP 405 Method Not Allowed."""
    # On collection route
    res_put_col = client.put("/api/v1/cases/RB-2026-00001/events", json={"remarks": "edit"})
    assert res_put_col.status_code == 405

    res_del_col = client.delete("/api/v1/cases/RB-2026-00001/events")
    assert res_del_col.status_code == 405

    # On item route
    res_put_item = client.put("/api/v1/cases/RB-2026-00001/events/1", json={"remarks": "edit"})
    assert res_put_item.status_code == 405

    res_del_item = client.delete("/api/v1/cases/RB-2026-00001/events/1")
    assert res_del_item.status_code == 405
