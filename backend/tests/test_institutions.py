from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import Bureau, Case, CaseCategory, CaseStatus, Institution, Priority, Region
from tests.test_auth import get_auth_token, get_coordinator_token


@pytest.fixture(name="client_and_session")
def client_and_session_fixture():
    """Create in-memory SQLite database, seed institutions and cases, and return client and session."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        inst1 = Institution(
            permanent_id="DEMO-1001",
            name="Delhi Institute of Engineering",
            address="10 Ring Road, New Delhi",
            region=Region.NORTH,
            state="Delhi",
            type="Engineering",
        )
        inst2 = Institution(
            permanent_id="DEMO-1002",
            name="Bangalore Academy of Sciences",
            address="45 Tech Boulevard, Bangalore",
            region=Region.SOUTH,
            state="Karnataka",
            type="Science",
        )
        inst3 = Institution(
            permanent_id="DEMO-1003",
            name="Mumbai Polytechnic College",
            address="88 Sea View Road, Mumbai",
            region=Region.WEST,
            state="Maharashtra",
            type="Polytechnic",
        )
        session.add_all([inst1, inst2, inst3])
        session.commit()
        session.refresh(inst1)
        session.refresh(inst2)
        session.refresh(inst3)

        # Seed cases on DEMO-1001
        case1 = Case(
            case_no="RB-2026-00001",
            institution_id=inst1.id,
            bureau=Bureau.RB,
            category=CaseCategory.INFRASTRUCTURE,
            description="Infra lab building inspection delay",
            received_date=date(2026, 9, 1),
            status=CaseStatus.UNDER_PROCESS,
            assigned_officer="Officer A (demo)",
            last_action="Site inspection conducted",
            last_action_date=date(2026, 9, 15),
            next_action="Review site report",
            expected_disposal_date=date(2026, 11, 1),
            priority=Priority.HIGH,
        )
        case2 = Case(
            case_no="PG-2026-00001",
            institution_id=inst1.id,
            bureau=Bureau.PGRC,
            category=CaseCategory.FACULTY,
            description="Student grievance regarding faculty shortage",
            received_date=date(2026, 9, 10),
            status=CaseStatus.PENDING,
            assigned_officer="Officer B (demo)",
            last_action="Notice dispatched to college",
            last_action_date=date(2026, 9, 12),
            next_action="Await compliance report",
            expected_disposal_date=date(2026, 11, 15),
            priority=Priority.MEDIUM,
        )
        # Seed case on DEMO-1002
        case3 = Case(
            case_no="RO-2026-00002",
            institution_id=inst2.id,
            bureau=Bureau.RO,
            category=CaseCategory.ADMISSION,
            description="Admission quota compliance check",
            received_date=date(2026, 8, 15),
            status=CaseStatus.DISPOSED,
            assigned_officer="Officer C (demo)",
            last_action="Disposal order uploaded",
            last_action_date=date(2026, 9, 5),
            next_action=None,
            expected_disposal_date=date(2026, 9, 10),
            priority=Priority.LOW,
        )
        session.add_all([case1, case2, case3])
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


def test_list_institutions_search_by_name(client_and_session):
    """Test searching institutions by name returns correct matches."""
    client, _ = client_and_session

    res = client.get("/api/v1/institutions?query=Delhi")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["permanent_id"] == "DEMO-1001"
    assert data["items"][0]["name"] == "Delhi Institute of Engineering"


def test_list_institutions_search_by_permanent_id(client_and_session):
    """Test searching institutions by permanent_id returns correct match."""
    client, _ = client_and_session

    res = client.get("/api/v1/institutions?query=1003")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["permanent_id"] == "DEMO-1003"
    assert data["items"][0]["name"] == "Mumbai Polytechnic College"


def test_list_institutions_region_filter(client_and_session):
    """Test filtering institutions by region."""
    client, _ = client_and_session

    res_north = client.get("/api/v1/institutions?region=North")
    assert res_north.status_code == 200
    assert res_north.json()["total"] == 1
    assert res_north.json()["items"][0]["region"] == "North"

    # Region with no institutions returns empty list and total 0
    res_east = client.get("/api/v1/institutions?region=East")
    assert res_east.status_code == 200
    assert res_east.json()["total"] == 0
    assert res_east.json()["items"] == []


def test_list_institutions_pagination(client_and_session):
    """Test pagination on institution list."""
    client, _ = client_and_session

    # Page 1 with page_size=2
    res_p1 = client.get("/api/v1/institutions?page=1&page_size=2")
    assert res_p1.status_code == 200
    data_p1 = res_p1.json()
    assert data_p1["total"] == 3
    assert len(data_p1["items"]) == 2
    assert data_p1["page"] == 1
    assert data_p1["page_size"] == 2

    # Page 2 with page_size=2
    res_p2 = client.get("/api/v1/institutions?page=2&page_size=2")
    assert res_p2.status_code == 200
    data_p2 = res_p2.json()
    assert data_p2["total"] == 3
    assert len(data_p2["items"]) == 1
    assert data_p2["page"] == 2


def test_institution_detail_success(client_and_session):
    """Test GET /institutions/{permanent_id} returns profile, cases, and open overlaps."""
    client, _ = client_and_session

    res = client.get("/api/v1/institutions/DEMO-1001")
    assert res.status_code == 200
    data = res.json()
    assert data["permanent_id"] == "DEMO-1001"
    assert data["name"] == "Delhi Institute of Engineering"
    assert data["region"] == "North"
    assert data["open_overlaps"] == []
    assert len(data["cases"]) == 2

    # Coordinator sees full details of all cases
    c0 = data["cases"][0]
    assert "case_no" in c0
    assert "description" in c0
    assert "assigned_officer" in c0
    assert "institution" in c0
    assert c0["institution"]["name"] == "Delhi Institute of Engineering"


def test_institution_detail_unknown_returns_404(client_and_session):
    """Test unknown institution returns 404 in shared error format."""
    client, _ = client_and_session

    res = client.get("/api/v1/institutions/NONEXISTENT-999")
    assert res.status_code == 404
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert "NONEXISTENT-999" in data["error"]["message"]


def test_institution_detail_officer_cross_bureau_visibility(client_and_session):
    """Test that a Bureau Officer sees full details only for own bureau cases in institution profile."""
    client, _ = client_and_session

    # RB Officer login
    rb_token = get_auth_token("bureau_officer", bureau="RB", name="RB Officer (demo)")
    headers = {"Authorization": f"Bearer {rb_token}"}

    res = client.get("/api/v1/institutions/DEMO-1001", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["cases"]) == 2

    case_map = {c["case_no"]: c for c in data["cases"]}

    # RB case has full details
    rb_case = case_map["RB-2026-00001"]
    assert "description" in rb_case
    assert "assigned_officer" in rb_case
    assert "institution" in rb_case
    assert rb_case["institution"]["name"] == "Delhi Institute of Engineering"
    assert rb_case["assigned_officer"] == "Officer A (demo)"

    # PGRC case has ONLY summary fields (case_no, bureau, category, status, received_date)
    pg_case = case_map["PG-2026-00001"]
    assert set(pg_case.keys()) == {"case_no", "bureau", "category", "status", "received_date"}
    assert pg_case["case_no"] == "PG-2026-00001"
    assert pg_case["bureau"] == "PGRC"
    assert pg_case["category"] == "faculty"
    assert pg_case["status"] == "pending"
    assert "description" not in pg_case
    assert "assigned_officer" not in pg_case
