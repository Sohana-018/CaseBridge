# NOTE: This authentication system uses mock login and signed demo JWTs.
# Per PRD Section 3: "Auth is mock: pick a role at login, a token carries role and bureau.
# This is a demo; it is not real security."

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header
import jwt
from pydantic import BaseModel

from app.errors import ForbiddenError, ValidationError
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


class LoginResponse(BaseModel):
    token: str
    user: UserPayload


def create_token(user: UserPayload) -> str:
    """Generate a signed JWT token containing role, bureau, and name (Demo Token)."""
    payload = {
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
        )
    except Exception as e:
        raise ForbiddenError(
            f"Invalid or expired authentication token: {str(e)}",
            details={"error": str(e)},
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
    )
    token = create_token(user)

    return LoginResponse(
        token=token,
        user=user,
    )


@router.get(
    "/me",
    response_model=UserPayload,
    summary="Get current authenticated user profile",
)
def get_me(current_user: UserPayload = Depends(get_current_user)):
    """Retrieve profile of the authenticated user from the JWT token."""
    return current_user
