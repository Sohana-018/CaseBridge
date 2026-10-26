from typing import Any, Dict
from fastapi import APIRouter, Depends, Response
from sqlmodel import Session

from app.db import get_session
from app.permissions import UserPayload
from app.routers.auth import get_current_user
from app.services.reports import export_report_csv, get_report_by_kind

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get(
    "/{kind}",
    summary="Get Consolidated Report by Kind",
    response_model=Dict[str, Any],
)
def get_report(
    kind: str,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Retrieve reporting metrics grouped by kind. Accessible to any authenticated role.

    Supported kinds: bureau, status, region, institution, ageing, disposal, overlap_outcomes.
    Unknown kinds return HTTP 404 in shared error format.
    """
    return get_report_by_kind(session=session, kind=kind)


@router.get(
    "/{kind}/csv",
    summary="Export Consolidated Report as CSV",
)
def get_report_csv(
    kind: str,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Export report metrics as CSV download. Accessible to any authenticated role."""
    csv_content, filename = export_report_csv(session=session, kind=kind)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
        },
    )

