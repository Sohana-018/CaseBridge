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

        # 1 Open Overlap link (HIGH) between case 1 and case 2
        link = OverlapLink(
            case_a_id=case_1.id,
            case_b_id=case_2.id,
            confidence_band=ConfidenceBand.HIGH,
            review_status=ReviewStatus.OPEN,
        )
        # 1 Open Overlap link (LOW) between case 4 and case 5 - must NOT count towards open_overlaps
        link_low = OverlapLink(
            case_a_id=case_4.id,
            case_b_id=case_5.id,
            confidence_band=ConfidenceBand.LOW,
            review_status=ReviewStatus.OPEN,
        )
        session.add_all([link, link_low])
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
    """Test dashboard summary matches hand-counted values derived directly from fixture cases:

    Fixture Cases Derivation:
    - case_1: RB, PENDING, North, age 5d, expected +20d (open, not overdue)
    - case_2: RB, UNDER_PROCESS, North, age 20d, expected -2d (open, OVERDUE)
    - case_3: PGRC, DISPOSED, South, age 45d, expected -10d (disposed, not overdue)
    - case_4: RO, TRANSFERRED, South, age 50d, expected +10d (open, not overdue)
    - case_5: OC, ESCALATED, South, age 100d, expected -5d (open, OVERDUE)
    - case_6: PGRC, DISPOSED, North, age 15d, expected -1d (disposed, not overdue)

    Derived Counts:
    - Total cases = 6 (case_1 through case_6)
    - Pending = 1 (case_1)
    - Under process = 1 (case_2)
    - Disposed = 2 (case_3 and case_6)
    - Transferred = 1 (case_4)
    - Escalated = 1 (case_5)
    - Overdue = 2 (case_2 and case_5; case_3/6 are past expected date but excluded because status == DISPOSED)

    Derivation of open_overlaps (Why 2 became 1):
    The fixture populates 2 open OverlapLink rows:
      1. link: case_1 <-> case_2, confidence_band=HIGH, review_status=OPEN
      2. link_low: case_4 <-> case_5, confidence_band=LOW, review_status=OPEN
    Raw SQL count of open links is 2. However, the dashboard open_overlaps KPI is defined
    in PRD Section 9.4 and Review Item 12 to count only ACTIONABLE overlaps:
      confidence_band IN (ConfidenceBand.HIGH, ConfidenceBand.MEDIUM)
    Low-band overlaps are informatory (same institution, cross-bureau) and do not warrant
    dashboard alerts or inclusion in open_overlaps.
    Thus, link_low is excluded: open_overlaps = 1 (HIGH only). 2 became 1.
    """
    client, session = client_and_session

    summary = get_dashboard_summary(session, today=FIXED_TODAY)
    assert summary["total"] == 6
    assert summary["pending"] == 1
    assert summary["under_process"] == 1
    assert summary["disposed"] == 2
    assert summary["transferred"] == 1
    assert summary["escalated"] == 1
    assert summary["overdue"] == 2  # case_2 and case_5
    assert summary["open_overlaps"] == 1  # Actionable High/Medium only (link_low excluded)

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

    # Sum of bureau counts: RB (2) + PGRC (2) + RO (1) + OC (1) = 6
    bureau_sum = sum(item["count"] for item in rep_bureau["items"])
    assert bureau_sum == total

    # Sum of status counts: pending (1) + under_process (1) + disposed (2) + transferred (1) + escalated (1) = 6
    status_sum = sum(item["count"] for item in rep_status["items"])
    assert status_sum == total

    # Sum of region counts: North (3: case_1, case_2, case_6) + South (3: case_3, case_4, case_5) = 6
    region_sum = sum(item["count"] for item in rep_region["items"])
    assert region_sum == total


