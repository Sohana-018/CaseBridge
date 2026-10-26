from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.auth_utils import seed_default_users_and_config
from app.db import get_session
from app.main import app
from app.models import Bureau, Case, CaseCategory, CaseEvent, CaseStatus, EventType, Institution, Priority, Region
from app.permissions import UserPayload
from app.routers.auth import create_token


def get_token(role: str, username: str = None) -> str:
    user = UserPayload(
        role=role,
        name=f"Test {role}",
        username=username or role,
    )
    return create_token(user)


@pytest.fixture(name="client")
def client_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        seed_default_users_and_config(session)

        inst = Institution(
            permanent_id="ADMIN-TEST-INST",
            name="Admin Institute of Technology",
            region=Region.NORTH,
        )
        session.add(inst)
        session.commit()
        session.refresh(inst)

        c = Case(
            case_no="RB-2026-99999",
            institution_id=inst.id,
            bureau=Bureau.RB,
            category=CaseCategory.INFRASTRUCTURE,
            description="Test case for admin audit logs",
            received_date=date(2026, 1, 15),
            status=CaseStatus.UNDER_PROCESS,
            priority=Priority.HIGH,
        )
        session.add(c)
        session.commit()
        session.refresh(c)

        ev = CaseEvent(
            case_id=c.id,
            actor="Admin Tester",
            bureau=Bureau.RB,
            event_type=EventType.STATUS_CHANGE,
            from_status=CaseStatus.PENDING,
            to_status=CaseStatus.UNDER_PROCESS,
            remarks="Status promoted to under_process",
        )
        session.add(ev)
        session.commit()

    def get_session_override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = get_session_override
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_real_login_success(client: TestClient):
    res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    assert res.status_code == 200
    data = res.json()
    assert "token" in data
    assert data["user"]["role"] == "administrator"
    assert data["user"]["username"] == "admin"


def test_real_login_invalid_password(client: TestClient):
    res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "wrongpassword"})
    assert res.status_code == 403


def test_real_login_unknown_user(client: TestClient):
    res = client.post("/api/v1/auth/login", json={"username": "nonexistent", "password": "any"})
    assert res.status_code == 403


def test_admin_access_forbidden_for_non_admin(client: TestClient):
    """Ensure all non-administrator roles are rejected with 403 on admin endpoints."""
    non_admin_roles = ["coordinator", "bureau_officer", "senior_management"]
    admin_endpoints = [
        ("GET", "/api/v1/admin/users"),
        ("POST", "/api/v1/admin/users"),
        ("GET", "/api/v1/admin/health-summary"),
        ("GET", "/api/v1/admin/audit-logs"),
    ]
    for role in non_admin_roles:
        token = get_token(role)
        headers = {"Authorization": f"Bearer {token}"}
        for method, endpoint in admin_endpoints:
            if method == "GET":
                res = client.get(endpoint, headers=headers)
            else:
                res = client.post(endpoint, headers=headers, json={"username": "dummy"})
            assert res.status_code == 403, f"Role {role} should be forbidden on {method} {endpoint}, got {res.status_code}"
            assert res.json()["error"]["code"] == "FORBIDDEN"



def test_admin_list_users(client: TestClient):
    token = get_token("administrator")
    res = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    users = res.json()
    assert len(users) >= 5
    usernames = [u["username"] for u in users]
    assert "admin" in usernames
    assert "coordinator" in usernames
    assert "officer_rb" in usernames


def test_admin_create_user(client: TestClient):
    token = get_token("administrator")
    res = client.post(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "username": "new_officer",
            "name": "New RB Officer",
            "role": "bureau_officer",
            "bureau": "RB",
            "email": "new.officer@aicte.gov.in",
            "password": "officerpass123",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["username"] == "new_officer"
    assert data["role"] == "bureau_officer"
    assert data["bureau"] == "RB"

    # Now verify login with the new user credentials
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": "new_officer", "password": "officerpass123"},
    )
    assert login_res.status_code == 200
    assert login_res.json()["user"]["name"] == "New RB Officer"


def test_admin_duplicate_user_conflict(client: TestClient):
    token = get_token("administrator")
    res = client.post(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "username": "admin",
            "name": "Duplicate Admin",
            "role": "administrator",
            "password": "pass",
        },
    )
    assert res.status_code == 409


def test_admin_toggle_user_status(client: TestClient):
    token = get_token("administrator")
    users = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"}).json()
    target = next(u for u in users if u["username"] == "officer_rb")

    # Deactivate officer_rb
    patch_res = client.patch(
        f"/api/v1/admin/users/{target['id']}/status",
        headers={"Authorization": f"Bearer {token}"},
        json={"is_active": False},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["is_active"] is False

    # Login should now fail with 403
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": "officer_rb", "password": "officer123"},
    )
    assert login_res.status_code == 403

    # Reactivate officer_rb
    patch_res2 = client.patch(
        f"/api/v1/admin/users/{target['id']}/status",
        headers={"Authorization": f"Bearer {token}"},
        json={"is_active": True},
    )
    assert patch_res2.status_code == 200
    assert patch_res2.json()["is_active"] is True


def test_admin_reset_password(client: TestClient):
    token = get_token("administrator")
    users = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"}).json()
    target = next(u for u in users if u["username"] == "management")

    reset_res = client.post(
        f"/api/v1/admin/users/{target['id']}/reset-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"new_password": "brandnewpassword"},
    )
    assert reset_res.status_code == 200

    # Old password fails
    fail_res = client.post(
        "/api/v1/auth/login",
        json={"username": "management", "password": "mgmt123"},
    )
    assert fail_res.status_code == 403

    # New password succeeds
    ok_res = client.post(
        "/api/v1/auth/login",
        json={"username": "management", "password": "brandnewpassword"},
    )
    assert ok_res.status_code == 200


def test_admin_config_get_and_update(client: TestClient):
    token = get_token("administrator")
    cfg_res = client.get("/api/v1/admin/config", headers={"Authorization": f"Bearer {token}"})
    assert cfg_res.status_code == 200
    configs = cfg_res.json()
    assert any(c["key"] == "sla_warn_days" for c in configs)

    update_res = client.put(
        "/api/v1/admin/config",
        headers={"Authorization": f"Bearer {token}"},
        json={"configs": {"sla_warn_days": "5", "custom_notice": "AICTE Maintenance"}},
    )
    assert update_res.status_code == 200

    cfg_res2 = client.get("/api/v1/admin/config", headers={"Authorization": f"Bearer {token}"})
    cfg_dict = {c["key"]: c["value"] for c in cfg_res2.json()}
    assert cfg_dict["sla_warn_days"] == "5"
    assert cfg_dict["custom_notice"] == "AICTE Maintenance"


def test_admin_audit_logs_and_health(client: TestClient):
    token = get_token("administrator")
    logs_res = client.get("/api/v1/admin/audit-logs", headers={"Authorization": f"Bearer {token}"})
    assert logs_res.status_code == 200
    logs = logs_res.json()
    assert len(logs) >= 1
    assert logs[0]["event_type"] == "status_change"

    health_res = client.get("/api/v1/admin/health-summary", headers={"Authorization": f"Bearer {token}"})
    assert health_res.status_code == 200
    health = health_res.json()
    assert health["total_cases"] >= 1
    assert health["total_users"] >= 5
    assert health["db_status"].startswith("Operational")
