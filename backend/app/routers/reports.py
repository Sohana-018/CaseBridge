from typing import Any, Dict
from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.services.reports import get_report_by_kind

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get(
    "/{kind}",
    summary="Get Consolidated Report by Kind",
    response_model=Dict[str, Any],
)
def get_report(
    kind: str,
    session: Session = Depends(get_session),
):
    """Retrieve reporting metrics grouped by kind.

    Supported kinds: bureau, status, region, institution, ageing, disposal, overlap_outcomes.
    Unknown kinds return HTTP 404 in shared error format.
    """
    return get_report_by_kind(session=session, kind=kind)