def test_ageing_buckets_sum_to_open_cases(client_and_session):
    """Test that ageing buckets sum to the number of open (non-disposed) cases.

    Derivation of open_cases_count (Why 5 became 4):
    Total cases = 6.
    Disposed cases = 2 (case_3 and case_6).
    Open cases = Total (6) - Disposed (2) = 4:
      - case_1 (PENDING)
      - case_2 (UNDER_PROCESS)
      - case_4 (TRANSFERRED)
      - case_5 (ESCALATED)
    A naive count assuming only case_3 was disposed would yield 6 - 1 = 5 open cases.
    However, case_6 is ALSO disposed (CaseStatus.DISPOSED).
    Therefore, the true number of open cases is 4. 5 became 4.

    Derivation of Ageing Buckets for the 4 Open Cases (today = FIXED_TODAY):
      - 0-7 days:   case_1 (received FIXED_TODAY - 5d, age 5)   => count = 1
      - 8-30 days:  case_2 (received FIXED_TODAY - 20d, age 20) => count = 1
      - 31-90 days: case_4 (received FIXED_TODAY - 50d, age 50) => count = 1
      - 90+ days:   case_5 (received FIXED_TODAY - 100d, age 100) => count = 1
      Sum = 1 + 1 + 1 + 1 = 4.
    """
    client, session = client_and_session

    rep_ageing = get_report_by_kind(session, "ageing", today=FIXED_TODAY)
    open_cases_count = 4  # total 6 minus 2 disposed (case_3 and case_6)

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


def test_export_report_csv_all_kinds_and_sql_parity(client_and_session):
    """Test CSV export for all 7 report kinds:
    - Verifies HTTP 200, content-type and filename header
    - Parses CSV and verifies sum of counts equals report total
    - Cross-checks 3 totals via direct SQL queries
    """
    import csv
    import io
    from sqlmodel import select, func

    client, session = client_and_session

    # 1. Direct SQL baseline recomputations
    sql_total_cases = session.exec(select(func.count(Case.id))).one()
    assert sql_total_cases == 6

    sql_open_cases = session.exec(
        select(func.count(Case.id)).where(Case.status != CaseStatus.DISPOSED)
    ).one()
    assert sql_open_cases == 4

    sql_overlap_links = session.exec(select(func.count(OverlapLink.id))).one()
    assert sql_overlap_links == 2

    kinds = ["bureau", "status", "region", "institution", "ageing", "disposal", "overlap_outcomes"]

    for kind in kinds:
        # Fetch json report
        json_res = client.get(f"/api/v1/reports/{kind}")
        assert json_res.status_code == 200
        json_data = json_res.json()
        expected_total = json_data["total"]

        # Fetch CSV export
        csv_res = client.get(f"/api/v1/reports/{kind}/csv")
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers["content-type"]
        assert f'filename="casebridge_report_{kind}.csv"' in csv_res.headers["content-disposition"]

        # Parse CSV rows
        reader = csv.DictReader(io.StringIO(csv_res.text))
        rows = list(reader)

        assert "count" in reader.fieldnames
        assert "percentage" in reader.fieldnames

        csv_sum = sum(int(row["count"]) for row in rows)
        assert csv_sum == expected_total

    # Verify specific SQL parity
    bureau_rep = client.get("/api/v1/reports/bureau").json()
    assert bureau_rep["total"] == sql_total_cases

    ageing_rep = client.get("/api/v1/reports/ageing").json()
    assert ageing_rep["total"] == sql_open_cases

    overlap_rep = client.get("/api/v1/reports/overlap_outcomes").json()
    assert overlap_rep["total"] == sql_overlap_links


def test_unknown_report_csv_returns_404(client_and_session):
    """Test unknown report kind returns 404 for CSV export."""
    client, _ = client_and_session
    res = client.get("/api/v1/reports/nonexistent/csv")
    assert res.status_code == 404
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"


