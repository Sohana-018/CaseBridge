from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import Bureau, Case, CaseCategory, CaseStatus, Institution, Priority, Region
from app.permissions import UserPayload
from app.routers.auth import create_token


def get_coordinator_token() -> str:
    """Helper returning a signed JWT token for the coordinator role."""
    user = UserPayload(
        role="coordinator",
        name="Demo Coordinator",
        bureau=None,
    )
    return create_token(user)


def get_auth_token(role: str, bureau: str = None, name: str = None) -> str:
    """Helper returning a signed JWT token for any specified role and bureau."""
    if not name:
        if role == "bureau_officer":
            name = f"{bureau} Officer (demo)"
        elif role == "coordinator":
            name = "Demo Coordinator"
        elif role == "senior_management":
            name = "Senior Management (demo)"
        elif role == "administrator":
            name = "Demo Administrator"
        else:
            name = "Demo User"

    user = UserPayload(
        role=role,
        bureau=bureau,
        name=name,
    )
    return create_token(user)


@pytest.fixture(name="client")
def client_fixture():
    """Create in-memory SQLite database and test client with seeded test case."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        inst = Institution(
            permanent_id="DEMO-AUTH-INST",
            name="Auth Testing Institute",
            region=Region.NORTH,
        )
        session.add(inst)
        session.commit()
        session.refresh(inst)

        # Seed an RB case
        case_rb = Case(
            case_no="RB-2026-00001",
            institution_id=inst.id,
            bureau=Bureau.RB,
            category=CaseCategory.INFRASTRUCTURE,
            description="RB Test Case for Access Control",
            received_date=date(2026, 9, 1),
            status=CaseStatus.PENDING,
            priority=Priority.MEDIUM,
        )
        session.add(case_rb)
        session.commit()

    def get_test_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_test_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    SQLModel.metadata.drop_all(engine)


def test_mock_login_disabled_by_default(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    """Test that mock-login and demo-accounts are rejected with 403 when ALLOW_DEMO_LOGIN is unset or false."""
    monkeypatch.delenv("ALLOW_DEMO_LOGIN", raising=False)
    res = client.post("/api/v1/auth/mock-login", json={"role": "coordinator"})
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"

    res_demo = client.get("/api/v1/auth/demo-accounts")
    assert res_demo.status_code == 403
    assert res_demo.json()["error"]["code"] == "FORBIDDEN"


def test_mock_login_admin_impossible_even_when_demo_enabled(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    """Test that administrator role can NEVER be issued via mock-login even with ALLOW_DEMO_LOGIN=true."""
    monkeypatch.setenv("ALLOW_DEMO_LOGIN", "true")
    res = client.post("/api/v1/auth/mock-login", json={"role": "administrator"})
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"
    assert "Administrator" in res.json()["error"]["message"]


def test_each_role_can_login(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    """Test that non-admin roles can log in through POST /api/v1/auth/mock-login when ALLOW_DEMO_LOGIN=true."""
    monkeypatch.setenv("ALLOW_DEMO_LOGIN", "true")

    # 1. bureau_officer with bureau
    res1 = client.post("/api/v1/auth/mock-login", json={"role": "bureau_officer", "bureau": "RB"})
    assert res1.status_code == 200
    data1 = res1.json()
    assert "token" in data1
    assert data1["user"]["role"] == "bureau_officer"
    assert data1["user"]["bureau"] == "RB"

    # 2. coordinator
    res2 = client.post("/api/v1/auth/mock-login", json={"role": "coordinator"})
    assert res2.status_code == 200
    data2 = res2.json()
    assert "token" in data2
    assert data2["user"]["role"] == "coordinator"
    assert data2["user"]["bureau"] is None

    # 3. senior_management
    res3 = client.post("/api/v1/auth/mock-login", json={"role": "senior_management"})
    assert res3.status_code == 200
    data3 = res3.json()
    assert "token" in data3
    assert data3["user"]["role"] == "senior_management"

    # 4. administrator via mock-login must be rejected with 403
    res4 = client.post("/api/v1/auth/mock-login", json={"role": "administrator"})
    assert res4.status_code == 403

    # 5. demo-accounts returns list when enabled
    res5 = client.get("/api/v1/auth/demo-accounts")
    assert res5.status_code == 200
    accounts = res5.json()
    assert len(accounts) >= 5
    assert all("password_hint" in acc for acc in accounts)


def test_officer_without_bureau_fails(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    """Test that a bureau_officer login without a bureau returns 422 VALIDATION_ERROR."""
    monkeypatch.setenv("ALLOW_DEMO_LOGIN", "true")
    res = client.post("/api/v1/auth/mock-login", json={"role": "bureau_officer"})
    assert res.status_code == 422
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "VALIDATION_ERROR"

    res_empty = client.post("/api/v1/auth/mock-login", json={"role": "bureau_officer", "bureau": ""})
    assert res_empty.status_code == 422
    assert res_empty.json()["error"]["code"] == "VALIDATION_ERROR"


def test_invalid_role_fails(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    """Test that an invalid role or unknown bureau returns 422 VALIDATION_ERROR."""
    monkeypatch.setenv("ALLOW_DEMO_LOGIN", "true")
    res_bad_role = client.post("/api/v1/auth/mock-login", json={"role": "invalid_role"})
    assert res_bad_role.status_code == 422
    assert res_bad_role.json()["error"]["code"] == "VALIDATION_ERROR"

    res_bad_bureau = client.post("/api/v1/auth/mock-login", json={"role": "bureau_officer", "bureau": "UNKNOWN"})
    assert res_bad_bureau.status_code == 422
    assert res_bad_bureau.json()["error"]["code"] == "VALIDATION_ERROR"


def test_me_returns_right_user(client: TestClient):
    """Test GET /api/v1/me returns the decoded user profile."""
    token = get_auth_token("bureau_officer", bureau="PGRC", name="P. Sharma (demo)")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/v1/me", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["role"] == "bureau_officer"
    assert data["bureau"] == "PGRC"
    assert data["name"] == "P. Sharma (demo)"


def test_missing_or_invalid_token_returns_403(client: TestClient):
    """Test that missing or invalid Authorization header returns 403 FORBIDDEN."""
    # 1. Missing header
    res_missing = client.get("/api/v1/me")
    assert res_missing.status_code == 403
    data_missing = res_missing.json()
    assert "error" in data_missing
    assert data_missing["error"]["code"] == "FORBIDDEN"

    # 2. Invalid header format
    res_bad_format = client.get("/api/v1/me", headers={"Authorization": "Basic 12345"})
    assert res_bad_format.status_code == 403
    assert res_bad_format.json()["error"]["code"] == "FORBIDDEN"

    # 3. Invalid token signature
    res_invalid_token = client.get("/api/v1/me", headers={"Authorization": "Bearer invalid.jwt.token"})
    assert res_invalid_token.status_code == 403
    assert res_invalid_token.json()["error"]["code"] == "FORBIDDEN"


def test_officer_cannot_post_event_on_another_bureau_case(client: TestClient):
    """Test that a PGRC officer cannot post an event on an RB case (returns 403 FORBIDDEN)."""
    pgrc_token = get_auth_token("bureau_officer", bureau="PGRC")
    headers = {"Authorization": f"Bearer {pgrc_token}"}

    payload = {
        "event_type": "remark",
        "remarks": "Attempting cross-bureau mutation",
    }
    res = client.post("/api/v1/cases/RB-2026-00001/events", json=payload, headers=headers)
    assert res.status_code == 403
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "FORBIDDEN"
    assert "Bureau officers can only post events on their own Bureau's cases" in data["error"]["message"]


def test_officer_can_post_event_on_own_bureau_case(client: TestClient):
    """Test that an RB officer can post an event on an RB case and actor is recorded."""
    officer_name = "K. Raman (RB)"
    rb_token = get_auth_token("bureau_officer", bureau="RB", name=officer_name)
    headers = {"Authorization": f"Bearer {rb_token}"}

    payload = {
        "event_type": "status_change",
        "to_status": "under_process",
    }
    res = client.post("/api/v1/cases/RB-2026-00001/events", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert data["event_type"] == "status_change"
    assert data["actor"] == officer_name
    assert data["to_status"] == "under_process"


def test_coordinator_can_post_event_on_any_bureau_case(client: TestClient):
    """Test that a coordinator can post an event on an RB case."""
    coordinator_name = "Lead Coordinator"
    coord_token = get_auth_token("coordinator", name=coordinator_name)
    headers = {"Authorization": f"Bearer {coord_token}"}

    payload = {
        "event_type": "remark",
        "remarks": "Coordinator review remark",
    }
    res = client.post("/api/v1/cases/RB-2026-00001/events", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert data["actor"] == coordinator_name
    assert data["remarks"] == "Coordinator review remark"


def test_senior_management_cannot_post_event(client: TestClient):
    """Test that senior management gets 403 FORBIDDEN when attempting to post an event."""
    sm_token = get_auth_token("senior_management")
    headers = {"Authorization": f"Bearer {sm_token}"}

    payload = {
        "event_type": "remark",
        "remarks": "Senior management remark attempt",
    }
    res = client.post("/api/v1/cases/RB-2026-00001/events", json=payload, headers=headers)
    assert res.status_code == 403
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "FORBIDDEN"


def test_administrator_cannot_post_event(client: TestClient):
    """Test that administrator gets 403 FORBIDDEN when attempting to post case events."""
    admin_token = get_auth_token("administrator")
    headers = {"Authorization": f"Bearer {admin_token}"}

    payload = {
        "event_type": "remark",
        "remarks": "Admin attempting to modify case event",
    }
    res = client.post("/api/v1/cases/RB-2026-00001/events", json=payload, headers=headers)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"


def test_senior_management_cannot_ack_alert(client: TestClient):
    """Test that senior management gets 403 FORBIDDEN when acknowledging or refreshing alerts."""
    sm_token = get_auth_token("senior_management")
    headers = {"Authorization": f"Bearer {sm_token}"}

    res_ack = client.post("/api/v1/alerts/1/ack", headers=headers)
    assert res_ack.status_code == 403
    assert res_ack.json()["error"]["code"] == "FORBIDDEN"

    res_ref = client.post("/api/v1/alerts/refresh", headers=headers)
    assert res_ref.status_code == 403
    assert res_ref.json()["error"]["code"] == "FORBIDDEN"
