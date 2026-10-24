from datetime import date
from typing import Optional, Union
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, and_, or_, select

from app.db import get_session
from app.errors import NotFoundError
from app.models import Case, CaseStatus, Institution
from app.permissions import UserPayload, is_full_case_visible
from app.routers.auth import get_current_user
from app.schemas import (
    CaseListResponse,
    CaseRead,
    CaseSummaryRead,
    InstitutionMini,
)

router = APIRouter(prefix="/cases", tags=["Cases"])


@router.get(
    "",
    response_model=CaseListResponse,
    summary="List cases with combinable search and filters",
)
def list_cases(
    query: Optional[str] = Query(default=None, description="Search by case number, institution name, or permanent_id"),
    search: Optional[str] = Query(default=None, description="Alias for query"),
    institution: Optional[str] = Query(default=None, description="Filter by institution name or permanent_id"),
    bureau: Optional[str] = Query(default=None, description="Filter by bureau (RB, PGRC, RO, OC)"),
    region: Optional[str] = Query(default=None, description="Filter by region (North, South, East, West, Central)"),
    category: Optional[str] = Query(default=None, description="Filter by category"),
    status: Optional[str] = Query(default=None, description="Filter by status"),
    date_from: Optional[date] = Query(default=None, description="Filter by received_date >= date_from"),
    date_to: Optional[date] = Query(default=None, description="Filter by received_date <= date_to"),
    overdue: Optional[bool] = Query(default=None, description="Filter by overdue status (true/false)"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Retrieve paginated case list with combinable filters.

    Visibility rules (Section 3):
    - Bureau Officers see full details only for cases belonging to their own Bureau.
      For other Bureaus' cases, only summary fields are returned (case_no, bureau, category, status, received_date).
    - Coordinators, Senior Management, and Administrators see full details for all cases.
    """
    base_query = select(Case, Institution).join(Institution, Case.institution_id == Institution.id)

    search_term = query or search
    if search_term and search_term.strip():
        term = f"%{search_term.strip()}%"
        base_query = base_query.where(
            or_(
                Case.case_no.ilike(term),
                Institution.name.ilike(term),
                Institution.permanent_id.ilike(term),
            )
        )

    if institution and institution.strip():
        inst_val = f"%{institution.strip()}%"
        base_query = base_query.where(
            or_(
                Institution.permanent_id.ilike(inst_val),
                Institution.name.ilike(inst_val),
            )
        )

    if bureau and bureau.strip():
        base_query = base_query.where(Case.bureau == bureau.strip().upper())

    if region and region.strip():
        base_query = base_query.where(Institution.region == region.strip().capitalize())

    if category and category.strip():
        base_query = base_query.where(Case.category == category.strip().lower())

    if status and status.strip():
        base_query = base_query.where(Case.status == status.strip().lower())

    if date_from:
        base_query = base_query.where(Case.received_date >= date_from)

    if date_to:
        base_query = base_query.where(Case.received_date <= date_to)

    if overdue is not None:
        today = date.today()
        if overdue:
            base_query = base_query.where(
                Case.status != CaseStatus.DISPOSED,
                Case.expected_disposal_date.isnot(None),
                Case.expected_disposal_date < today,
            )
        else:
            base_query = base_query.where(
                or_(
                    Case.status == CaseStatus.DISPOSED,
                    Case.expected_disposal_date.is_(None),
                    Case.expected_disposal_date >= today,
                )
            )

    all_matches = session.exec(base_query).all()
    total = len(all_matches)

    offset = (page - 1) * page_size
    paginated_query = (
        base_query.order_by(Case.received_date.desc(), Case.id.desc())
        .offset(offset)
        .limit(page_size)
    )
    results = session.exec(paginated_query).all()

    items = []
    for case, inst in results:
        bureau_str = case.bureau.value if hasattr(case.bureau, "value") else str(case.bureau)
        if is_full_case_visible(current_user, bureau_str):
            inst_region = inst.region.value if hasattr(inst.region, "value") else str(inst.region)
            items.append(
                CaseRead(
                    case_no=case.case_no,
                    institution=InstitutionMini(
                        permanent_id=inst.permanent_id,
                        name=inst.name,
                        region=inst_region,
                    ),
                    bureau=bureau_str,
                    category=case.category.value if hasattr(case.category, "value") else str(case.category),
                    description=case.description,
                    received_date=case.received_date,
                    status=case.status.value if hasattr(case.status, "value") else str(case.status),
                    assigned_officer=case.assigned_officer,
                    last_action=case.last_action,
                    last_action_date=case.last_action_date,
                    next_action=case.next_action,
                    expected_disposal_date=case.expected_disposal_date,
                    overdue=case.overdue,
                    priority=case.priority.value if hasattr(case.priority, "value") else str(case.priority),
                )
            )
        else:
            items.append(
                CaseSummaryRead(
                    case_no=case.case_no,
                    bureau=bureau_str,
                    category=case.category.value if hasattr(case.category, "value") else str(case.category),
                    status=case.status.value if hasattr(case.status, "value") else str(case.status),
                    received_date=case.received_date,
                )
            )

    return CaseListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{case_no}",
    response_model=Union[CaseRead, CaseSummaryRead],
    summary="Get case details by case number",
)
def get_case(
    case_no: str,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Retrieve case record by unique case_no.

    Per Section 3 & 10:
    - Officers receive summary-only fields if the case belongs to another Bureau.
    - Full details are returned for own Bureau's cases or Coordinator/Senior Management/Admin.
    """
    result = session.exec(
        select(Case, Institution)
        .join(Institution, Case.institution_id == Institution.id)
        .where(Case.case_no == case_no)
    ).first()

    if not result:
        raise NotFoundError(f"Case '{case_no}' not found", details={"case_no": case_no})

    case, inst = result
    bureau_str = case.bureau.value if hasattr(case.bureau, "value") else str(case.bureau)

    if is_full_case_visible(current_user, bureau_str):
        inst_region = inst.region.value if hasattr(inst.region, "value") else str(inst.region)
        return CaseRead(
            case_no=case.case_no,
            institution=InstitutionMini(
                permanent_id=inst.permanent_id,
                name=inst.name,
                region=inst_region,
            ),
            bureau=bureau_str,
            category=case.category.value if hasattr(case.category, "value") else str(case.category),
            description=case.description,
            received_date=case.received_date,
            status=case.status.value if hasattr(case.status, "value") else str(case.status),
            assigned_officer=case.assigned_officer,
            last_action=case.last_action,
            last_action_date=case.last_action_date,
            next_action=case.next_action,
            expected_disposal_date=case.expected_disposal_date,
            overdue=case.overdue,
            priority=case.priority.value if hasattr(case.priority, "value") else str(case.priority),
        )

    return CaseSummaryRead(
        case_no=case.case_no,
        bureau=bureau_str,
        category=case.category.value if hasattr(case.category, "value") else str(case.category),
        status=case.status.value if hasattr(case.status, "value") else str(case.status),
        received_date=case.received_date,
    )
