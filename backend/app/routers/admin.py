from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr
from sqlalchemy import desc, func
from sqlmodel import Session, select

from app.auth_utils import hash_password
from app.db import get_session
from app.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.models import Alert, Bureau, Case, CaseEvent, Config, Institution, OverlapLink, User, UserRole, utc_now
from app.permissions import UserPayload, check_admin_permission
from app.routers.auth import VALID_BUREAUS, VALID_ROLES, get_current_user
from app.services.overlap import detect_overlaps, find_manual_verification_items

def require_admin(current_user: UserPayload = Depends(get_current_user)) -> UserPayload:
    """Enforce administrator role dependency before body parsing."""
    check_admin_permission(current_user)
    return current_user


router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])


class AdminUserResponse(BaseModel):
    id: int
    username: Optional[str] = None
    name: str
    role: str
    bureau: Optional[str] = None
    email: Optional[str] = None
    is_active: bool
    created_at: datetime


class CreateUserRequest(BaseModel):
    username: str
    name: str
    role: str
    bureau: Optional[str] = None
    email: Optional[str] = None
    password: str


class UpdateUserStatusRequest(BaseModel):
    is_active: bool


class ResetPasswordRequest(BaseModel):
    new_password: str


class ConfigItem(BaseModel):
    key: str
    value: str


class UpdateConfigRequest(BaseModel):
    configs: Dict[str, str]


class AuditLogItem(BaseModel):
    id: int
    case_id: int
    case_no: Optional[str] = None
    ts: datetime
    actor: str
    bureau: str
    event_type: str
    from_bureau: Optional[str] = None
    to_bureau: Optional[str] = None
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    remarks: Optional[str] = None


class SystemHealthResponse(BaseModel):
    total_users: int
    total_cases: int
    total_institutions: int
    total_overlaps: int
    open_overlaps: int
    open_alerts: int
    unassigned_cases: int
    cases_missing_deadline: int
    overdue_cases: int
    manual_verification_count: int = 0
    db_status: str


