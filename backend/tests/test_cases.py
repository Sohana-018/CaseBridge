from datetime import date, timedelta
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
    """Create in-memory SQLite database, seed institutions and 5 cases, and provide client."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    today = date.today()

    with Session(engine) as session:
        inst_north = Institution(
            permanent_id="DEMO-1001",
            name="Northern Engineering College",
            address="1 Civil Lines, Chandigarh",
            region=Region.NORTH,
            state="Punjab",
            type="Engineering",
        )
        inst_south = Institution(
            permanent_id="DEMO-1002",
            name="Southern Medical University",
            address="50 MG Road, Chennai",
            region=Region.SOUTH,
            state="Tamil Nadu",
            type="Medical",
        )
        session.add_all([inst_north, inst_south])
        session.commit()
        session.refresh(inst_north)
        session.refresh(inst_south)

        # 5 Seed Cases:
        # Case 1: RB, Northern, pending, expected date was 2 days ago -> OVERDUE (expected < today, status != disposed)
        case_1 = Case(
            case_no="RB-2026-00001",
            institution_id=inst_north.id,
            bureau=Bureau.RB,
            category=CaseCategory.INFRASTRUCTURE,
            description="Northern lab construction grievance",
            received_date=today - timedelta(days=15),
            status=CaseStatus.PENDING,
            assigned_officer="Officer North RB (demo)",
            last_action="Site notice issued",
            last_action_date=today - timedelta(days=5),
            next_action="Inspect facility",
            expected_disposal_date=today - timedelta(days=2),
            priority=Priority.HIGH,
        )

        # Case 2: PGRC, Northern, under_process, expected in 20 days -> NOT OVERDUE
        case_2 = Case(
            case_no="PG-2026-00002",
            institution_id=inst_north.id,
            bureau=Bureau.PGRC,
            category=CaseCategory.FACULTY,
            description="Faculty salary dispute",
            received_date=today - timedelta(days=5),
            status=CaseStatus.UNDER_PROCESS,
            assigned_officer="Officer North PG (demo)",
            last_action="College reply received",
            last_action_date=today - timedelta(days=1),
            next_action="Hearings scheduled",
            expected_disposal_date=today + timedelta(days=20),
            priority=Priority.MEDIUM,
        )

        # Case 3: RO, Southern, disposed, expected date was 10 days ago -> NOT OVERDUE (status == disposed!)
        case_3 = Case(
            case_no="RO-2026-00003",
            institution_id=inst_south.id,
            bureau=Bureau.RO,
            category=CaseCategory.APPROVAL,
            description="Annual intake quota revision",
            received_date=today - timedelta(days=40),
            status=CaseStatus.DISPOSED,
            assigned_officer="Officer South RO (demo)",
            last_action="Disposal order issued",
            last_action_date=today - timedelta(days=12),
            next_action=None,
            expected_disposal_date=today - timedelta(days=10),
            priority=Priority.LOW,
        )

        # Case 4: OC, Southern, escalated, expected date was 5 days ago -> OVERDUE (expected < today, status != disposed)
        case_4 = Case(
            case_no="OC-2026-00004",
            institution_id=inst_south.id,
            bureau=Bureau.OC,
            category=CaseCategory.FEE_REFUND,
            description="Fee refund delay for international students",
            received_date=today - timedelta(days=25),
            status=CaseStatus.ESCALATED,
            assigned_officer="Officer South OC (demo)",
            last_action="Escalation memo dispatched",
            last_action_date=today - timedelta(days=3),
            next_action="Coordinator decision pending",
            expected_disposal_date=today - timedelta(days=5),
            priority=Priority.HIGH,
        )

        # Case 5: PGRC, Southern, transferred, expected in 10 days -> NOT OVERDUE
        case_5 = Case(
            case_no="PG-2026-00005",
            institution_id=inst_south.id,
            bureau=Bureau.PGRC,
            category=CaseCategory.EXAMINATION,
            description="Examination center malpractice inquiry",
            received_date=today - timedelta(days=12),
            status=CaseStatus.TRANSFERRED,
            assigned_officer="Officer South PG (demo)",
            last_action="Transferred to regional office",
            last_action_date=today - timedelta(days=2),
            next_action="Awaiting intake acknowledgement",
            expected_disposal_date=today + timedelta(days=10),
            priority=Priority.MEDIUM,
        )

        session.add_all([case_1, case_2, case_3, case_4, case_5])
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


def test_search_cases_by_case_no(client_and_session):
    """Test searching cases by case_no returns exact matching case."""
    client, _ = client_and_session

    res = client.get("/api/v1/cases?query=RB-2026-00001")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["case_no"] == "RB-2026-00001"


def test_search_cases_by_institution_name(client_and_session):
    """Test searching cases by institution name."""
    client, _ = client_and_session

    res = client.get("/api/v1/cases?query=Northern Engineering")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    case_nos = {c["case_no"] for c in data["items"]}
    assert case_nos == {"RB-2026-00001", "PG-2026-00002"}


def test_search_cases_by_permanent_id(client_and_session):
    """Test searching cases by institution permanent_id."""
    client, _ = client_and_session

    res = client.get("/api/v1/cases?query=DEMO-1002")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 3
    case_nos = {c["case_no"] for c in data["items"]}
    assert case_nos == {"RO-2026-00003", "OC-2026-00004", "PG-2026-00005"}


def test_combined_filters(client_and_session):
    """Test combinable filters return hand-counted results."""
    client, _ = client_and_session

    # 1. Bureau filter
    res_bureau = client.get("/api/v1/cases?bureau=PGRC")
    assert res_bureau.status_code == 200
    assert res_bureau.json()["total"] == 2

    # 2. Region filter
    res_region = client.get("/api/v1/cases?region=North")
    assert res_region.status_code == 200
    assert res_region.json()["total"] == 2

    # 3. Status filter
    res_status = client.get("/api/v1/cases?status=disposed")
    assert res_status.status_code == 200
    assert res_status.json()["total"] == 1
    assert res_status.json()["items"][0]["case_no"] == "RO-2026-00003"

    # 4. Combinable: region=South and bureau=PGRC
    res_comb1 = client.get("/api/v1/cases?region=South&bureau=PGRC")
    assert res_comb1.status_code == 200
    assert res_comb1.json()["total"] == 1
    assert res_comb1.json()["items"][0]["case_no"] == "PG-2026-00005"

    # 5. Combinable: region=North and bureau=RB and category=infrastructure
    res_comb2 = client.get("/api/v1/cases?region=North&bureau=RB&category=infrastructure")
    assert res_comb2.status_code == 200
    assert res_comb2.json()["total"] == 1
    assert res_comb2.json()["items"][0]["case_no"] == "RB-2026-00001"


def test_empty_results_on_unmatched_filters(client_and_session):
    """Test that a filter combination with no matches returns empty list and total 0."""
    client, _ = client_and_session

    res = client.get("/api/v1/cases?region=North&bureau=OC")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_pagination(client_and_session):
    """Test pagination over cases list."""
    client, _ = client_and_session

    res_p1 = client.get("/api/v1/cases?page=1&page_size=2")
    assert res_p1.status_code == 200
    data_p1 = res_p1.json()
    assert data_p1["total"] == 5
    assert len(data_p1["items"]) == 2
    assert data_p1["page"] == 1

    res_p3 = client.get("/api/v1/cases?page=3&page_size=2")
    assert res_p3.status_code == 200
    data_p3 = res_p3.json()
    assert data_p3["total"] == 5
    assert len(data_p3["items"]) == 1
    assert data_p3["page"] == 3


def test_overdue_filter_matches_derived_rule(client_and_session):
    """Test overdue filter: expected_disposal_date < today and status != disposed."""
    client, _ = client_and_session

    # overdue=true: exactly case_1 and case_4 (case_3 is disposed, so not overdue)
    res_overdue = client.get("/api/v1/cases?overdue=true")
    assert res_overdue.status_code == 200
    data_overdue = res_overdue.json()
    assert data_overdue["total"] == 2
    overdue_nos = {c["case_no"] for c in data_overdue["items"]}
    assert overdue_nos == {"RB-2026-00001", "OC-2026-00004"}
    for item in data_overdue["items"]:
        assert item["overdue"] is True

    # overdue=false: exactly 3 cases (case_2, case_3, case_5)
    res_not_overdue = client.get("/api/v1/cases?overdue=false")
    assert res_not_overdue.status_code == 200
    data_not_overdue = res_not_overdue.json()
    assert data_not_overdue["total"] == 3
    not_overdue_nos = {c["case_no"] for c in data_not_overdue["items"]}
    assert not_overdue_nos == {"PG-2026-00002", "RO-2026-00003", "PG-2026-00005"}
    for item in data_not_overdue["items"]:
        assert item["overdue"] is False


def test_single_case_detail_and_resolved_institution(client_and_session):
    """Test GET /cases/{case_no} returns case object with resolved institution details."""
    client, _ = client_and_session

    res = client.get("/api/v1/cases/RB-2026-00001")
    assert res.status_code == 200
    data = res.json()
    assert data["case_no"] == "RB-2026-00001"
    assert data["bureau"] == "RB"
    assert data["category"] == "infrastructure"
    assert data["status"] == "pending"
    assert data["overdue"] is True
    assert "description" in data

    # Institution name and region always come from institutions table
    assert "institution" in data
    assert data["institution"]["permanent_id"] == "DEMO-1001"
    assert data["institution"]["name"] == "Northern Engineering College"
    assert data["institution"]["region"] == "North"


def test_unknown_case_returns_404(client_and_session):
    """Test unknown case returns 404 in shared error format."""
    client, _ = client_and_session

    res = client.get("/api/v1/cases/UNKNOWN-CASE-99999")
    assert res.status_code == 404
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert "UNKNOWN-CASE-99999" in data["error"]["message"]


def test_officer_summary_only_for_other_bureaus_cases(client_and_session):
    """Test Bureau Officer gets summary-only fields for another bureau's cases, full for own bureau."""
    client, _ = client_and_session

    # Login as RB Officer
    token = get_auth_token("bureau_officer", bureau="RB", name="RB Officer (demo)")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Own bureau case detail: full details
    res_own = client.get("/api/v1/cases/RB-2026-00001", headers=headers)
    assert res_own.status_code == 200
    data_own = res_own.json()
    assert "description" in data_own
    assert "assigned_officer" in data_own
    assert "institution" in data_own
    assert data_own["institution"]["name"] == "Northern Engineering College"

    # 2. Other bureau case detail (PGRC): summary-only fields
    res_other = client.get("/api/v1/cases/PG-2026-00002", headers=headers)
    assert res_other.status_code == 200
    data_other = res_other.json()
    assert set(data_other.keys()) == {"case_no", "bureau", "category", "status", "received_date"}
    assert data_other["case_no"] == "PG-2026-00002"
    assert data_other["bureau"] == "PGRC"
    assert "description" not in data_other
    assert "assigned_officer" not in data_other
    assert "last_action" not in data_other

    # 3. Case list: own bureau case full, other bureau cases summary-only
    res_list = client.get("/api/v1/cases", headers=headers)
    assert res_list.status_code == 200
    items = res_list.json()["items"]
    items_by_no = {i["case_no"]: i for i in items}

    assert "description" in items_by_no["RB-2026-00001"]
    assert set(items_by_no["PG-2026-00002"].keys()) == {"case_no", "bureau", "category", "status", "received_date"}
    assert set(items_by_no["RO-2026-00003"].keys()) == {"case_no", "bureau", "category", "status", "received_date"}
