import calendar
import csv
from datetime import date
import io
import statistics
from typing import Any, Dict, List, Optional, Tuple
from sqlmodel import Session, select

from app.errors import NotFoundError, ValidationError
from app.models import (
    Bureau,
    Case,
    CaseCategory,
    CaseStatus,
    ConfidenceBand,
    Institution,
    OverlapLink,
    Region,
    ReviewStatus,
)


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
    open_overlaps: count of overlap_links with review_status "open" and band in (high, medium).
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
                select(OverlapLink).where(
                    OverlapLink.review_status == ReviewStatus.OPEN,
                    OverlapLink.confidence_band.in_([ConfidenceBand.HIGH, ConfidenceBand.MEDIUM]),
                )
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


def export_report_csv(
    session: Session,
    kind: str,
    today: Optional[date] = None,
) -> Tuple[str, str]:
    """Generate CSV string and filename for any supported report kind (Phase 15)."""
    report = get_report_by_kind(session, kind=kind, today=today)
    normalized_kind = report["kind"]
    output = io.StringIO()
    writer = csv.writer(output)

    total = report.get("total", 0)

    if normalized_kind == "institution":
        writer.writerow(["permanent_id", "institution_name", "count", "percentage"])
        for item in report.get("items", []):
            pct = round((item["count"] / total * 100), 2) if total > 0 else 0.0
            writer.writerow([item["permanent_id"], item["name"], item["count"], f"{pct}%"])
    elif normalized_kind == "ageing":
        writer.writerow(["bucket", "label", "count", "percentage"])
        for item in report.get("items", []):
            pct = round((item["count"] / total * 100), 2) if total > 0 else 0.0
            writer.writerow([item["bucket"], item["label"], item["count"], f"{pct}%"])
    else:
        writer.writerow(["label", "count", "percentage"])
        for item in report.get("items", []):
            pct = round((item["count"] / total * 100), 2) if total > 0 else 0.0
            writer.writerow([item["label"], item["count"], f"{pct}%"])

    filename = f"casebridge_report_{normalized_kind}.csv"
    return output.getvalue(), filename


