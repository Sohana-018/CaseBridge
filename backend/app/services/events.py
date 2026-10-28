from datetime import date, datetime, timezone
from typing import List, Union
from sqlmodel import Session, select

from app.errors import NotFoundError, ValidationError
from app.models import Case, CaseEvent, CaseStatus, EventType
from app.schemas import EventCreate


def record_case_event(
    session: Session,
    case_no: str,
    event_data: Union[EventCreate, dict],
    actor: str = "System Officer",
) -> CaseEvent:
    """Validate request, append a case_events row, and update case fields in a single transaction.

    Per Section 8 (FR4, FR5):
    - status_change: requires to_status; sets case.status.
    - transfer: requires to_bureau different from current; sets case.bureau and status to "transferred".
    - escalation: requires remarks; sets case.status to "escalated".
    - remark: requires remarks; no change to status or bureau.
    - Every event sets last_action and last_action_date.
    - case_no and institution never change.
    - created, link, review are not allowed through this endpoint (raises ValidationError).
    """
    if isinstance(event_data, dict):
        event_create = EventCreate(**event_data)
    else:
        event_create = event_data

    # 1. Fetch case by case_no
    case = session.exec(select(Case).where(Case.case_no == case_no)).first()
    if not case:
        raise NotFoundError(f"Case '{case_no}' not found", details={"case_no": case_no})

    # 2. Check disallowed event types
    disallowed = {EventType.CREATED, EventType.LINK, EventType.REVIEW}
    if event_create.event_type in disallowed:
        raise ValidationError(
            f"Event type '{event_create.event_type.value}' is not allowed through this endpoint.",
            details={"event_type": event_create.event_type.value},
        )

    # 3. Snapshot current case state
    from_bureau = case.bureau
    from_status = case.status
    to_bureau = None
    to_status = None
    today = date.today()

    # 4. Handle event logic
    if event_create.event_type == EventType.STATUS_CHANGE:
        if not event_create.to_status:
            raise ValidationError(
                "Field 'to_status' is required for status_change events.",
                details={"field": "to_status"},
            )
        to_status = event_create.to_status
        case.status = to_status
        last_action = f"Status changed to {to_status.value}"

    elif event_create.event_type == EventType.TRANSFER:
        if not event_create.to_bureau:
            raise ValidationError(
                "Field 'to_bureau' is required for transfer events.",
                details={"field": "to_bureau"},
            )
        if event_create.to_bureau == from_bureau:
            raise ValidationError(
                f"Cannot transfer case to the same Bureau ('{from_bureau.value}').",
                details={"field": "to_bureau"},
            )
        to_bureau = event_create.to_bureau
        case.bureau = to_bureau
        case.status = CaseStatus.TRANSFERRED
        to_status = CaseStatus.TRANSFERRED
        last_action = f"Transferred from {from_bureau.value} to {to_bureau.value}"

    elif event_create.event_type == EventType.ESCALATION:
        if not event_create.remarks or not event_create.remarks.strip():
            raise ValidationError(
                "Field 'remarks' is required for escalation events.",
                details={"field": "remarks"},
            )
        case.status = CaseStatus.ESCALATED
        to_status = CaseStatus.ESCALATED
        last_action = f"Escalated: {event_create.remarks.strip()}"

    elif event_create.event_type == EventType.REMARK:
        if not event_create.remarks or not event_create.remarks.strip():
            raise ValidationError(
                "Field 'remarks' is required for remark events.",
                details={"field": "remarks"},
            )
        # Status and bureau do not change for remark events
        last_action = event_create.remarks.strip()

    else:
        raise ValidationError(
            f"Unsupported event type: '{event_create.event_type}'",
            details={"event_type": str(event_create.event_type)},
        )

    # 5. Update case last_action metadata (case_no and institution_id never change)
    case.last_action = last_action
    case.last_action_date = today

    # 6. Create CaseEvent row
    now_ts = datetime.now(timezone.utc)
    event = CaseEvent(
        case_id=case.id,
        ts=now_ts,
        actor=actor,
        bureau=from_bureau,
        event_type=event_create.event_type,
        from_bureau=from_bureau,
        to_bureau=to_bureau,
        from_status=from_status,
        to_status=to_status,
        remarks=event_create.remarks or last_action,
        attachment_ref=event_create.attachment_ref,
    )

    # 7. Commit transaction
    session.add(event)
    session.add(case)
    session.commit()
    session.refresh(event)
    session.refresh(case)

    # When an escalation event is recorded, create an escalation alert per Section 8 / FR13
    if event_create.event_type == EventType.ESCALATION:
        from app.services.alerts import create_escalation_alert
        create_escalation_alert(session, case_id=case.id, remarks=event_create.remarks)

    # When a transfer event is recorded, notify both originating and receiving bureaus
    if event_create.event_type == EventType.TRANSFER and to_bureau:
        from app.services.alerts import create_transfer_alerts
        create_transfer_alerts(session, case=case, from_bureau=from_bureau, to_bureau=to_bureau, remarks=event_create.remarks)

    return event


def get_case_events(session: Session, case_no: str) -> List[CaseEvent]:
    """Retrieve all events for a case, ordered oldest first."""
    case = session.exec(select(Case).where(Case.case_no == case_no)).first()
    if not case:
        raise NotFoundError(f"Case '{case_no}' not found", details={"case_no": case_no})

    events = session.exec(
        select(CaseEvent)
        .where(CaseEvent.case_id == case.id)
        .order_by(CaseEvent.ts.asc(), CaseEvent.id.asc())
    ).all()

    return list(events)
