from datetime import date, datetime, timezone
from enum import Enum
from typing import Any, List, Optional
from sqlalchemy import JSON, CheckConstraint, Column, UniqueConstraint
from sqlmodel import Field, SQLModel


# Enumerations


class Bureau(str, Enum):
    RB = "RB"
    PGRC = "PGRC"
    RO = "RO"  # Regional Office
    OC = "OC"  # Other Cell


class CaseStatus(str, Enum):
    PENDING = "pending"
    UNDER_PROCESS = "under_process"
    DISPOSED = "disposed"
    TRANSFERRED = "transferred"
    ESCALATED = "escalated"


class EventType(str, Enum):
    CREATED = "created"
    STATUS_CHANGE = "status_change"
    TRANSFER = "transfer"
    ESCALATION = "escalation"
    REMARK = "remark"
    LINK = "link"
    REVIEW = "review"


class CaseCategory(str, Enum):
    INFRASTRUCTURE = "infrastructure"
    FACULTY = "faculty"
    FEE_REFUND = "fee_refund"
    ADMISSION = "admission"
    APPROVAL = "approval"
    EXAMINATION = "examination"
    OTHER = "other"


class Region(str, Enum):
    NORTH = "North"
    SOUTH = "South"
    EAST = "East"
    WEST = "West"
    CENTRAL = "Central"


class ReviewStatus(str, Enum):
    OPEN = "open"
    RELATED = "related"
    DUPLICATE = "duplicate"
    NOT_RELATED = "not_related"
    NEEDS_REVIEW = "needs_review"


class ConfidenceBand(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class AlertType(str, Enum):
    OVERLAP = "overlap"
    PENDING_REMINDER = "pending_reminder"
    ESCALATION = "escalation"
    SLA_WARNING = "sla_warning"
    SLA_BREACH = "sla_breach"
    TRANSFER = "transfer"


class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class UserRole(str, Enum):
    BUREAU_OFFICER = "bureau_officer"
    COORDINATOR = "coordinator"
    SENIOR_MANAGEMENT = "senior_management"
    ADMINISTRATOR = "administrator"


def utc_now() -> datetime:
    """Return current UTC timestamp without timezone offset issues."""
    return datetime.now(timezone.utc)


# Database Tables


class Institution(SQLModel, table=True):
    __tablename__ = "institutions"

    id: Optional[int] = Field(default=None, primary_key=True)
    permanent_id: str = Field(unique=True, index=True, description="Unique institution identifier, e.g. DEMO-1042")
    name: str = Field(index=True)
    address: Optional[str] = None
    region: Region = Field(index=True)
    state: Optional[str] = None
    type: Optional[str] = None


class Case(SQLModel, table=True):
    __tablename__ = "cases"

    id: Optional[int] = Field(default=None, primary_key=True)
    case_no: str = Field(unique=True, index=True, description="Unique case number e.g. PG-2026-00104")
    institution_id: int = Field(foreign_key="institutions.id", index=True)
    bureau: Bureau = Field(index=True)
    category: CaseCategory = Field(index=True)
    description: str
    received_date: date
    status: CaseStatus = Field(default=CaseStatus.PENDING, index=True)
    assigned_officer: Optional[str] = None
    last_action: Optional[str] = None
    last_action_date: Optional[date] = None
    next_action: Optional[str] = None
    expected_disposal_date: Optional[date] = None
    priority: Priority = Field(default=Priority.MEDIUM)
    created_at: datetime = Field(default_factory=utc_now)

    @property
    def overdue(self) -> bool:
        """Derived property per Section 7: expected_disposal_date < today and status != disposed."""
        if self.status == CaseStatus.DISPOSED or not self.expected_disposal_date:
            return False
        return self.expected_disposal_date < date.today()


class CaseEvent(SQLModel, table=True):
    """Append-only audit trail of case actions. No update or delete operations permitted."""
    __tablename__ = "case_events"

    id: Optional[int] = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="cases.id", index=True)
    ts: datetime = Field(default_factory=utc_now)
    actor: str
    bureau: Bureau
    event_type: EventType
    from_bureau: Optional[Bureau] = None
    to_bureau: Optional[Bureau] = None
    from_status: Optional[CaseStatus] = None
    to_status: Optional[CaseStatus] = None
    remarks: Optional[str] = None
    attachment_ref: Optional[str] = None


class OverlapLink(SQLModel, table=True):
    """Pair of overlapping cases. Always maintains case_a_id < case_b_id with unique constraint."""
    __tablename__ = "overlap_links"
    __table_args__ = (
        UniqueConstraint("case_a_id", "case_b_id", name="uq_overlap_case_pair"),
        CheckConstraint("case_a_id < case_b_id", name="ck_overlap_case_order"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    case_a_id: int = Field(foreign_key="cases.id", index=True)
    case_b_id: int = Field(foreign_key="cases.id", index=True)
    confidence_band: ConfidenceBand = Field(index=True)
    reasons: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    review_status: ReviewStatus = Field(default=ReviewStatus.OPEN, index=True)
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)

    def __init__(self, **data: Any):
        """Enforces case_a_id < case_b_id ordering on the pair upon initialization."""
        a = data.get("case_a_id")
        b = data.get("case_b_id")
        if a is not None and b is not None:
            if a == b:
                raise ValueError("case_a_id and case_b_id cannot be identical")
            if a > b:
                data["case_a_id"], data["case_b_id"] = b, a
        super().__init__(**data)


class Alert(SQLModel, table=True):
    __tablename__ = "alerts"

    id: Optional[int] = Field(default=None, primary_key=True)
    type: AlertType = Field(index=True)
    case_id: Optional[int] = Field(default=None, foreign_key="cases.id", index=True)
    link_id: Optional[int] = Field(default=None, foreign_key="overlap_links.id", index=True)
    message: str
    priority: Priority = Field(default=Priority.MEDIUM)
    status: str = Field(default="open")
    created_at: datetime = Field(default_factory=utc_now)
    due_at: Optional[datetime] = None


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: Optional[str] = Field(default=None, unique=True, index=True)
    name: str
    role: str = Field(index=True)
    bureau: Optional[Bureau] = None
    hashed_password: Optional[str] = None
    email: Optional[str] = None
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now)


class Counter(SQLModel, table=True):
    """Counters used for transaction-safe case number generation (e.g. key='RB-2026')."""
    __tablename__ = "counters"

    key: str = Field(primary_key=True)
    value: int = Field(default=0)


class Config(SQLModel, table=True):
    """Key-value application configuration and operational rules."""
    __tablename__ = "config"

    key: str = Field(primary_key=True)
    value: str
