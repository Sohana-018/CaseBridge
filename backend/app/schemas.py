from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models import Bureau, CaseCategory, CaseStatus, EventType, Priority, Region


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
