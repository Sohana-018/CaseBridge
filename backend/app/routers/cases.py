from datetime import date, datetime, timezone
from typing import Optional, Union
from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlmodel import Session, or_, select

from app.db import get_session
from app.errors import ForbiddenError, NotFoundError, ValidationError
from app.models import Case, CaseEvent, CaseStatus, Counter, EventType, Institution
from app.permissions import UserPayload, is_full_case_visible
from app.routers.auth import get_current_user
from app.schemas import (
    CaseCreate,
    CaseListResponse,
    CasePatch,
    CaseRead,
    CaseSummaryRead,
    InstitutionMini,
)
from app.services.email import send_complaint_submission_notification

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


def require_case_create_permission(current_user: UserPayload = Depends(get_current_user)) -> UserPayload:
    if current_user.role == "senior_management":
        raise ForbiddenError(
            "Role 'senior_management' cannot create cases.",
            details={"role": current_user.role},
        )
    return current_user


def require_case_patch_permission(current_user: UserPayload = Depends(get_current_user)) -> UserPayload:
    if current_user.role == "senior_management":
        raise ForbiddenError(
            "Role 'senior_management' is read-only and cannot patch cases.",
            details={"role": current_user.role},
        )
    return current_user


@router.post(
    "",
    response_model=CaseRead,
    status_code=201,
    summary="Create a new case (case_no auto-generated)",
    dependencies=[Depends(require_case_create_permission)],
)
def create_case(
    body: CaseCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Create a new case. case_no is generated by the backend inside a transaction.

    Per PRD Section 7:
    - case_no format: {PREFIX}-{YYYY}-{00001}; prefix map RB->RB, PGRC->PG, RO->RO, OC->OC.
    - Generated atomically using the counters table to ensure uniqueness.
    - bureau_officer may only create cases in their own bureau.
    - senior_management is read-only and may not create cases.
    """
    # Permission: bureau_officer restricted to own bureau; senior_management forbidden
    if current_user.role == "senior_management":
        raise ForbiddenError(
            "Role 'senior_management' cannot create cases.",
            details={"role": current_user.role},
        )
    if current_user.role == "bureau_officer":
        bureau_val = body.bureau.value if hasattr(body.bureau, "value") else str(body.bureau)
        if not current_user.bureau or current_user.bureau.upper() != bureau_val.upper():
            raise ForbiddenError(
                f"Bureau officers can only create cases in their own bureau ({current_user.bureau}).",
                details={"user_bureau": current_user.bureau, "case_bureau": bureau_val},
            )

    if body.received_date > date.today():
        raise ValidationError(
            "received_date cannot be in the future.",
            details={"received_date": str(body.received_date)},
        )

    # Resolve institution
    inst = session.exec(
        select(Institution).where(Institution.permanent_id == body.permanent_id)
    ).first()
    if not inst:
        raise NotFoundError(
            f"Institution with permanent_id '{body.permanent_id}' not found.",
            details={"permanent_id": body.permanent_id},
        )

    # Generate case_no atomically from counters table
    prefix_map = {"RB": "RB", "PGRC": "PG", "RO": "RO", "OC": "OC"}
    bureau_str = body.bureau.value if hasattr(body.bureau, "value") else str(body.bureau)
    year = body.received_date.year
    counter_key = f"{prefix_map[bureau_str]}-{year}"

    counter = session.get(Counter, counter_key)
    if not counter:
        counter = Counter(key=counter_key, value=0)
        session.add(counter)

    counter.value += 1
    case_no = f"{prefix_map[bureau_str]}-{year}-{counter.value:05d}"

    # Guard: case_no must not already exist (race condition safety)
    existing = session.exec(select(Case).where(Case.case_no == case_no)).first()
    if existing:
        raise ValidationError(
            f"Generated case_no '{case_no}' already exists. Try again.",
            details={"case_no": case_no},
        )

    now = datetime.now(timezone.utc)
    case = Case(
        case_no=case_no,
        institution_id=inst.id,
        bureau=body.bureau,
        category=body.category,
        description=body.description,
        received_date=body.received_date,
        status=CaseStatus.PENDING,
        assigned_officer=body.assigned_officer,
        next_action=body.next_action,
        expected_disposal_date=body.expected_disposal_date,
        priority=body.priority,
        complainant_name=body.complainant_name,
        complainant_email=body.complainant_email,
        created_at=now,
    )
    session.add(counter)
    session.add(case)
    session.commit()
    session.refresh(case)

    # Append the initial CREATED event
    event = CaseEvent(
        case_id=case.id,
        ts=datetime.combine(case.received_date, datetime.min.time(), tzinfo=timezone.utc),
        actor=current_user.name,
        bureau=case.bureau,
        event_type=EventType.CREATED,
        to_status=case.status,
        remarks=f"Case registered in {bureau_str} by {current_user.name}",
    )
    session.add(event)
    session.commit()

    # Trigger asynchronous email notification to the complainant if email is provided
    recipient = (case.complainant_email or "").strip()
    if recipient:
        category_str = case.category.value if hasattr(case.category, "value") else str(case.category)
        background_tasks.add_task(
            send_complaint_submission_notification,
            case_no=case.case_no,
            recipient_email=recipient,
            complainant_name=case.complainant_name or "Complainant",
            institution_name=inst.name,
            permanent_id=inst.permanent_id,
            bureau=bureau_str,
            category=category_str,
            received_date=str(case.received_date),
            description=case.description,
        )

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
        complainant_name=case.complainant_name,
        complainant_email=case.complainant_email,
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
            complainant_name=case.complainant_name,
            complainant_email=case.complainant_email,
        )

    return CaseSummaryRead(
        case_no=case.case_no,
        bureau=bureau_str,
        category=case.category.value if hasattr(case.category, "value") else str(case.category),
        status=case.status.value if hasattr(case.status, "value") else str(case.status),
        received_date=case.received_date,
    )


@router.patch(
    "/{case_no}",
    response_model=CaseRead,
    summary="Update editable case fields",
    dependencies=[Depends(require_case_patch_permission)],
)
def patch_case(
    case_no: str,
    body: CasePatch,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    """Update next_action, expected_disposal_date, assigned_officer, or priority on a case.

    Per PRD Section 10: only these four fields may be patched directly.
    All status/bureau changes must go through POST /cases/{case_no}/events.

    Permission rules:
    - bureau_officer: only for cases in their own bureau.
    - coordinator, administrator: any case.
    - senior_management: read-only, FORBIDDEN.
    """
    if current_user.role == "senior_management":
        raise ForbiddenError(
            "Role 'senior_management' is read-only and cannot patch cases.",
            details={"role": current_user.role},
        )

    result = session.exec(
        select(Case, Institution)
        .join(Institution, Case.institution_id == Institution.id)
        .where(Case.case_no == case_no)
    ).first()
    if not result:
        raise NotFoundError(f"Case '{case_no}' not found", details={"case_no": case_no})

    case, inst = result
    bureau_str = case.bureau.value if hasattr(case.bureau, "value") else str(case.bureau)

    if current_user.role == "bureau_officer":
        if not current_user.bureau or current_user.bureau.upper() != bureau_str.upper():
            raise ForbiddenError(
                f"Bureau officers can only patch their own Bureau's cases.",
                details={"user_bureau": current_user.bureau, "case_bureau": bureau_str},
            )

    # Apply only the fields explicitly provided (partial update)
    changed = False
    if body.next_action is not None:
        case.next_action = body.next_action
        changed = True
    if body.expected_disposal_date is not None:
        case.expected_disposal_date = body.expected_disposal_date
        changed = True
    if body.assigned_officer is not None:
        case.assigned_officer = body.assigned_officer
        changed = True
    if body.priority is not None:
        case.priority = body.priority
        changed = True
    if body.received_date is not None:
        if body.received_date > date.today():
            raise ValidationError(
                "received_date cannot be in the future.",
                details={"received_date": str(body.received_date)},
            )
        case.received_date = body.received_date
        changed = True

    if body.complainant_name is not None:
        case.complainant_name = body.complainant_name
        changed = True
    if body.complainant_email is not None:
        case.complainant_email = body.complainant_email
        changed = True

    if changed:
        session.add(case)
        session.commit()
        session.refresh(case)

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
        complainant_name=case.complainant_name,
        complainant_email=case.complainant_email,
    )