def test_periodic_report_monthly_with_mixed_statuses(client_and_session):
    """Test monthly periodic report aggregating cases with mixed statuses in October 2026."""
    client, _ = client_and_session

    res = client.get("/api/v1/reports/periodic?period=monthly&year=2026&month=10")
    assert res.status_code == 200
    data = res.json()

    assert data["period"] == "monthly"
    assert data["period_label"] == "October 2026"
    assert data["start_date"] == "2026-10-01"
    assert data["end_date"] == "2026-10-31"

    # In October 2026: case_1 (2026-10-19), case_2 (2026-10-04), case_6 (2026-10-09) => 3 cases
    assert data["total_cases"] == 3
    assert data["summary"]["total_cases"] == 3
    assert data["summary"]["disposed_cases"] == 1
    assert data["summary"]["open_cases"] == 2
    assert data["summary"]["disposal_rate"] == 33.3

    # Mixed statuses: pending (1), under_process (1), disposed (1)
    status_map = {item["status"]: item["count"] for item in data["by_status"]}
    assert status_map["pending"] == 1
    assert status_map["under_process"] == 1
    assert status_map["disposed"] == 1
    assert status_map["transferred"] == 0
    assert status_map["escalated"] == 0

    # Categories: infrastructure (1), faculty (1), other (1)
    cat_map = {item["category"]: item["count"] for item in data["by_category"]}
    assert cat_map["infrastructure"] == 1
    assert cat_map["faculty"] == 1
    assert cat_map["other"] == 1

    # Institution: DEMO-1001 (Institute Alpha) has all 3 cases
    insts = data["by_institution"]
    assert len(insts) == 1
    assert insts[0]["permanent_id"] == "DEMO-1001"
    assert insts[0]["count"] == 3
    assert insts[0]["percentage"] == 100.0

    # Resolution statistics
    res_stats = data["resolution_stats"]
    assert res_stats["total_cases"] == 3
    assert res_stats["resolved_cases"] == 1
    assert res_stats["open_cases"] == 2
    assert res_stats["avg_days"] >= 0
    assert res_stats["min_days"] >= 0
    assert res_stats["max_days"] >= 0
    assert res_stats["within_sla_count"] == 1
    assert res_stats["sla_compliance_rate"] == 100.0


def test_periodic_report_daily_and_boundary_dates(client_and_session):
    """Test daily report and custom boundary dates inclusion."""
    client, _ = client_and_session

    # 1. Daily period matching exactly case_1 (received on 2026-10-19)
    res_daily = client.get("/api/v1/reports/periodic?period=daily&date=2026-10-19")
    assert res_daily.status_code == 200
    daily_data = res_daily.json()
    assert daily_data["period"] == "daily"
    assert daily_data["total_cases"] == 1
    status_map = {item["status"]: item["count"] for item in daily_data["by_status"]}
    assert status_map["pending"] == 1

    # 2. Boundary dates: custom date range from 2026-10-04 to 2026-10-09
    # case_2 received on 2026-10-04 (boundary start)
    # case_6 received on 2026-10-09 (boundary end)
    res_boundary = client.get(
        "/api/v1/reports/periodic?period=custom&start_date=2026-10-04&end_date=2026-10-09"
    )
    assert res_boundary.status_code == 200
    b_data = res_boundary.json()
    assert b_data["total_cases"] == 2
    assert b_data["start_date"] == "2026-10-04"
    assert b_data["end_date"] == "2026-10-09"
    b_status_map = {item["status"]: item["count"] for item in b_data["by_status"]}
    assert b_status_map["under_process"] == 1
    assert b_status_map["disposed"] == 1


