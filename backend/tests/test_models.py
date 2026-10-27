from datetime import date
import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import (
    Bureau,
    Case,
    CaseCategory,
    CaseEvent,
    CaseStatus,
    Config,
    Counter,
    EventType,
    Institution,
    OverlapLink,
    ConfidenceBand,
    Priority,
    Region,
    ReviewStatus,
    User,
)


@pytest.fixture(name="session")
def session_fixture():
    """In-memory SQLite database session fixture."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


def test_insert_and_read_institution_case_and_event(session: Session):
    """Test inserting one institution, one case, and one case_event and reading them back."""
    # 1. Insert Institution
    inst = Institution(
        permanent_id="DEMO-1042",
        name="Example Institute of Technology",
        address="123 Academic Campus Road",
        region=Region.SOUTH,
        state="Karnataka",
        type="Engineering",
    )
    session.add(inst)
    session.commit()
    session.refresh(inst)

    assert inst.id is not None
    assert inst.permanent_id == "DEMO-1042"

    # 2. Insert Case
    c = Case(
        case_no="PG-2026-00104",
        institution_id=inst.id,
        bureau=Bureau.PGRC,
        category=CaseCategory.FACULTY,
        description="Complaint regarding unqualified faculty in mechanical department",
        received_date=date(2026, 9, 12),
        status=CaseStatus.UNDER_PROCESS,
        assigned_officer="A. Rao",
        last_action="Notice sent to institution",
        last_action_date=date(2026, 10, 2),
        next_action="Await institution reply",
        expected_disposal_date=date(2026, 11, 15),
        priority=Priority.MEDIUM,
    )
    session.add(c)
    session.commit()
    session.refresh(c)

    assert c.id is not None
    assert c.case_no == "PG-2026-00104"
    assert c.bureau == Bureau.PGRC
    assert c.status == CaseStatus.UNDER_PROCESS
    assert c.overdue is False

    # 3. Insert CaseEvent (append-only)
    event = CaseEvent(
        case_id=c.id,
        actor="A. Rao",
        bureau=Bureau.PGRC,
        event_type=EventType.REMARK,
        remarks="Notice sent to institution",
    )
    session.add(event)
    session.commit()
    session.refresh(event)

    assert event.id is not None
    assert event.case_id == c.id
    assert event.event_type == EventType.REMARK
    assert event.remarks == "Notice sent to institution"

    # 4. Read back using select queries
    queried_inst = session.exec(select(Institution).where(Institution.permanent_id == "DEMO-1042")).first()
    assert queried_inst is not None
    assert queried_inst.name == "Example Institute of Technology"
    assert queried_inst.region == Region.SOUTH

    queried_case = session.exec(select(Case).where(Case.case_no == "PG-2026-00104")).first()
    assert queried_case is not None
    assert queried_case.institution_id == queried_inst.id
    assert queried_case.category == CaseCategory.FACULTY

    queried_events = session.exec(select(CaseEvent).where(CaseEvent.case_id == queried_case.id)).all()
    assert len(queried_events) == 1
    assert queried_events[0].actor == "A. Rao"
    assert queried_events[0].event_type == EventType.REMARK


def test_overlap_link_ordering_and_unique_constraint(session: Session):
    """Test that overlap_links enforces case_a_id < case_b_id and uniqueness on the pair."""
    # Create institution and two cases
    inst = Institution(permanent_id="DEMO-2000", name="Test College", region=Region.NORTH)
    session.add(inst)
    session.commit()

    case_1 = Case(
        case_no="RB-2026-00001",
        institution_id=inst.id,
        bureau=Bureau.RB,
        category=CaseCategory.INFRASTRUCTURE,
        description="Infra issue",
        received_date=date(2026, 9, 1),
    )
    case_2 = Case(
        case_no="PG-2026-00002",
        institution_id=inst.id,
        bureau=Bureau.PGRC,
        category=CaseCategory.INFRASTRUCTURE,
        description="Infra issue duplicate",
        received_date=date(2026, 9, 5),
    )
    session.add_all([case_1, case_2])
    session.commit()

    # Pass unordered case_a_id and case_b_id (case_2.id > case_1.id)
    high_id = max(case_1.id, case_2.id)
    low_id = min(case_1.id, case_2.id)

    # Constructor should enforce low_id < high_id
    link = OverlapLink(
        case_a_id=high_id,
        case_b_id=low_id,
        confidence_band=ConfidenceBand.HIGH,
        reasons=["same_permanent_id", "same_category"],
        review_status=ReviewStatus.OPEN,
    )
    session.add(link)
    session.commit()
    session.refresh(link)

    assert link.case_a_id == low_id
    assert link.case_b_id == high_id
    assert link.case_a_id < link.case_b_id
    assert "same_permanent_id" in link.reasons

    # Attempting to insert duplicate pair should raise IntegrityError
    dup_link = OverlapLink(
        case_a_id=low_id,
        case_b_id=high_id,
        confidence_band=ConfidenceBand.MEDIUM,
    )
    session.add(dup_link)
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_alert_user_counter_config(session: Session):
    """Test Alert, User, Counter, and Config models."""
    user = User(name="Coordinator One", role="coordinator", bureau=Bureau.RB)
    counter = Counter(key="RB-2026", value=42)
    cfg = Config(key="pending_days", value="7")

    session.add_all([user, counter, cfg])
    session.commit()

    assert session.get(User, user.id).name == "Coordinator One"
    assert session.get(Counter, "RB-2026").value == 42
    assert session.get(Config, "pending_days").value == "7"
