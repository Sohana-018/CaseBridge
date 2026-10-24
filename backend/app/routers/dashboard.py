from typing import Any, Dict, List
from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.services.reports import get_dashboard_summary, get_dashboard_workload

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get(
    "/summary",
    summary="Dashboard KPI Summary Counts",
    response_model=Dict[str, int],
)
def dashboard_summary(
    session: Session = Depends(get_session),
):
    """Retrieve overall KPI counts across all cases and open overlap alerts."""
    return get_dashboard_summary(session)


@router.get(
    "/workload",
    summary="Bureau Workload Distribution",
    response_model=List[Dict[str, Any]],
)
def dashboard_workload(
    session: Session = Depends(get_session),
):
    """Retrieve per-Bureau case workload distribution (total, open, overdue)."""
    return get_dashboard_workload(session)
