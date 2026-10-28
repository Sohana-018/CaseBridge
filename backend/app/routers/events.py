from datetime import date
from typing import List
from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlmodel import Session, select
from starlette.exceptions import HTTPException

from app.db import get_session
from app.errors import ForbiddenError, NotFoundError
from app.models import Case, Institution
from app.permissions import UserPayload, check_event_post_permission, is_full_case_visible
from app.routers.auth import get_current_user
from app.schemas import EventCreate, EventRead
from app.services.email import send_status_update_notification
from app.services.events import get_case_events, record_case_event

router = APIRouter(prefix="/cases", tags=["Events"])


def require_event_post_permission(current_user: UserPayload = Depends(get_current_user)) -> UserPayload:
    if current_user.role in ("senior_management", "administrator"):
        raise ForbiddenError(
            f"Role '{current_user.role}' cannot append events to cases.",
            details={"role": current_user.role},
        )
    return current_user


@router.get(
    "/{case_no}/events",
    response_model=List[EventRead],
    summary="Get case event timeline",
)
def get_events(
    case_no: str,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Retrieve case event timeline, ordered oldest first.

    If a bureau_officer views events for another Bureau's case, sensitive fields
    (remarks, attachment_ref, review notes) are redacted.
    """
    case = session.exec(select(Case).where(Case.case_no == case_no)).first()
    if not case:
        raise NotFoundError(f"Case '{case_no}' not found", details={"case_no": case_no})

    events = get_case_events(session=session, case_no=case_no)

    bureau_str = case.bureau.value if hasattr(case.bureau, "value") else str(case.bureau)
    if not is_full_case_visible(current_user, bureau_str):
        return [
            EventRead(
                id=ev.id,
                ts=ev.ts,
                actor=ev.actor,
                bureau=ev.bureau,
                event_type=ev.event_type,
                from_bureau=ev.from_bureau,
                to_bureau=ev.to_bureau,
                from_status=ev.from_status,
                to_status=ev.to_status,
                remarks=None,
                attachment_ref=None,
            )
            for ev in events
        ]

    return events


@router.post(
    "/{case_no}/events",
    response_model=EventRead,
    status_code=status.HTTP_201_CREATED,
    summary="Append a new event to a case",
    dependencies=[Depends(require_event_post_permission)],
)
def create_event(
    case_no: str,
    event_data: EventCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Append an event to a case.

    Permissions:
    - bureau_officer: only for cases in their own bureau.
    - coordinator: for any case.
    - senior_management and administrator: FORBIDDEN.
    Actor is recorded as current_user.name.
    """
    case = session.exec(select(Case).where(Case.case_no == case_no)).first()
    if not case:
        raise NotFoundError(f"Case '{case_no}' not found", details={"case_no": case_no})

    check_event_post_permission(current_user, case)

    from_status = case.status

    event = record_case_event(
        session=session,
        case_no=case_no,
        event_data=event_data,
        actor=current_user.name,
    )

    # If the case status changed and complainant email exists, trigger async notification
    if event.to_status and event.to_status != from_status and case.complainant_email:
        recipient = case.complainant_email.strip()
        if recipient:
            inst = session.get(Institution, case.institution_id) if case.institution_id else None
            inst_name = inst.name if inst else "Educational Institution"
            from_str = from_status.value if hasattr(from_status, "value") else str(from_status)
            to_str = event.to_status.value if hasattr(event.to_status, "value") else str(event.to_status)
            action_date_str = str(case.last_action_date or date.today())
            background_tasks.add_task(
                send_status_update_notification,
                case_no=case.case_no,
                recipient_email=recipient,
                complainant_name=case.complainant_name or "Complainant",
                from_status=from_str,
                to_status=to_str,
                remarks=event.remarks,
                institution_name=inst_name,
                action_date=action_date_str,
            )

    return event


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
