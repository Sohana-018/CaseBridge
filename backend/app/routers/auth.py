from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header
import jwt
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.auth_utils import verify_password
from app.db import get_session
from app.errors import ForbiddenError, ValidationError
from app.models import User
from app.permissions import UserPayload

# Load environment variables
BASE_DIR = Path(__file__).resolve().parent.parent.parent
env_file = BASE_DIR / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)

JWT_SECRET = os.getenv("JWT_SECRET", "demo-secret-key-for-casebridge-sih26264")
JWT_ALGORITHM = "HS256"

VALID_ROLES = {
    "bureau_officer",
    "coordinator",
    "senior_management",
    "administrator",
}

VALID_BUREAUS = {"RB", "PGRC", "RO", "OC"}

router = APIRouter(prefix="", tags=["Auth"])


class LoginRequest(BaseModel):
    role: str
    bureau: Optional[str] = None
    name: Optional[str] = None


class RealLoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: UserPayload


def create_token(user: UserPayload) -> str:
    """Generate a signed JWT token containing role, bureau, name, and username."""
    payload = {
        "sub": user.username or user.name,
        "username": user.username,
        "role": user.role,
        "bureau": user.bureau,
        "name": user.name,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> UserPayload:
    """Reusable dependency to extract and verify JWT bearer token.

    Returns FORBIDDEN in the shared error format if missing or invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise ForbiddenError(
            "Missing or invalid authentication token. Provide Authorization: Bearer <token>",
            details={"authorization": authorization},
        )

    token = authorization.split(" ", 1)[1].strip()

    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return UserPayload(
            role=decoded["role"],
            bureau=decoded.get("bureau"),
            name=decoded.get("name", "Demo User"),
            username=decoded.get("username") or decoded.get("sub"),
        )
    except Exception as e:
        raise ForbiddenError(
            f"Invalid or expired authentication token: {str(e)}",
            details={"error": str(e)},
        )


@router.post(
    "/auth/login",
    response_model=LoginResponse,
    summary="Real User Authentication with username & password",
)
def login_with_credentials(
    request: RealLoginRequest,
    session: Session = Depends(get_session),
):
    """Authenticate with username and password, returning a signed JWT token."""
    uname = request.username.strip().lower()
    if not uname or not request.password:
        raise ValidationError("Username and password are required")

    user = session.exec(select(User).where(func.lower(User.username) == uname)).first()
    if not user or not user.hashed_password:
        raise ForbiddenError("Invalid username or password", details={"username": request.username})

    if not verify_password(request.password, user.hashed_password):
        raise ForbiddenError("Invalid username or password", details={"username": request.username})

    if not user.is_active:
        raise ForbiddenError(
            "Account has been deactivated. Please contact an administrator.",
            details={"username": request.username},
        )

    bureau_str = user.bureau.value if hasattr(user.bureau, "value") and user.bureau else (str(user.bureau) if user.bureau else None)

    user_payload = UserPayload(
        username=user.username,
        name=user.name,
        role=user.role,
        bureau=bureau_str,
    )
    token = create_token(user_payload)

    return LoginResponse(
        token=token,
        user=user_payload,
    )


@router.post(
    "/auth/mock-login",
    response_model=LoginResponse,
    summary="Mock Login endpoint returning demo JWT and user profile",
)
def mock_login(request: LoginRequest):
    """Authenticate as a demo role and receive a signed JWT token."""
    role = request.role.strip().lower()

    if role not in VALID_ROLES:
        raise ValidationError(
            f"Invalid role '{request.role}'. Allowed roles are: {', '.join(sorted(VALID_ROLES))}",
            details={"role": request.role},
        )

    bureau = None
    if role == "bureau_officer":
        if not request.bureau or not request.bureau.strip():
            raise ValidationError(
                "Role 'bureau_officer' requires a 'bureau' to be specified.",
                details={"bureau": request.bureau},
            )
        bureau_val = request.bureau.strip().upper()
        if bureau_val not in VALID_BUREAUS:
            raise ValidationError(
                f"Invalid bureau '{request.bureau}'. Allowed bureaus are: {', '.join(sorted(VALID_BUREAUS))}",
                details={"bureau": request.bureau},
            )
        bureau = bureau_val

    # Default readable demo name if not provided
    name = request.name
    if not name or not name.strip():
        if role == "bureau_officer":
            name = f"{bureau} Officer (demo)"
        elif role == "coordinator":
            name = "Demo Coordinator"
        elif role == "senior_management":
            name = "Senior Management (demo)"
        elif role == "administrator":
            name = "Demo Administrator"
    else:
        name = name.strip()

    user = UserPayload(
        role=role,
        bureau=bureau,
        name=name,
        username=role,
    )
    token = create_token(user)

    return LoginResponse(
        token=token,
        user=user,
    )


@router.get(
    "/auth/demo-accounts",
    response_model=List[Dict[str, Any]],
    summary="Get pre-seeded demo accounts for one-click judging demo",
)
def get_demo_accounts():
    """List available demo credentials for fast login during evaluation."""
    return [
        {
            "username": "admin",
            "name": "System Administrator",
            "role": "administrator",
            "bureau": None,
            "badge": "Admin",
            "password_hint": "admin123",
        },
        {
            "username": "coordinator",
            "name": "Central Grievance Coordinator",
            "role": "coordinator",
            "bureau": None,
            "badge": "Coordinator",
            "password_hint": "coord123",
        },
        {
            "username": "officer_rb",
            "name": "Regulation Bureau Officer",
            "role": "bureau_officer",
            "bureau": "RB",
            "badge": "RB Officer",
            "password_hint": "officer123",
        },
        {
            "username": "officer_pgrc",
            "name": "PGRC Bureau Officer",
            "role": "bureau_officer",
            "bureau": "PGRC",
            "badge": "PGRC Officer",
            "password_hint": "officer123",
        },
        {
            "username": "management",
            "name": "Senior Management Executive",
            "role": "senior_management",
            "bureau": None,
            "badge": "Management (Read-only)",
            "password_hint": "mgmt123",
        },
    ]


@router.get(
    "/me",
    response_model=UserPayload,
    summary="Get current authenticated user profile",
)
def get_me(current_user: UserPayload = Depends(get_current_user)):
    """Retrieve profile of the authenticated user from the JWT token."""
    return current_user
