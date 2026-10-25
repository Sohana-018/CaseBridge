import logging
from typing import Dict, List, Optional
import bcrypt
from sqlmodel import Session, select

from app.models import Bureau, Config, User, UserRole

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    """Hash plain-text password using bcrypt with random salt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against hashed password."""
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


DEFAULT_SYSTEM_USERS: List[Dict[str, Optional[str]]] = [
    {
        "username": "admin",
        "name": "System Administrator",
        "role": UserRole.ADMINISTRATOR.value,
        "bureau": None,
        "email": "admin@aicte.gov.in",
        "password": "admin123",
    },
    {
        "username": "coordinator",
        "name": "Grievance Coordinator",
        "role": UserRole.COORDINATOR.value,
        "bureau": None,
        "email": "coordinator@aicte.gov.in",
        "password": "coord123",
    },
    {
        "username": "officer_rb",
        "name": "Regulation Bureau Officer",
        "role": UserRole.BUREAU_OFFICER.value,
        "bureau": Bureau.RB.value,
        "email": "officer.rb@aicte.gov.in",
        "password": "officer123",
    },
    {
        "username": "officer_pgrc",
        "name": "PGRC Bureau Officer",
        "role": UserRole.BUREAU_OFFICER.value,
        "bureau": Bureau.PGRC.value,
        "email": "officer.pgrc@aicte.gov.in",
        "password": "officer123",
    },
    {
        "username": "management",
        "name": "Senior Management Executive",
        "role": UserRole.SENIOR_MANAGEMENT.value,
        "bureau": None,
        "email": "management@aicte.gov.in",
        "password": "mgmt123",
    },
]

DEFAULT_CONFIG_ENTRIES = [
    ("sla_warn_days", "3"),
    ("sla_breach_days", "14"),
    ("max_active_cases_per_officer", "25"),
    ("auto_scan_enabled", "true"),
    ("system_mode", "demo"),
    ("organization_name", "All India Council for Technical Education (AICTE)"),
]


def seed_default_users_and_config(session: Session) -> None:
    """Ensure default system accounts and configuration keys are initialized."""
    # Seed or sync default users
    for user_data in DEFAULT_SYSTEM_USERS:
        uname = user_data["username"]
        existing = session.exec(select(User).where(User.username == uname)).first()
        if not existing:
            bureau_val = None
            if user_data["bureau"]:
                bureau_val = Bureau(user_data["bureau"])
            user = User(
                username=uname,
                name=user_data["name"] or uname,
                role=user_data["role"],
                bureau=bureau_val,
                email=user_data["email"],
                hashed_password=hash_password(user_data["password"] or "demo123"),
                is_active=True,
            )
            session.add(user)
            logger.info("Created system user '%s' (%s)", uname, user_data["role"])

    # Seed default configs if missing
    for key, val in DEFAULT_CONFIG_ENTRIES:
        cfg = session.get(Config, key)
        if not cfg:
            session.add(Config(key=key, value=val))
            logger.info("Initialized default config '%s' = '%s'", key, val)

    session.commit()
