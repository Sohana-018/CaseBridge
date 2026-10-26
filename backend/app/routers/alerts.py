from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session, select

from app.db import get_session
from app.models import Alert, Case
from app.permissions import UserPayload, check_alert_action_permission
from app.routers.auth import get_current_user
from app.schemas import AlertListResponse, AlertRead
from app.services.alerts import acknowledge_alert, refresh_alerts

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get(
    "",
    response_model=AlertListResponse,
    summary="List alerts with filters",
)
def list_alerts(
    type: Optional[str] = Query(default=None, description="Filter by alert type"),
    status: Optional[str] = Query(default=None, description="Filter by alert status (open, acknowledged, closed)"),
    case_no: Optional[str] = Query(default=None, description="Filter by case number"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Retrieve paginated alerts filtered by type, status, or case number. Accessible to any authenticated role."""
    # Build query joining Case to resolve case_no
    base_query = select(Alert, Case.case_no).outerjoin(Case, Alert.case_id == Case.id)

    if type:
        base_query = base_query.where(Alert.type == type)
    if status:
        base_query = base_query.where(Alert.status == status)
    if case_no:
        base_query = base_query.where(Case.case_no == case_no)

    # Count total matching alerts
    all_results = session.exec(base_query).all()
    total = len(all_results)

    # Apply pagination and sorting (newest first)
    offset = (page - 1) * page_size
    paginated_query = base_query.order_by(Alert.created_at.desc(), Alert.id.desc()).offset(offset).limit(page_size)
    results = session.exec(paginated_query).all()

    items = []
    for alert, resolved_case_no in results:
        items.append(
            AlertRead(
                id=alert.id,
                type=alert.type.value if hasattr(alert.type, "value") else str(alert.type),
                case_id=alert.case_id,
                case_no=resolved_case_no,
                link_id=alert.link_id,
                message=alert.message,
                priority=alert.priority.value if hasattr(alert.priority, "value") else str(alert.priority),
                status=alert.status,
                created_at=alert.created_at,
                due_at=alert.due_at,
            )
        )

    return AlertListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/{id}/ack",
    response_model=AlertRead,
    summary="Acknowledge an alert",
)
def ack_alert(
    id: int,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Acknowledge an open alert by ID.

    Permissions: bureau_officer, coordinator, administrator. senior_management gets FORBIDDEN.
    """
    check_alert_action_permission(current_user)

    alert = acknowledge_alert(session, id)
    case_no = None
    if alert.case_id:
        case = session.get(Case, alert.case_id)
        if case:
            case_no = case.case_no

    return AlertRead(
        id=alert.id,
        type=alert.type.value if hasattr(alert.type, "value") else str(alert.type),
        case_id=alert.case_id,
        case_no=case_no,
        link_id=alert.link_id,
        message=alert.message,
        priority=alert.priority.value if hasattr(alert.priority, "value") else str(alert.priority),
        status=alert.status,
        created_at=alert.created_at,
        due_at=alert.due_at,
    )


@router.post(
    "/refresh",
    status_code=status.HTTP_200_OK,
    summary="Trigger alert rules evaluation",
)
def trigger_alert_refresh(
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Evaluate and refresh alert rules across all active cases.

    Permissions: bureau_officer, coordinator, administrator. senior_management gets FORBIDDEN.
    """
    check_alert_action_permission(current_user)

    created = refresh_alerts(session)
    return {
        "status": "ok",
        "message": f"Alerts refreshed. Created {created} new alert(s).",
    }
