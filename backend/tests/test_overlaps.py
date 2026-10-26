from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import (
    Alert,
    AlertType,
    Bureau,
    Case,
    CaseCategory,
    CaseEvent,
    CaseStatus,
    ConfidenceBand,
    EventType,
    Institution,
    OverlapLink,
    Priority,
    Region,
    ReviewStatus,
)
from app.services.overlap import score_pair, text_similarity
from tests.test_auth import get_auth_token, get_coordinator_token

TODAY = date(2026, 10, 24)
AUTH = {"Authorization": f"Bearer {get_coordinator_token()}"}


def auth_for(role: str, bureau: str = None) -> dict:
    return {"Authorization": f"Bearer {get_auth_token(role, bureau)}"}


@pytest.fixture(name="client_and_session")
def client_and_session_fixture():
    """In-memory DB seeded with a true overlap plus hard cases."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        inst = Institution(
            permanent_id="DEMO-1042",
            name="Example Institute of Technology (demo)",
            region=Region.SOUTH,
            state="Karnataka",
        )
        other_inst = Institution(
            permanent_id="DEMO-9999",
            name="Unrelated Institute (demo)",
            region=Region.NORTH,
        )
        session.add(inst)
        session.add(other_inst)
        session.commit()
        session.refresh(inst)
        session.refresh(other_inst)

        # True overlap: same institution, different bureau, same category.
        c_pg = Case(
            case_no="PG-2026-00104",
            institution_id=inst.id,
            bureau=Bureau.PGRC,
            category=CaseCategory.FACULTY,
            description="Complaint about unqualified faculty in the mechanical department.",
            received_date=TODAY - timedelta(days=42),
            status=CaseStatus.UNDER_PROCESS,
            priority=Priority.MEDIUM,
        )
        c_rb = Case(
            case_no="RB-2026-00219",
            institution_id=inst.id,
            bureau=Bureau.RB,
            category=CaseCategory.FACULTY,
            description="Regulatory inspection regarding mechanical department faculty cadre ratio.",
            received_date=TODAY - timedelta(days=28),
            status=CaseStatus.PENDING,
            priority=Priority.HIGH,
        )
        # Related category (faculty + other), still a real overlap signal.
        c_oc = Case(
            case_no="OC-2026-00308",
            institution_id=inst.id,
            bureau=Bureau.OC,
            category=CaseCategory.OTHER,
            description="Complaint about faculty workload and department staffing records.",
            received_date=TODAY - timedelta(days=30),
            status=CaseStatus.PENDING,
            priority=Priority.LOW,
        )
        # Low signal: different, unrelated category and unrelated wording.
        c_pg_infra = Case(
            case_no="PG-2026-00321",
            institution_id=inst.id,
            bureau=Bureau.PGRC,
            category=CaseCategory.INFRASTRUCTURE,
            description="Scholarship portal crash blocks disbursement for final year students.",
            received_date=TODAY - timedelta(days=12),
            status=CaseStatus.UNDER_PROCESS,
            priority=Priority.LOW,
        )
        # Hard case: disposed cases never enter the queue.
        c_disposed = Case(
            case_no="RB-2026-00310",
            institution_id=inst.id,
            bureau=Bureau.RB,
            category=CaseCategory.FACULTY,
            description="Closed complaint about mechanical department faculty records.",
            received_date=TODAY - timedelta(days=90),
            status=CaseStatus.DISPOSED,
            priority=Priority.LOW,
        )
        # Different institution: never a candidate.
        c_other_inst = Case(
            case_no="RB-2026-00401",
            institution_id=other_inst.id,
            bureau=Bureau.RB,
            category=CaseCategory.FACULTY,
            description="Complaint about unqualified faculty in the mechanical department.",
            received_date=TODAY - timedelta(days=20),
            status=CaseStatus.PENDING,
            priority=Priority.LOW,
        )
        session.add_all([c_pg, c_rb, c_oc, c_pg_infra, c_disposed, c_other_inst])
        session.commit()
        for case in (c_pg, c_rb, c_oc, c_pg_infra, c_disposed, c_other_inst):
            session.refresh(case)

        def override_session():
            yield session

        app.dependency_overrides[get_session] = override_session
        client = TestClient(app)
        yield client, session
        app.dependency_overrides.clear()


def _link(session: Session, case_a: str, case_b: str) -> OverlapLink:
    ids = {}
    for case_no in (case_a, case_b):
        case = session.exec(select(Case).where(Case.case_no == case_no)).first()
        ids[case_no] = case.id
    pair = (min(ids.values()), max(ids.values()))
    link = session.exec(
        select(OverlapLink).where(
            OverlapLink.case_a_id == pair[0],
            OverlapLink.case_b_id == pair[1],
        )
    ).first()
    assert link is not None, f"expected overlap link for {case_a} / {case_b}"
    return link


def test_scan_creates_explainable_overlap_pairs(client_and_session):
    client, session = client_and_session

    response = client.post("/api/v1/overlaps/scan", headers=AUTH)
    assert response.status_code == 200
    assert response.json() == {"created": 5}

    link = _link(session, "PG-2026-00104", "RB-2026-00219")
    assert link.confidence_band == ConfidenceBand.HIGH
    assert link.review_status == ReviewStatus.OPEN
    assert "same_permanent_id" in link.reasons
    assert "same_category" in link.reasons
    assert "date_proximity 14 days" in link.reasons
    assert any(reason.startswith("text_similarity") for reason in link.reasons)

    # Highest confidence pair is listed first.
    listing = client.get("/api/v1/overlaps", headers=AUTH)
    assert listing.status_code == 200
    payload = listing.json()
    assert payload["total"] == 5
    assert payload["items"][0]["case_a"]["case_no"] in {"PG-2026-00104", "RB-2026-00219"}
    assert payload["items"][0]["band"] == "high"

    detail = client.get(f"/api/v1/overlaps/{link.id}", headers=AUTH)
    assert detail.status_code == 200
    body = detail.json()
    assert body["reasons"] == link.reasons
    assert {body["case_a"]["case_no"], body["case_b"]["case_no"]} == {
        "PG-2026-00104",
        "RB-2026-00219",
    }
    assert body["reviewed_by"] is None


def test_scan_filters_and_is_idempotent(client_and_session):
    client, session = client_and_session
    assert client.post("/api/v1/overlaps/scan", headers=AUTH).json()["created"] == 5

    # Re-running never duplicates links or overwrites review decisions.
    assert client.post("/api/v1/overlaps/scan", headers=AUTH).json()["created"] == 0
    assert len(session.exec(select(OverlapLink)).all()) == 5

    high = client.get("/api/v1/overlaps?band=high", headers=AUTH).json()
    assert high["total"] == 1
    medium = client.get("/api/v1/overlaps?band=medium", headers=AUTH).json()
    assert medium["total"] == 1
    low = client.get("/api/v1/overlaps?band=low", headers=AUTH).json()
    assert low["total"] == 3

    page_two = client.get("/api/v1/overlaps?page=2&page_size=2", headers=AUTH).json()
    assert page_two["page"] == 2
    assert page_two["page_size"] == 2
    assert len(page_two["items"]) == 2


def test_scan_excludes_disposed_same_bureau_and_cross_institution(client_and_session):
    client, session = client_and_session
    client.post("/api/v1/overlaps/scan", headers=AUTH)

    case_ids = {c.case_no: c.id for c in session.exec(select(Case)).all()}
    pairs = {(link.case_a_id, link.case_b_id) for link in session.exec(select(OverlapLink)).all()}

    def pair_of(a: str, b: str) -> tuple[int, int]:
        return (min(case_ids[a], case_ids[b]), max(case_ids[a], case_ids[b]))

    # Same bureau (PGRC/PGRC) -> not a cross-bureau overlap.
    assert pair_of("PG-2026-00104", "PG-2026-00321") not in pairs
    # Disposed hard case -> excluded.
    assert pair_of("RB-2026-00219", "RB-2026-00310") not in pairs
    # Different institution -> excluded.
    assert pair_of("PG-2026-00104", "RB-2026-00401") not in pairs
    # Genuine cross-bureau pair -> present.
    assert pair_of("PG-2026-00104", "RB-2026-00219") in pairs


def test_scan_alerts_only_for_actionable_bands(client_and_session):
    client, session = client_and_session
    client.post("/api/v1/overlaps/scan", headers=AUTH)

    alerts = session.exec(select(Alert).where(Alert.type == AlertType.OVERLAP)).all()
    # 1 high + 1 medium links -> 2 alerts; low-band links stay alert-free.
    assert len(alerts) == 2
    assert all(alert.status == "open" for alert in alerts)
    assert all(alert.link_id for alert in alerts)

    # Duplicate scan does not create duplicate alerts.
    client.post("/api/v1/overlaps/scan", headers=AUTH)
    assert len(session.exec(select(Alert).where(Alert.type == AlertType.OVERLAP)).all()) == 2


def test_review_writes_appended_events_on_both_cases(client_and_session):
    client, session = client_and_session
    client.post("/api/v1/overlaps/scan", headers=AUTH)
    link = _link(session, "PG-2026-00104", "RB-2026-00219")

    response = client.post(
        f"/api/v1/overlaps/{link.id}/review",
        json={"decision": "related", "note": "Same faculty complaint, coordinate with RB."},
        headers=AUTH,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["review_status"] == "related"
    assert body["reviewed_by"] == "Demo Coordinator"
    assert body["reviewed_at"] is not None
    assert body["note"] == "Same faculty complaint, coordinate with RB."

    # A review event exists on both cases; case numbers and histories stay intact.
    for case_no in ("PG-2026-00104", "RB-2026-00219"):
        case = session.exec(select(Case).where(Case.case_no == case_no)).first()
        events = session.exec(
            select(CaseEvent).where(
                CaseEvent.case_id == case.id,
                CaseEvent.event_type == EventType.REVIEW,
            )
        ).all()
        assert len(events) == 1
        assert events[0].actor == "Demo Coordinator"
        assert "reviewed as related" in events[0].remarks
        assert "coordinate with RB" in events[0].remarks
        assert case.last_action == "Overlap review: related"

    # Reviewed pairs disappear from the open queue but remain queryable.
    open_only = client.get("/api/v1/overlaps?review_status=open", headers=AUTH).json()
    assert open_only["total"] == 4
    reviewed = client.get("/api/v1/overlaps?review_status=related", headers=AUTH).json()
    assert reviewed["total"] == 1
    assert reviewed["items"][0]["id"] == link.id


def test_review_requires_coordinator_and_rejects_open_decision(client_and_session):
    client, session = client_and_session
    client.post("/api/v1/overlaps/scan", headers=AUTH)
    link = _link(session, "PG-2026-00104", "RB-2026-00219")

    for role, bureau in (
        ("bureau_officer", "PGRC"),
        ("administrator", None),
        ("senior_management", None),
    ):
        denied = client.post(
            f"/api/v1/overlaps/{link.id}/review",
            json={"decision": "related"},
            headers=auth_for(role, bureau),
        )
        assert denied.status_code == 403, role
        assert denied.json()["error"]["code"] == "FORBIDDEN"

    invalid = client.post(
        f"/api/v1/overlaps/{link.id}/review",
        json={"decision": "open"},
        headers=AUTH,
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"

    missing = client.post(
        "/api/v1/overlaps/99999/review",
        json={"decision": "related"},
        headers=AUTH,
    )
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "NOT_FOUND"

    detail = client.get("/api/v1/overlaps/99999", headers=AUTH)
    assert detail.status_code == 404


def test_scan_permissions(client_and_session):
    client, _session = client_and_session

    denied = client.post("/api/v1/overlaps/scan", headers=auth_for("bureau_officer", "RB"))
    assert denied.status_code == 403
    denied = client.post("/api/v1/overlaps/scan", headers=auth_for("senior_management"))
    assert denied.status_code == 403

    allowed = client.post("/api/v1/overlaps/scan", headers=auth_for("administrator"))
    assert allowed.status_code == 200
    assert allowed.json() == {"created": 5}


def test_institution_profile_lists_open_overlaps(client_and_session):
    client, _session = client_and_session
    client.post("/api/v1/overlaps/scan", headers=AUTH)

    profile = client.get("/api/v1/institutions/DEMO-1042", headers=AUTH)
    assert profile.status_code == 200
    body = profile.json()
    assert len(body["open_overlaps"]) == 5
    assert all(item["review_status"] == "open" for item in body["open_overlaps"])

    link = body["open_overlaps"][0]
    client.post(
        f"/api/v1/overlaps/{link['id']}/review",
        json={"decision": "not_related"},
        headers=AUTH,
    )
    refreshed = client.get("/api/v1/institutions/DEMO-1042", headers=AUTH).json()
    assert len(refreshed["open_overlaps"]) == 4


# ---------------------------------------------------------------------------
# Rule-engine unit tests (no API)
# ---------------------------------------------------------------------------

def _case(description: str, category: CaseCategory, received_offset: int = 0) -> Case:
    return Case(
        case_no="XX-2026-00001",
        institution_id=1,
        bureau=Bureau.RB,
        category=category,
        description=description,
        received_date=TODAY - timedelta(days=received_offset),
        status=CaseStatus.PENDING,
    )


def test_score_pair_shared_reference_forces_high_band():
    a = _case("See letter AICTE/RO/2026/118 for details on the complaint.", CaseCategory.OTHER)
    b = _case("Reference AICTE/RO/2026/118 was received by the office.", CaseCategory.INFRASTRUCTURE)
    band, reasons = score_pair(a, b)
    assert band == ConfidenceBand.HIGH
    assert "shared_reference" in reasons


def test_score_pair_unrelated_single_low_band():
    a = _case("Scholarship portal crash blocks disbursement for students.", CaseCategory.INFRASTRUCTURE)
    b = _case("Mechanical department faculty roster irregularity.", CaseCategory.FACULTY)
    band, reasons = score_pair(a, b)
    assert band == ConfidenceBand.LOW
    assert "same_permanent_id" in reasons
    assert "same_category" not in reasons
    assert "related_category" not in reasons


def test_text_similarity_bounds():
    assert text_similarity("same text here", "same text here") == pytest.approx(1.0)
    assert text_similarity("", "anything") == 0.0
    assert 0.0 <= text_similarity("alpha beta", "gamma delta") <= 1.0


def test_manual_verification_missing_and_conflicting_id(client_and_session):
    client, session = client_and_session

    # Plant 1: Institution with missing/unknown permanent_id and an associated case
    inst_missing = Institution(
        permanent_id="UNKNOWN",
        name="Planted Missing ID Institute",
        region=Region.NORTH,
    )
    session.add(inst_missing)
    session.commit()
    session.refresh(inst_missing)

    case_missing = Case(
        case_no="MISSING-2026-00001",
        institution_id=inst_missing.id,
        bureau=Bureau.RB,
        category=CaseCategory.INFRASTRUCTURE,
        description="Case with missing institution permanent_id",
        received_date=TODAY,
        status=CaseStatus.PENDING,
    )
    session.add(case_missing)

    # Plant 2: Two institutions with conflicting permanent_ids for the same institution name
    inst_conf_a = Institution(
        permanent_id="CONFLICT-PID-001",
        name="National Apex Institute of Technology",
        region=Region.WEST,
    )
    inst_conf_b = Institution(
        permanent_id="CONFLICT-PID-002",
        name="National Apex Institute of Technology",
        region=Region.WEST,
    )
    session.add(inst_conf_a)
    session.add(inst_conf_b)
    session.commit()
    session.refresh(inst_conf_a)
    session.refresh(inst_conf_b)

    case_conf = Case(
        case_no="CONFLICT-2026-00002",
        institution_id=inst_conf_a.id,
        bureau=Bureau.PGRC,
        category=CaseCategory.FACULTY,
        description="Case with conflicting institution records",
        received_date=TODAY,
        status=CaseStatus.PENDING,
    )
    session.add(case_conf)
    session.commit()

    # 1. Coordinator can access manual-verification endpoint
    res_coord = client.get("/api/v1/overlaps/manual-verification", headers=auth_for("coordinator"))
    assert res_coord.status_code == 200
    data = res_coord.json()
    assert "total" in data
    assert data["total"] >= 2
    issue_types = {item["issue_type"] for item in data["items"]}
    assert "missing_permanent_id" in issue_types
    assert "conflicting_permanent_id" in issue_types

    # Verify planted case nos are present
    case_nos = {item["case_no"] for item in data["items"] if item["case_no"]}
    assert "MISSING-2026-00001" in case_nos
    assert "CONFLICT-2026-00002" in case_nos

    # 2. Administrator can access manual-verification endpoint
    res_admin = client.get("/api/v1/overlaps/manual-verification", headers=auth_for("administrator"))
    assert res_admin.status_code == 200

    # 3. Bureau officer and Senior management are rejected with 403
    res_officer = client.get("/api/v1/overlaps/manual-verification", headers=auth_for("bureau_officer", bureau="RB"))
    assert res_officer.status_code == 403
    assert res_officer.json()["error"]["code"] == "FORBIDDEN"

    res_mgmt = client.get("/api/v1/overlaps/manual-verification", headers=auth_for("senior_management"))
    assert res_mgmt.status_code == 403
    assert res_mgmt.json()["error"]["code"] == "FORBIDDEN"

    # 4. Admin health summary reflects manual_verification_count
    res_health = client.get("/api/v1/admin/health-summary", headers=auth_for("administrator"))
    assert res_health.status_code == 200
    health_data = res_health.json()
    assert "manual_verification_count" in health_data
    assert health_data["manual_verification_count"] >= 2


def test_overlap_review_permission_check_before_body_validation(client_and_session):
    """Item 13: Permission checks must run before request body validation.
    bureau_officer and senior_management cannot review overlaps.
    Sending invalid body ({}) must return 403 FORBIDDEN, not 422.
    """
    client, _ = client_and_session
    for role in ["bureau_officer", "senior_management"]:
        headers = auth_for(role, bureau="RB" if role == "bureau_officer" else None)
        res = client.post("/api/v1/overlaps/1/review", json={}, headers=headers)
        assert res.status_code == 403
        data = res.json()
        assert data["error"]["code"] == "FORBIDDEN"