def test_periodic_report_quarterly(client_and_session):
    """Test quarterly report aggregations across Q3 and Q4 2026."""
    client, _ = client_and_session

    # Q4 2026 (Oct 1 - Dec 31): case_1, case_2, case_6 => 3 cases
    res_q4 = client.get("/api/v1/reports/periodic?period=quarterly&year=2026&quarter=4")
    assert res_q4.status_code == 200
    q4_data = res_q4.json()
    assert q4_data["period"] == "quarterly"
    assert q4_data["period_label"] == "Q4 2026"
    assert q4_data["start_date"] == "2026-10-01"
    assert q4_data["end_date"] == "2026-12-31"
    assert q4_data["total_cases"] == 3

    # Q3 2026 (Jul 1 - Sep 30): case_3 (Sep 9), case_4 (Sep 4), case_5 (Jul 16) => 3 cases
    res_q3 = client.get("/api/v1/reports/periodic?period=quarterly&year=2026&quarter=3")
    assert res_q3.status_code == 200
    q3_data = res_q3.json()
    assert q3_data["period"] == "quarterly"
    assert q3_data["period_label"] == "Q3 2026"
    assert q3_data["start_date"] == "2026-07-01"
    assert q3_data["end_date"] == "2026-09-30"
    assert q3_data["total_cases"] == 3
    q3_status = {item["status"]: item["count"] for item in q3_data["by_status"]}
    assert q3_status["disposed"] == 1  # case_3
    assert q3_status["transferred"] == 1  # case_4
    assert q3_status["escalated"] == 1  # case_5


def test_periodic_report_empty_period(client_and_session):
    """Test periodic report over an empty date range returns safe zeroed metrics without division errors."""
    client, _ = client_and_session

    # Query a future date with no cases
    res = client.get("/api/v1/reports/periodic?period=daily&date=2029-01-01")
    assert res.status_code == 200
    data = res.json()

    assert data["total_cases"] == 0
    assert data["summary"]["total_cases"] == 0
    assert data["summary"]["disposed_cases"] == 0
    assert data["summary"]["open_cases"] == 0
    assert data["summary"]["disposal_rate"] == 0.0

    # All status counts 0
    for s in data["by_status"]:
        assert s["count"] == 0
        assert s["percentage"] == 0.0

    # All category counts 0
    for c in data["by_category"]:
        assert c["count"] == 0
        assert c["percentage"] == 0.0

    assert data["by_institution"] == []

    # Resolution stats zeroed safely
    res_stats = data["resolution_stats"]
    assert res_stats["total_cases"] == 0
    assert res_stats["resolved_cases"] == 0
    assert res_stats["open_cases"] == 0
    assert res_stats["avg_days"] == 0.0
    assert res_stats["median_days"] == 0.0
    assert res_stats["min_days"] == 0
    assert res_stats["max_days"] == 0
    assert res_stats["within_sla_count"] == 0
    assert res_stats["sla_compliance_rate"] == 0.0


def test_periodic_report_csv_export(client_and_session):
    """Test periodic report CSV download endpoint."""
    client, _ = client_and_session

    res = client.get("/api/v1/reports/periodic/csv?period=monthly&year=2026&month=10")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "casebridge_periodic_report_monthly_2026-10-01_2026-10-31.csv" in res.headers["content-disposition"]

    content = res.text
    assert "CASEBRIDGE PERIODIC PERFORMANCE REPORT" in content
    assert "RESOLUTION & SLA PERFORMANCE METRICS" in content
    assert "CASES BY STATUS" in content
    assert "CASES BY CATEGORY" in content
    assert "CASES BY INSTITUTION" in content
    assert "Average Resolution Time (days)" in content
    assert "SLA Compliance Rate (%)" in content


def test_periodic_report_validation_errors(client_and_session):
    """Test invalid input validation for periodic report endpoints."""
    client, _ = client_and_session

    # Invalid period
    res = client.get("/api/v1/reports/periodic?period=yearly")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    # Invalid month
    res = client.get("/api/v1/reports/periodic?period=monthly&month=13")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    # Invalid quarter
    res = client.get("/api/v1/reports/periodic?period=quarterly&quarter=5")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    # Inverted date range
    res = client.get("/api/v1/reports/periodic?period=custom&start_date=2026-10-20&end_date=2026-10-10")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"


