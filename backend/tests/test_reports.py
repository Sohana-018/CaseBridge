from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import (
    Bureau,
    Case,
    CaseCategory,
    CaseStatus,
    ConfidenceBand,
    Institution,
    OverlapLink,
    Priority,
    Region,
    ReviewStatus,
)
from app.services.reports import get_dashboard_summary, get_dashboard_workload, get_report_by_kind
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
        # Two institutions across different regions
        inst_north = Institution(
            permanent_id="DEMO-1001",
            name="Institute Alpha",
            region=Region.NORTH,
        )
        inst_south = Institution(
            permanent_id="DEMO-1002",
            name="Institute Beta",
            region=Region.SOUTH,
        )
        session.add_all([inst_north, inst_south])
        session.commit()
        session.refresh(inst_north)
        session.refresh(inst_south)

        # 6 Cases:
        # 1. RB, pending, North, age 5 days (0-7), not overdue
        case_1 = Case(
            case_no="RB-2026-00001",
            institution_id=inst_north.id,
            bureau=Bureau.RB,
            category=CaseCategory.INFRASTRUCTURE,
            description="Infra issue 1",
            received_date=FIXED_TODAY - timedelta(days=5),
            status=CaseStatus.PENDING,
            expected_disposal_date=FIXED_TODAY + timedelta(days=20),
        )
        # 2. RB, under_process, North, age 20 days (8-30), overdue (by 2 days)
        case_2 = Case(
            case_no="RB-2026-00002",
            institution_id=inst_north.id,
            bureau=Bureau.RB,
            category=CaseCategory.FACULTY,
            description="Faculty issue 2",
            received_date=FIXED_TODAY - timedelta(days=20),
            status=CaseStatus.UNDER_PROCESS,
            expected_disposal_date=FIXED_TODAY - timedelta(days=2),
        )
        # 3. PGRC, disposed, South, age 45 days, expected_disposal_date was past, but disposed
        case_3 = Case(
            case_no="PG-2026-00003",
            institution_id=inst_south.id,
            bureau=Bureau.PGRC,
            category=CaseCategory.FEE_REFUND,
            description="Fee refund 3",
            received_date=FIXED_TODAY - timedelta(days=45),
            status=CaseStatus.DISPOSED,
            expected_disposal_date=FIXED_TODAY - timedelta(days=10),
        )
        # 4. RO, transferred, South, age 50 days (31-90), not overdue
        case_4 = Case(
            case_no="RO-2026-00004",
            institution_id=inst_south.id,
            bureau=Bureau.RO,
            category=CaseCategory.APPROVAL,
            description="Approval issue 4",
            received_date=FIXED_TODAY - timedelta(days=50),
            status=CaseStatus.TRANSFERRED,
            expected_disposal_date=FIXED_TODAY + timedelta(days=10),
        )
        # 5. OC, escalated, South, age 100 days (90+), overdue (by 5 days)
        case_5 = Case(
            case_no="OC-2026-00005",
            institution_id=inst_south.id,
            bureau=Bureau.OC,
            category=CaseCategory.EXAMINATION,
            description="Exam issue 5",
            received_date=FIXED_TODAY - timedelta(days=100),
            status=CaseStatus.ESCALATED,
            expected_disposal_date=FIXED_TODAY - timedelta(days=5),
        )
        # 6. PGRC, disposed, North, age 15 days, disposed
        case_6 = Case(
            case_no="PG-2026-00006",
            institution_id=inst_north.id,
            bureau=Bureau.PGRC,
            category=CaseCategory.OTHER,
            description="Other issue 6",
            received_date=FIXED_TODAY - timedelta(days=15),
            status=CaseStatus.DISPOSED,
            expected_disposal_date=FIXED_TODAY - timedelta(days=1),
        )

        session.add_all([case_1, case_2, case_3, case_4, case_5, case_6])
        session.commit()
        session.refresh(case_1)
        session.refresh(case_2)

        # 1 Open Overlap link between case 1 and case 2
        link = OverlapLink(
            case_a_id=case_1.id,
            case_b_id=case_2.id,
            confidence_band=ConfidenceBand.HIGH,
            review_status=ReviewStatus.OPEN,
        )
        session.add(link)
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


def test_dashboard_summary_matches_hand_counts(client_and_session):
    """Test dashboard summary matches hand-counted values."""
    client, session = client_and_session

    summary = get_dashboard_summary(session, today=FIXED_TODAY)
    assert summary["total"] == 6
    assert summary["pending"] == 1
    assert summary["under_process"] == 1
    assert summary["disposed"] == 2
    assert summary["transferred"] == 1
    assert summary["escalated"] == 1
    assert summary["overdue"] == 2  # case_2 and case_5
    assert summary["open_overlaps"] == 1

    # Also test API endpoint
    res = client.get("/api/v1/dashboard/summary")
    assert res.status_code == 200
    assert res.json()["total"] == 6


