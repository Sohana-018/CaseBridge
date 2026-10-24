from datetime import date
from typing import Any, Dict, List, Optional, Tuple
from sqlmodel import Session, select

from app.errors import NotFoundError
from app.models import Bureau, Case, CaseStatus, Institution, OverlapLink, Region, ReviewStatus


def get_cases_data(session: Session) -> List[Tuple[Case, Optional[Institution]]]:
    """Single shared query helper joining cases to institutions.

    Guarantees every number across dashboard and reports derives from the exact
    same underlying records (FR17).
    """
    statement = select(Case, Institution).outerjoin(
        Institution, Case.institution_id == Institution.id
    )
    return list(session.exec(statement).all())


def get_dashboard_summary(session: Session, today: Optional[date] = None) -> Dict[str, int]:
    """Calculate overview dashboard KPI counts per PRD Section 10 & FR15.

    overdue is derived: expected_disposal_date < today and status != disposed.
    open_overlaps: count of overlap_links with review_status "open".
    """
    if today is None:
        today = date.today()

    rows = get_cases_data(session)
    total = len(rows)

    pending = sum(1 for c, _ in rows if c.status == CaseStatus.PENDING)
    under_process = sum(1 for c, _ in rows if c.status == CaseStatus.UNDER_PROCESS)
    disposed = sum(1 for c, _ in rows if c.status == CaseStatus.DISPOSED)
    transferred = sum(1 for c, _ in rows if c.status == CaseStatus.TRANSFERRED)
    escalated = sum(1 for c, _ in rows if c.status == CaseStatus.ESCALATED)

    overdue = sum(
        1 for c, _ in rows
        if c.status != CaseStatus.DISPOSED
        and c.expected_disposal_date is not None
        and c.expected_disposal_date < today
    )

    open_overlaps = len(
        list(
            session.exec(
                select(OverlapLink).where(OverlapLink.review_status == ReviewStatus.OPEN)
            ).all()
        )
    )

    return {
        "total": total,
        "pending": pending,
        "under_process": under_process,
        "disposed": disposed,
        "transferred": transferred,
        "escalated": escalated,
        "overdue": overdue,
        "open_overlaps": open_overlaps,
    }


def get_dashboard_workload(session: Session, today: Optional[date] = None) -> List[Dict[str, Any]]:
    """Calculate per-Bureau workload counts (total, open, overdue)."""
    if today is None:
        today = date.today()

    rows = get_cases_data(session)
    workload = []

    for b in Bureau:
        b_cases = [c for c, _ in rows if c.bureau == b]
        total = len(b_cases)
        open_count = sum(1 for c in b_cases if c.status != CaseStatus.DISPOSED)
        overdue_count = sum(
            1 for c in b_cases
            if c.status != CaseStatus.DISPOSED
            and c.expected_disposal_date is not None
            and c.expected_disposal_date < today
        )
        workload.append(
            {
                "bureau": b.value,
                "total": total,
                "open": open_count,
                "overdue": overdue_count,
            }
        )

    return workload


def get_report_by_kind(
    session: Session,
    kind: str,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """Generate reports for kind: bureau, status, region, institution, ageing, disposal, overlap_outcomes.

    Raises NotFoundError for unknown report kinds.
    """
    if today is None:
        today = date.today()

    normalized_kind = kind.strip().lower()
    valid_kinds = {
        "bureau",
        "status",
        "region",
        "institution",
        "ageing",
        "disposal",
        "overlap_outcomes",
    }

    if normalized_kind not in valid_kinds:
        raise NotFoundError(
            f"Report kind '{kind}' not found. Valid kinds are: {', '.join(sorted(valid_kinds))}",
            details={"kind": kind},
        )

    rows = get_cases_data(session)
    total_cases = len(rows)

    if normalized_kind == "bureau":
        items = []
        for b in Bureau:
            count = sum(1 for c, _ in rows if c.bureau == b)
            items.append({"label": b.value, "count": count})
        return {"kind": "bureau", "items": items, "total": total_cases}

    elif normalized_kind == "status":
        items = []
        for s in CaseStatus:
            count = sum(1 for c, _ in rows if c.status == s)
            items.append({"label": s.value, "count": count})
        return {"kind": "status", "items": items, "total": total_cases}

    elif normalized_kind == "region":
        items = []
        for r in Region:
            count = sum(1 for _, inst in rows if inst and inst.region == r)
            items.append({"label": r.value, "count": count})
        # If any cases exist without an institution or unassigned region
        unassigned = sum(1 for _, inst in rows if not inst or not inst.region)
        if unassigned > 0:
            items.append({"label": "Unassigned", "count": unassigned})
        return {"kind": "region", "items": items, "total": total_cases}

    elif normalized_kind == "institution":
        inst_counts: Dict[str, Dict[str, Any]] = {}
        for c, inst in rows:
            key = inst.permanent_id if inst else "UNKNOWN"
            name = inst.name if inst else "Unknown Institution"
            if key not in inst_counts:
                inst_counts[key] = {
                    "permanent_id": key,
                    "name": name,
                    "label": f"{name} ({key})" if key != "UNKNOWN" else name,
                    "count": 0,
                }
            inst_counts[key]["count"] += 1
        items = sorted(inst_counts.values(), key=lambda x: x["count"], reverse=True)
        return {"kind": "institution", "items": items, "total": total_cases}

    elif normalized_kind == "ageing":
        open_cases = [c for c, _ in rows if c.status != CaseStatus.DISPOSED]
        buckets = {"0-7": 0, "8-30": 0, "31-90": 0, "90+": 0}
        for c in open_cases:
            days = (today - c.received_date).days
            if days <= 7:
                buckets["0-7"] += 1
            elif days <= 30:
                buckets["8-30"] += 1
            elif days <= 90:
                buckets["31-90"] += 1
            else:
                buckets["90+"] += 1

        items = [
            {"label": "0-7 days", "bucket": "0-7", "count": buckets["0-7"]},
            {"label": "8-30 days", "bucket": "8-30", "count": buckets["8-30"]},
            {"label": "31-90 days", "bucket": "31-90", "count": buckets["31-90"]},
            {"label": "90+ days", "bucket": "90+", "count": buckets["90+"]},
        ]
        return {"kind": "ageing", "items": items, "total": len(open_cases)}

    elif normalized_kind == "disposal":
        disposed_count = sum(1 for c, _ in rows if c.status == CaseStatus.DISPOSED)
        open_count = total_cases - disposed_count
        rate = round(disposed_count / total_cases, 4) if total_cases > 0 else 0.0
        items = [
            {"label": "disposed", "count": disposed_count},
            {"label": "open", "count": open_count},
        ]
        return {
            "kind": "disposal",
            "disposed": disposed_count,
            "total": total_cases,
            "disposal_rate": rate,
            "items": items,
        }

    elif normalized_kind == "overlap_outcomes":
        links = list(session.exec(select(OverlapLink)).all())
        items = []
        for rs in ReviewStatus:
            count = sum(1 for l in links if l.review_status == rs)
            items.append({"label": rs.value, "count": count})
        return {"kind": "overlap_outcomes", "items": items, "total": len(links)}

    # Fallback (unreachable due to earlier check)
    raise NotFoundError(f"Report kind '{kind}' not found", details={"kind": kind})
