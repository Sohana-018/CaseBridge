from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, or_, select

from app.db import get_session
from app.errors import NotFoundError
from app.models import Case, Institution
from app.permissions import UserPayload, is_full_case_visible
from app.routers.auth import get_current_user
from app.schemas import (
    CaseRead,
    CaseSummaryRead,
    InstitutionDetailRead,
    InstitutionListResponse,
    InstitutionMini,
    InstitutionRead,
)

router = APIRouter(prefix="/institutions", tags=["Institutions"])


@router.get(
    "",
    response_model=InstitutionListResponse,
    summary="List institutions with search and region filtering",
)
def list_institutions(
    query: Optional[str] = Query(default=None, description="Search by institution name or permanent_id"),
    region: Optional[str] = Query(default=None, description="Filter by region (e.g. North, South, Central)"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Search and filter institutions. Accessible to all authenticated roles."""
    base_query = select(Institution)

    if query and query.strip():
        term = f"%{query.strip()}%"
        base_query = base_query.where(
            or_(
                Institution.name.ilike(term),
                Institution.permanent_id.ilike(term),
            )
        )

    if region and region.strip():
        base_query = base_query.where(Institution.region == region.strip())

    all_matches = session.exec(base_query).all()
    total = len(all_matches)

    offset = (page - 1) * page_size
    paginated_query = base_query.order_by(Institution.name.asc(), Institution.id.asc()).offset(offset).limit(page_size)
    results = session.exec(paginated_query).all()

    items = [
        InstitutionRead(
            id=inst.id,
            permanent_id=inst.permanent_id,
            name=inst.name,
            address=inst.address,
            region=inst.region.value if hasattr(inst.region, "value") else str(inst.region),
            state=inst.state,
            type=inst.type,
        )
        for inst in results
    ]

    return InstitutionListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{permanent_id}",
    response_model=InstitutionDetailRead,
    summary="Get institution profile with consolidated cases and open overlaps",
)
def get_institution_detail(
    permanent_id: str,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Retrieve institution profile, its associated cases, and open overlaps.

    Visibility rules (Section 3):
    - Bureau Officers see full details only for cases belonging to their own Bureau.
      For other Bureaus' cases, only summary fields are returned (case_no, bureau, category, status, received_date).
    - Coordinators, Senior Management, and Administrators see full details for all cases.
    """
    inst = session.exec(select(Institution).where(Institution.permanent_id == permanent_id)).first()
    if not inst:
        raise NotFoundError(
            f"Institution '{permanent_id}' not found",
            details={"permanent_id": permanent_id},
        )

    cases = session.exec(
        select(Case)
        .where(Case.institution_id == inst.id)
        .order_by(Case.received_date.desc(), Case.id.desc())
    ).all()

    case_items = []
    inst_region = inst.region.value if hasattr(inst.region, "value") else str(inst.region)

    for c in cases:
        bureau_str = c.bureau.value if hasattr(c.bureau, "value") else str(c.bureau)
        if is_full_case_visible(current_user, bureau_str):
            case_items.append(
                CaseRead(
                    case_no=c.case_no,
                    institution=InstitutionMini(
                        permanent_id=inst.permanent_id,
                        name=inst.name,
                        region=inst_region,
                    ),
                    bureau=bureau_str,
                    category=c.category.value if hasattr(c.category, "value") else str(c.category),
                    description=c.description,
                    received_date=c.received_date,
                    status=c.status.value if hasattr(c.status, "value") else str(c.status),
                    assigned_officer=c.assigned_officer,
                    last_action=c.last_action,
                    last_action_date=c.last_action_date,
                    next_action=c.next_action,
                    expected_disposal_date=c.expected_disposal_date,
                    overdue=c.overdue,
                    priority=c.priority.value if hasattr(c.priority, "value") else str(c.priority),
                )
            )
        else:
            case_items.append(
                CaseSummaryRead(
                    case_no=c.case_no,
                    bureau=bureau_str,
                    category=c.category.value if hasattr(c.category, "value") else str(c.category),
                    status=c.status.value if hasattr(c.status, "value") else str(c.status),
                    received_date=c.received_date,
                )
            )

    return InstitutionDetailRead(
        id=inst.id,
        permanent_id=inst.permanent_id,
        name=inst.name,
        address=inst.address,
        region=inst_region,
        state=inst.state,
        type=inst.type,
        cases=case_items,
        open_overlaps=[],
    )