@router.get("/users", response_model=List[AdminUserResponse], summary="List all system users")
def list_users(
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    check_admin_permission(current_user)
    users = session.exec(select(User).order_by(User.id)).all()
    results = []
    for u in users:
        b_str = u.bureau.value if hasattr(u.bureau, "value") and u.bureau else (str(u.bureau) if u.bureau else None)
        results.append(
            AdminUserResponse(
                id=u.id,
                username=u.username,
                name=u.name,
                role=u.role,
                bureau=b_str,
                email=u.email,
                is_active=u.is_active,
                created_at=u.created_at,
            )
        )
    return results


@router.post("/users", response_model=AdminUserResponse, summary="Create a new user")
def create_user(
    request: CreateUserRequest,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    check_admin_permission(current_user)
    uname = request.username.strip().lower()
    if not uname:
        raise ValidationError("Username cannot be empty")
    if not request.password or len(request.password) < 4:
        raise ValidationError("Password must be at least 4 characters long")

    role = request.role.strip().lower()
    if role not in VALID_ROLES:
        raise ValidationError(f"Invalid role '{request.role}'. Allowed: {', '.join(sorted(VALID_ROLES))}")

    bureau_val = None
    if role == "bureau_officer":
        if not request.bureau:
            raise ValidationError("bureau is required for role 'bureau_officer'")
        b_clean = request.bureau.strip().upper()
        if b_clean not in VALID_BUREAUS:
            raise ValidationError(f"Invalid bureau '{request.bureau}'. Allowed: {', '.join(sorted(VALID_BUREAUS))}")
        bureau_val = Bureau(b_clean)

    # Check unique username
    existing = session.exec(select(User).where(func.lower(User.username) == uname)).first()
    if existing:
        raise ConflictError(f"Username '{request.username}' is already taken", details={"username": uname})

    new_user = User(
        username=uname,
        name=request.name.strip(),
        role=role,
        bureau=bureau_val,
        email=request.email.strip() if request.email else None,
        hashed_password=hash_password(request.password),
        is_active=True,
        created_at=utc_now(),
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)

    b_str = new_user.bureau.value if hasattr(new_user.bureau, "value") and new_user.bureau else (str(new_user.bureau) if new_user.bureau else None)
    return AdminUserResponse(
        id=new_user.id,
        username=new_user.username,
        name=new_user.name,
        role=new_user.role,
        bureau=b_str,
        email=new_user.email,
        is_active=new_user.is_active,
        created_at=new_user.created_at,
    )


@router.patch("/users/{user_id}/status", response_model=AdminUserResponse, summary="Toggle user active status")
def update_user_status(
    user_id: int,
    request: UpdateUserStatusRequest,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    check_admin_permission(current_user)
    user = session.get(User, user_id)
    if not user:
        raise NotFoundError(f"User #{user_id} not found")

    # Prevent deactivating yourself if you are an admin
    if current_user.username and user.username == current_user.username and not request.is_active:
        raise ForbiddenError("Administrators cannot deactivate their own active session")

    user.is_active = request.is_active
    session.add(user)
    session.commit()
    session.refresh(user)

    b_str = user.bureau.value if hasattr(user.bureau, "value") and user.bureau else (str(user.bureau) if user.bureau else None)
    return AdminUserResponse(
        id=user.id,
        username=user.username,
        name=user.name,
        role=user.role,
        bureau=b_str,
        email=user.email,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.post("/users/{user_id}/reset-password", summary="Reset password for a user")
def reset_user_password(
    user_id: int,
    request: ResetPasswordRequest,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    check_admin_permission(current_user)
    user = session.get(User, user_id)
    if not user:
        raise NotFoundError(f"User #{user_id} not found")

    if not request.new_password or len(request.new_password) < 4:
        raise ValidationError("Password must be at least 4 characters long")

    user.hashed_password = hash_password(request.new_password)
    session.add(user)
    session.commit()
    return {"message": f"Password reset successfully for user '{user.username or user.name}'"}


@router.get("/config", response_model=List[ConfigItem], summary="Get all system configuration items")
def get_config(
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    check_admin_permission(current_user)
    configs = session.exec(select(Config).order_by(Config.key)).all()
    return [ConfigItem(key=c.key, value=c.value) for c in configs]


@router.put("/config", summary="Update system configuration items")
def update_config(
    request: UpdateConfigRequest,
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    check_admin_permission(current_user)
    for k, v in request.configs.items():
        existing = session.get(Config, k)
        if existing:
            existing.value = str(v)
            session.add(existing)
        else:
            session.add(Config(key=k, value=str(v)))
    session.commit()
    return {"message": "Configuration updated successfully", "updated": len(request.configs)}


@router.get("/audit-logs", response_model=List[AuditLogItem], summary="View chronological audit logs")
def get_audit_logs(
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    check_admin_permission(current_user)
    events = session.exec(
        select(CaseEvent).order_by(desc(CaseEvent.ts)).limit(limit)
    ).all()

    # Preload cases for case_no mapping
    case_ids = {e.case_id for e in events}
    cases_map = {}
    if case_ids:
        cases = session.exec(select(Case).where(Case.id.in_(case_ids))).all()
        cases_map = {c.id: c.case_no for c in cases}

    results = []
    for e in events:
        b_str = e.bureau.value if hasattr(e.bureau, "value") else str(e.bureau)
        from_b = e.from_bureau.value if hasattr(e.from_bureau, "value") and e.from_bureau else (str(e.from_bureau) if e.from_bureau else None)
        to_b = e.to_bureau.value if hasattr(e.to_bureau, "value") and e.to_bureau else (str(e.to_bureau) if e.to_bureau else None)
        from_s = e.from_status.value if hasattr(e.from_status, "value") and e.from_status else (str(e.from_status) if e.from_status else None)
        to_s = e.to_status.value if hasattr(e.to_status, "value") and e.to_status else (str(e.to_status) if e.to_status else None)

        results.append(
            AuditLogItem(
                id=e.id,
                case_id=e.case_id,
                case_no=cases_map.get(e.case_id),
                ts=e.ts,
                actor=e.actor,
                bureau=b_str,
                event_type=e.event_type.value if hasattr(e.event_type, "value") else str(e.event_type),
                from_bureau=from_b,
                to_bureau=to_b,
                from_status=from_s,
                to_status=to_s,
                remarks=e.remarks,
            )
        )
    return results


@router.get("/health-summary", response_model=SystemHealthResponse, summary="Get system health and data quality metrics")
def get_health_summary(
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    check_admin_permission(current_user)

    total_users = len(session.exec(select(User)).all())
    cases = session.exec(select(Case)).all()
    total_cases = len(cases)
    total_institutions = len(session.exec(select(Institution)).all())
    overlaps = session.exec(select(OverlapLink)).all()
    total_overlaps = len(overlaps)
    open_overlaps = sum(
        1 for o in overlaps
        if (o.review_status.value if hasattr(o.review_status, "value") else str(o.review_status)) == "open"
        and (o.confidence_band.value if hasattr(o.confidence_band, "value") else str(o.confidence_band)) in ["high", "medium"]
    )
    
    alerts = session.exec(select(Alert).where(Alert.status == "open")).all()
    open_alerts = len(alerts)

    today = datetime.now(timezone.utc).date()
    unassigned = 0
    missing_deadline = 0
    overdue = 0

    for c in cases:
        if not c.assigned_officer or not c.assigned_officer.strip():
            unassigned += 1
        if not c.expected_disposal_date:
            missing_deadline += 1
        elif c.expected_disposal_date < today and (c.status.value if hasattr(c.status, "value") else str(c.status)) not in ("disposed",):
            overdue += 1

    return SystemHealthResponse(
        total_users=total_users,
        total_cases=total_cases,
        total_institutions=total_institutions,
        total_overlaps=total_overlaps,
        open_overlaps=open_overlaps,
        open_alerts=open_alerts,
        unassigned_cases=unassigned,
        cases_missing_deadline=missing_deadline,
        overdue_cases=overdue,
        manual_verification_count=len(find_manual_verification_items(session)),
        db_status="Operational (SQLite)",
    )


@router.post("/scan-overlaps", summary="Trigger full overlap scan")
def trigger_overlap_scan(
    session: Session = Depends(get_session),
    current_user: UserPayload = Depends(get_current_user),
):
    check_admin_permission(current_user)
    created = detect_overlaps(session)
    return {"message": f"Scan completed successfully. {created} new overlap pairs detected.", "created": created}