def test_sums_equal_total(client_and_session):
    """Test that the sum of bureau counts, sum of status counts, and sum of region counts all equal total."""
    client, session = client_and_session

    rep_bureau = get_report_by_kind(session, "bureau", today=FIXED_TODAY)
    rep_status = get_report_by_kind(session, "status", today=FIXED_TODAY)
    rep_region = get_report_by_kind(session, "region", today=FIXED_TODAY)

    total = 6
    assert rep_bureau["total"] == total
    assert rep_status["total"] == total
    assert rep_region["total"] == total

    # Sum of bureau counts
    bureau_sum = sum(item["count"] for item in rep_bureau["items"])
    assert bureau_sum == total

    # Sum of status counts
    status_sum = sum(item["count"] for item in rep_status["items"])
    assert status_sum == total

    # Sum of region counts
    region_sum = sum(item["count"] for item in rep_region["items"])
    assert region_sum == total


def test_ageing_buckets_sum_to_open_cases(client_and_session):
    """Test that ageing buckets sum to the number of open (non-disposed) cases."""
    client, session = client_and_session

    rep_ageing = get_report_by_kind(session, "ageing", today=FIXED_TODAY)
    open_cases_count = 4  # total 6 minus 2 disposed

    assert rep_ageing["total"] == open_cases_count

    bucket_sum = sum(item["count"] for item in rep_ageing["items"])
    assert bucket_sum == open_cases_count

    # Check individual buckets (each had 1 case)
    counts = {item["bucket"]: item["count"] for item in rep_ageing["items"]}
    assert counts["0-7"] == 1
    assert counts["8-30"] == 1
    assert counts["31-90"] == 1
    assert counts["90+"] == 1


def test_disposal_rate(client_and_session):
    """Test disposal report returns correct disposed count, total, and disposal_rate."""
    client, session = client_and_session

    rep_disposal = get_report_by_kind(session, "disposal", today=FIXED_TODAY)
    assert rep_disposal["total"] == 6
    assert rep_disposal["disposed"] == 2
    assert rep_disposal["disposal_rate"] == round(2 / 6, 4)


def test_dashboard_workload(client_and_session):
    """Test dashboard workload returns correct per-bureau open and overdue numbers."""
    client, session = client_and_session

    workload = get_dashboard_workload(session, today=FIXED_TODAY)
    b_map = {item["bureau"]: item for item in workload}

    assert b_map["RB"]["total"] == 2
    assert b_map["RB"]["open"] == 2
    assert b_map["RB"]["overdue"] == 1

    assert b_map["PGRC"]["total"] == 2
    assert b_map["PGRC"]["open"] == 0
    assert b_map["PGRC"]["overdue"] == 0

    assert b_map["RO"]["total"] == 1
    assert b_map["RO"]["open"] == 1
    assert b_map["RO"]["overdue"] == 0

    assert b_map["OC"]["total"] == 1
    assert b_map["OC"]["open"] == 1
    assert b_map["OC"]["overdue"] == 1


def test_unknown_report_kind_returns_404(client_and_session):
    """Test unknown kind returns 404 in shared error format."""
    client, _ = client_and_session

    res = client.get("/api/v1/reports/unknown_kind")
    assert res.status_code == 404
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert "unknown_kind" in data["error"]["message"]


def test_empty_database_returns_zeros_without_errors():
    """Test an empty database returns zeros without dividing by zero or erroring."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        # 1. Summary
        summary = get_dashboard_summary(session, today=FIXED_TODAY)
        assert summary["total"] == 0
        assert summary["pending"] == 0
        assert summary["overdue"] == 0
        assert summary["open_overlaps"] == 0

        # 2. Workload
        workload = get_dashboard_workload(session, today=FIXED_TODAY)
        for item in workload:
            assert item["total"] == 0
            assert item["open"] == 0
            assert item["overdue"] == 0

        # 3. Reports
        for kind in ["bureau", "status", "region", "institution", "ageing", "disposal", "overlap_outcomes"]:
            rep = get_report_by_kind(session, kind, today=FIXED_TODAY)
            assert rep["total"] == 0
            if kind == "disposal":
                assert rep["disposal_rate"] == 0.0
                assert rep["disposed"] == 0