def get_periodic_report(
    session: Session,
    period: str = "monthly",
    date_val: Optional[date] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    quarter: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    """Generate periodic performance report for daily, monthly, or quarterly period.

    Computes:
    - Counts by status, category, institute
    - Resolution-time stats (avg, median, min, max, within SLA, SLA compliance rate)
    - Cohort totals and disposal metrics
    """
    if today is None:
        today = date.today()

    norm_period = (period or "monthly").strip().lower()
    if norm_period not in ("daily", "monthly", "quarterly", "custom"):
        raise ValidationError(
            f"Invalid period '{period}'. Valid options are daily, monthly, quarterly.",
            details={"period": period},
        )

    # Determine date range
    if start_date and end_date:
        if start_date > end_date:
            raise ValidationError(
                f"start_date ({start_date}) cannot be after end_date ({end_date}).",
                details={"start_date": str(start_date), "end_date": str(end_date)},
            )
        calc_start = start_date
        calc_end = end_date
        period_label = f"{calc_start.isoformat()} to {calc_end.isoformat()}"
    elif norm_period == "daily":
        target = date_val or today
        calc_start = target
        calc_end = target
        period_label = target.strftime("%B %d, %Y")
    elif norm_period == "monthly":
        y = year or (date_val.year if date_val else today.year)
        m = month or (date_val.month if date_val else today.month)
        if not (1 <= m <= 12):
            raise ValidationError(
                f"Invalid month '{m}'. Must be between 1 and 12.",
                details={"month": m},
            )
        _, last_day = calendar.monthrange(y, m)
        calc_start = date(y, m, 1)
        calc_end = date(y, m, last_day)
        period_label = calc_start.strftime("%B %Y")
    elif norm_period == "quarterly":
        y = year or (date_val.year if date_val else today.year)
        q = quarter or ((today.month - 1) // 3 + 1)
        if q not in (1, 2, 3, 4):
            raise ValidationError(
                f"Invalid quarter '{q}'. Must be between 1 and 4.",
                details={"quarter": q},
            )
        quarter_months = {
            1: (1, 3, 31),
            2: (4, 6, 30),
            3: (7, 9, 30),
            4: (10, 12, 31),
        }
        sm, em, ed = quarter_months[q]
        calc_start = date(y, sm, 1)
        calc_end = date(y, em, ed)
        period_label = f"Q{q} {y}"

    # Single shared query helper guaranteeing derivation from exact same records
    rows = get_cases_data(session)

    # Filter cases received within target period
    filtered_rows = [
        (c, inst) for c, inst in rows
        if calc_start <= c.received_date <= calc_end
    ]
    total_cases = len(filtered_rows)

    # Disposed cases in this cohort
    disposed_cases = [c for c, _ in filtered_rows if c.status == CaseStatus.DISPOSED]
    open_cases_count = total_cases - len(disposed_cases)
    disposal_rate = round((len(disposed_cases) / total_cases * 100), 1) if total_cases > 0 else 0.0

    # Resolution time calculations for disposed cases in cohort
    res_days_list: List[int] = []
    within_sla_count = 0
    for c in disposed_cases:
        resolved_date = (
            c.last_action_date
            or c.expected_disposal_date
            or (c.created_at.date() if c.created_at else c.received_date)
        )
        days = max(0, (resolved_date - c.received_date).days)
        res_days_list.append(days)

        if c.expected_disposal_date is not None:
            if resolved_date <= c.expected_disposal_date:
                within_sla_count += 1
        else:
            within_sla_count += 1

    if res_days_list:
        avg_days = round(sum(res_days_list) / len(res_days_list), 1)
        median_days = round(float(statistics.median(res_days_list)), 1)
        min_days = min(res_days_list)
        max_days = max(res_days_list)
        sla_rate = round((within_sla_count / len(res_days_list) * 100), 1)
    else:
        avg_days = 0.0
        median_days = 0.0
        min_days = 0
        max_days = 0
        sla_rate = 0.0

    # Counts by status
    by_status = []
    for s in CaseStatus:
        count = sum(1 for c, _ in filtered_rows if c.status == s)
        pct = round((count / total_cases * 100), 2) if total_cases > 0 else 0.0
        by_status.append({
            "status": s.value,
            "label": s.value,
            "count": count,
            "percentage": pct,
        })

    # Counts by category
    by_category = []
    for cat in CaseCategory:
        count = sum(1 for c, _ in filtered_rows if c.category == cat)
        pct = round((count / total_cases * 100), 2) if total_cases > 0 else 0.0
        by_category.append({
            "category": cat.value,
            "label": cat.value,
            "count": count,
            "percentage": pct,
        })
    by_category.sort(key=lambda x: x["count"], reverse=True)

    # Counts by institution
    inst_counts: Dict[str, Dict[str, Any]] = {}
    for c, inst in filtered_rows:
        key = inst.permanent_id if inst else "UNKNOWN"
        name = inst.name if inst else "Unknown Institution"
        inst_id = inst.id if inst else None
        if key not in inst_counts:
            inst_counts[key] = {
                "institution_id": inst_id,
                "permanent_id": key,
                "name": name,
                "label": f"{name} ({key})" if key != "UNKNOWN" else name,
                "count": 0,
            }
        inst_counts[key]["count"] += 1

    by_institution = []
    for item in sorted(inst_counts.values(), key=lambda x: x["count"], reverse=True):
        pct = round((item["count"] / total_cases * 100), 2) if total_cases > 0 else 0.0
        by_institution.append({
            **item,
            "percentage": pct,
        })

    return {
        "period": norm_period,
        "period_label": period_label,
        "start_date": calc_start.isoformat(),
        "end_date": calc_end.isoformat(),
        "total_cases": total_cases,
        "summary": {
            "total_cases": total_cases,
            "disposed_cases": len(disposed_cases),
            "open_cases": open_cases_count,
            "disposal_rate": disposal_rate,
        },
        "by_status": by_status,
        "by_category": by_category,
        "by_institution": by_institution,
        "resolution_stats": {
            "total_cases": total_cases,
            "resolved_cases": len(disposed_cases),
            "open_cases": open_cases_count,
            "has_resolved_cases": len(res_days_list) > 0,
            "avg_days": avg_days,
            "median_days": median_days,
            "min_days": min_days,
            "max_days": max_days,
            "within_sla_count": within_sla_count,
            "sla_compliance_rate": sla_rate,
            "sla_compliance_display": f"{sla_rate}%" if len(res_days_list) > 0 else "N/A",
            "cohort_basis": "intake_cohort (cases received in period)",
        },
    }


def export_periodic_report_csv(
    session: Session,
    period: str = "monthly",
    date_val: Optional[date] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    quarter: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    today: Optional[date] = None,
) -> Tuple[str, str]:
    """Generate comprehensive CSV string and filename for periodic performance report."""
    report = get_periodic_report(
        session=session,
        period=period,
        date_val=date_val,
        year=year,
        month=month,
        quarter=quarter,
        start_date=start_date,
        end_date=end_date,
        today=today,
    )
    output = io.StringIO()
    writer = csv.writer(output)

    # 1. Header Information
    writer.writerow(["CASEBRIDGE PERIODIC PERFORMANCE REPORT"])
    writer.writerow(["Period Type", report["period"]])
    writer.writerow(["Period Range", report["period_label"]])
    writer.writerow(["Start Date", report["start_date"]])
    writer.writerow(["End Date", report["end_date"]])
    writer.writerow(["Total Cases Logged", report["total_cases"]])
    writer.writerow([])

    # 2. Key Resolution Metrics
    res = report["resolution_stats"]
    has_res = res.get("has_resolved_cases", res["resolved_cases"] > 0)
    writer.writerow(["RESOLUTION & SLA PERFORMANCE METRICS"])
    writer.writerow(["Metric", "Value", "Note"])
    writer.writerow(["Total Cases in Cohort", res["total_cases"], "Intake received in period"])
    writer.writerow(["Resolved Cases", res["resolved_cases"], "Disposed cases in cohort"])
    writer.writerow(["Open Cases", res["open_cases"], "Cases still under active process"])
    writer.writerow(["Disposal Rate (%)", f"{report['summary']['disposal_rate']}%", ""])
    writer.writerow(["Average Resolution Time (days)", res["avg_days"] if has_res else "N/A", "" if has_res else "No disposed cases in cohort"])
    writer.writerow(["Median Resolution Time (days)", res["median_days"] if has_res else "N/A", "" if has_res else "No disposed cases in cohort"])
    writer.writerow(["Minimum Resolution Time (days)", res["min_days"] if has_res else "N/A", "" if has_res else "No disposed cases in cohort"])
    writer.writerow(["Maximum Resolution Time (days)", res["max_days"] if has_res else "N/A", "" if has_res else "No disposed cases in cohort"])
    writer.writerow(["Resolved Within SLA Count", res["within_sla_count"], ""])
    writer.writerow(["SLA Compliance Rate (%)", f"{res['sla_compliance_rate']}%" if has_res else "N/A", "" if has_res else "No disposed cases in cohort"])
    writer.writerow([])

    # 3. Status Breakdown
    writer.writerow(["CASES BY STATUS"])
    writer.writerow(["Status", "Count", "Percentage"])
    for item in report["by_status"]:
        writer.writerow([item["label"], item["count"], f"{item['percentage']}%"])
    writer.writerow([])

    # 4. Category Breakdown
    writer.writerow(["CASES BY CATEGORY"])
    writer.writerow(["Category", "Count", "Percentage"])
    for item in report["by_category"]:
        writer.writerow([item["label"], item["count"], f"{item['percentage']}%"])
    writer.writerow([])

    # 5. Institution Breakdown
    writer.writerow(["CASES BY INSTITUTION"])
    writer.writerow(["Permanent ID", "Institution Name", "Count", "Percentage"])
    for item in report["by_institution"]:
        writer.writerow([item["permanent_id"], item["name"], item["count"], f"{item['percentage']}%"])

    filename = f"casebridge_periodic_report_{report['period']}_{report['start_date']}_{report['end_date']}.csv"
    return output.getvalue(), filename

