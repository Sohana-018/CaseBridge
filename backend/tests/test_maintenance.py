import os
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.auth_utils import seed_default_users_and_config
from app.db import get_session
from app.main import app
from app.models import Bureau, CaseCategory, Institution, Region
from app.permissions import UserPayload
from app.routers.auth import create_token
from scripts.import_csv import import_csv


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
            permanent_id="MAINT-INST-001",
            name="Maintenance Test Institute",
            region=Region.NORTH,
        )
        session.add(inst)
        session.commit()

    def get_session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def test_maintenance_mode_on_blocks_mutating_requests(client: TestClient, monkeypatch):
    """When SYSTEM_MAINTENANCE_MODE=true, mutating requests return 503 with standard error body."""
    monkeypatch.setenv("SYSTEM_MAINTENANCE_MODE", "true")
    admin_token = get_token("administrator", "admin")
    coord_token = get_token("coordinator", "coordinator")

    # 1. POST /api/v1/cases (Registration write) -> 503
    payload = {
        "institution_id": 1,
        "bureau": "RB",
        "category": "infrastructure",
        "description": "Attempting complaint submission during maintenance",
    }
    res = client.post("/api/v1/cases", json=payload, headers={"Authorization": f"Bearer {coord_token}"})
    assert res.status_code == 503
    data = res.json()
    assert data["error"]["code"] == "MAINTENANCE_MODE"
    assert "System is currently in maintenance mode" in data["error"]["message"]
    assert data["error"]["details"]["method"] == "POST"

    # 2. PUT /api/v1/admin/config -> 503
    res_put = client.put(
        "/api/v1/admin/config",
        json={"sla_warn_days": "5"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_put.status_code == 503
    assert res_put.json()["error"]["code"] == "MAINTENANCE_MODE"

    # 3. PATCH /api/v1/cases/1/status -> 503
    res_patch = client.patch(
        "/api/v1/cases/1/status",
        json={"status": "under_process", "remarks": "Status change during maint"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_patch.status_code == 503
    assert res_patch.json()["error"]["code"] == "MAINTENANCE_MODE"

    # 4. POST /api/v1/admin/users (User creation write) -> 503
    user_payload = {
        "username": "newuser",
        "name": "New User",
        "role": "bureau_officer",
        "email": "newuser@aicte.gov.in",
        "password": "Password123!",
    }
    res_user = client.post(
        "/api/v1/admin/users",
        json=user_payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_user.status_code == 503
    assert res_user.json()["error"]["code"] == "MAINTENANCE_MODE"


def test_maintenance_mode_on_allows_login_endpoints(client: TestClient, monkeypatch):
    """When SYSTEM_MAINTENANCE_MODE=true, only exact login endpoints in allowlist succeed."""
    monkeypatch.setenv("SYSTEM_MAINTENANCE_MODE", "true")
    monkeypatch.setenv("ALLOW_DEMO_LOGIN", "true")

    # 1. Real login endpoint allowed
    res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    assert res.status_code == 200
    assert "token" in res.json()

    # 2. Mock login endpoint allowed
    res_mock = client.post("/api/v1/auth/mock-login", json={"role": "coordinator"})
    assert res_mock.status_code == 200
    assert "token" in res_mock.json()


def test_maintenance_mode_on_allows_get_requests(client: TestClient, monkeypatch):
    """When SYSTEM_MAINTENANCE_MODE=true, GET requests (read-only queries) remain fully functional."""
    monkeypatch.setenv("SYSTEM_MAINTENANCE_MODE", "true")
    admin_token = get_token("administrator", "admin")

    # 1. Health summary GET
    res = client.get("/api/v1/admin/health-summary", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200

    # 2. Dashboard summary GET
    res_dash = client.get("/api/v1/dashboard/summary", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_dash.status_code == 200

    # 3. Institutions GET
    res_inst = client.get("/api/v1/institutions", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_inst.status_code == 200


def test_maintenance_mode_on_suspends_import_script(monkeypatch):
    """When SYSTEM_MAINTENANCE_MODE=true, import_csv aborts without making database writes."""
    monkeypatch.setenv("SYSTEM_MAINTENANCE_MODE", "true")
    res = import_csv()
    assert res == {"institutions": 0, "cases": 0, "events": 0}


def test_maintenance_mode_off_normal_behavior(client: TestClient, monkeypatch):
    """When SYSTEM_MAINTENANCE_MODE is false or unset, mutations succeed normally."""
    monkeypatch.setenv("SYSTEM_MAINTENANCE_MODE", "false")
    admin_token = get_token("administrator", "admin")

    res = client.put(
        "/api/v1/admin/config",
        json={"configs": {"sla_warn_days": "4"}},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res.status_code == 200
    assert res.json()["message"] == "Configuration updated successfully"
