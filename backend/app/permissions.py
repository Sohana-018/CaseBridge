"""Permissions module for CaseBridge access control (Section 3, 8 FR18).

Enforces role-based visibility and actions across Bureaus and Cells:
- bureau_officer:
    - Can only post events on cases matching their own bureau.
    - Can acknowledge and refresh alerts.
    - Read-only access to cross-bureau cases.
- coordinator:
    - Full coordination rights across any bureau.
    - Can post events on any case.
    - Can acknowledge and refresh alerts.
- senior_management:
    - Read-only dashboard and reports.
    - Cannot edit or post events on cases (FORBIDDEN).
    - Cannot acknowledge or refresh alerts (FORBIDDEN).
- administrator:
    - Can manage config and refresh/ack alerts.
    - Cannot post case events as a coordinator/officer (FORBIDDEN).
"""

from typing import Optional
from pydantic import BaseModel

from app.errors import ForbiddenError
from app.models import Case


class UserPayload(BaseModel):
    """Authenticated user representation carried inside the JWT."""
    name: str
    role: str
    bureau: Optional[str] = None


def check_event_post_permission(user: UserPayload, case: Case) -> None:
    """Enforce permission rules for posting events on a case.

    Rules:
    - bureau_officer: only for cases in their own bureau.
    - coordinator: for any case.
    - senior_management and administrator: get FORBIDDEN.
    """
    if user.role == "coordinator":
        return

    if user.role == "bureau_officer":
        case_bureau_val = case.bureau.value if hasattr(case.bureau, "value") else str(case.bureau)
        if not user.bureau or user.bureau != case_bureau_val:
            raise ForbiddenError(
                f"Bureau officers can only post events on their own Bureau's cases (officer bureau: {user.bureau}, case bureau: {case_bureau_val})",
                details={
                    "user_bureau": user.bureau,
                    "case_bureau": case_bureau_val,
                },
            )
        return

    # senior_management, administrator, or any unrecognized role
    raise ForbiddenError(
        f"Role '{user.role}' is not permitted to post events on cases.",
        details={"role": user.role},
    )


def check_alert_action_permission(user: UserPayload) -> None:
    """Enforce permission rules for acknowledging or refreshing alerts.

    Rules:
    - bureau_officer, coordinator, administrator: permitted.
    - senior_management: get FORBIDDEN.
    """
    allowed_roles = {"bureau_officer", "coordinator", "administrator"}
    if user.role in allowed_roles:
        return

    raise ForbiddenError(
        f"Role '{user.role}' is not permitted to perform alert actions.",
        details={"role": user.role},
    )
