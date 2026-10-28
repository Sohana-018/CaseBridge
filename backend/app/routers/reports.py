from datetime import date
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session

from app.db import get_session
from app.permissions import UserPayload
from app.routers.auth import get_current_user
from app.services.reports import (
    export_periodic_report_csv,
    export_report_csv,
    get_periodic_report,
    get_report_by_kind,
)

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get(
    "/periodic",
    summary="Get Periodic Performance Report",
    response_model=Dict[str, Any],
)
def get_periodic(
    period: str = Query("monthly", description="Report period: daily, monthly, or quarterly"),
    date: Optional[date] = Query(None, description="Target date for daily period (YYYY-MM-DD)"),
    year: Optional[int] = Query(None, description="Target year for monthly or quarterly report"),
    month: Optional[int] = Query(None, description="Target month for monthly report (1-12)"),
    quarter: Optional[int] = Query(None, description="Target quarter for quarterly report (1-4)"),
    start_date: Optional[date] = Query(None, description="Optional custom start date"),
    end_date: Optional[date] = Query(None, description="Optional custom end date"),
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Retrieve periodic performance report aggregating cases over daily, monthly, or quarterly periods.

    Includes counts by status, category, institution, and resolution-time statistics.
    Accessible to any authenticated role.
    """
    return get_periodic_report(
        session=session,
        period=period,
        date_val=date,
        year=year,
        month=month,
        quarter=quarter,
        start_date=start_date,
        end_date=end_date,
    )


@router.get(
    "/periodic/csv",
    summary="Export Periodic Performance Report as CSV",
)
def get_periodic_csv(
    period: str = Query("monthly", description="Report period: daily, monthly, or quarterly"),
    date: Optional[date] = Query(None, description="Target date for daily period (YYYY-MM-DD)"),
    year: Optional[int] = Query(None, description="Target year for monthly or quarterly report"),
    month: Optional[int] = Query(None, description="Target month for monthly report (1-12)"),
    quarter: Optional[int] = Query(None, description="Target quarter for quarterly report (1-4)"),
    start_date: Optional[date] = Query(None, description="Optional custom start date"),
    end_date: Optional[date] = Query(None, description="Optional custom end date"),
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Export periodic performance report metrics as CSV download. Accessible to any authenticated role."""
    csv_content, filename = export_periodic_report_csv(
        session=session,
        period=period,
        date_val=date,
        year=year,
        month=month,
        quarter=quarter,
        start_date=start_date,
        end_date=end_date,
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8",
        },
    )


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

