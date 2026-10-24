from typing import List
from fastapi import APIRouter, Depends, status
from sqlmodel import Session
from starlette.exceptions import HTTPException

from app.db import get_session
from app.schemas import EventCreate, EventRead
from app.services.events import get_case_events, record_case_event

router = APIRouter(prefix="/cases", tags=["Events"])


@router.get(
    "/{case_no}/events",
    response_model=List[EventRead],
    summary="Get case event timeline",
)
def get_events(
    case_no: str,
    session: Session = Depends(get_session),
):
    """Retrieve case event timeline, ordered oldest first."""
    return get_case_events(session=session, case_no=case_no)


@router.post(
    "/{case_no}/events",
    response_model=EventRead,
    status_code=status.HTTP_201_CREATED,
    summary="Append a new event to a case",
)
def create_event(
    case_no: str,
    event_data: EventCreate,
    session: Session = Depends(get_session),
):
    """Append an event to a case and update case status/bureau/last_action atomically."""
    return record_case_event(session=session, case_no=case_no, event_data=event_data)


# Explicitly reject PUT, PATCH, DELETE on specific event IDs to enforce append-only rule (HTTP 405)
@router.put("/{case_no}/events/{event_id}")
@router.patch("/{case_no}/events/{event_id}")
@router.delete("/{case_no}/events/{event_id}")
def disallowed_event_mutation():
    """Events are strictly append-only. Update or deletion operations are prohibited."""
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Events are append-only. Modifying or deleting events is not allowed.",
    )
