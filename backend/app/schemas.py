from datetime import date, datetime
from typing import Any, List, Optional, Union
from pydantic import BaseModel, ConfigDict
from app.models import Bureau, CaseCategory, CaseStatus, EventType, Priority, Region


class InstitutionMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    permanent_id: str
    name: str
    region: str


class InstitutionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    permanent_id: str
    name: str
    address: Optional[str] = None
    region: str
    state: Optional[str] = None
    type: Optional[str] = None


class InstitutionListResponse(BaseModel):
    items: List[InstitutionRead]
    total: int
    page: int
    page_size: int


class CaseSummaryRead(BaseModel):
    """Restricted case view visible across bureaus for Bureau Officers (Section 3)."""
    model_config = ConfigDict(from_attributes=True)

    case_no: str
    bureau: str
    category: str
    status: str
    received_date: date


class CaseRead(BaseModel):
    """Full case object representation per Section 10 of PRD."""
    model_config = ConfigDict(from_attributes=True)

    case_no: str
    institution: InstitutionMini
    bureau: str
    category: str
    description: str
    received_date: date
    status: str
    assigned_officer: Optional[str] = None
    last_action: Optional[str] = None
    last_action_date: Optional[date] = None
    next_action: Optional[str] = None
    expected_disposal_date: Optional[date] = None
    overdue: bool
    priority: str


class CaseListResponse(BaseModel):
    """Paginated case list response model."""
    items: List[Union[CaseRead, CaseSummaryRead]]
    total: int
    page: int
    page_size: int


class InstitutionDetailRead(BaseModel):
    """Institution profile with cases and open overlaps per PRD Section 10."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    permanent_id: str
    name: str
    address: Optional[str] = None
    region: str
    state: Optional[str] = None
    type: Optional[str] = None
    cases: List[Union[CaseRead, CaseSummaryRead]] = []
    open_overlaps: List[Any] = []


class EventCreate(BaseModel):
    """Payload for creating a case event."""
    event_type: EventType
    to_status: Optional[CaseStatus] = None
    to_bureau: Optional[Bureau] = None
    remarks: Optional[str] = None
    attachment_ref: Optional[str] = None


class EventRead(BaseModel):
    """Representation of an event per Section 10 of PRD."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    ts: datetime
    actor: str
    bureau: Bureau
    event_type: EventType
    from_bureau: Optional[Bureau] = None
    to_bureau: Optional[Bureau] = None
    from_status: Optional[CaseStatus] = None
    to_status: Optional[CaseStatus] = None
    remarks: Optional[str] = None
    attachment_ref: Optional[str] = None


class AlertRead(BaseModel):
    """Alert response model matching PRD Section 10 contract."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    case_id: Optional[int] = None
    case_no: Optional[str] = None
    link_id: Optional[int] = None
    message: str
    priority: str
    status: str
    created_at: datetime
    due_at: Optional[datetime] = None


class AlertListResponse(BaseModel):
    """Paginated alert list response model."""
    items: list[AlertRead]
    total: int
    page: int
    page_size: int
