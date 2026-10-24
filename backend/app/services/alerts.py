from datetime import date, datetime, timedelta, timezone
from typing import Optional
from sqlmodel import Session, select

from app.errors import NotFoundError
from app.models import Alert, AlertType, Case, CaseStatus, Config, Priority


def get_or_create_config(session: Session, key: str, default_value: str) -> str:
    """Retrieve config value by key, creating it with default_value if missing."""
    cfg = session.get(Config, key)
    if not cfg:
        cfg = Config(key=key, value=default_value)
        session.add(cfg)
        session.commit()
        session.refresh(cfg)
    return cfg.value


def create_escalation_alert(
    session: Session,
    case_id: int,
    remarks: Optional[str] = None,
) -> Alert:
    """Create an escalation alert for a case (called when escalation event is recorded)."""
    # At most one open alert per (case, type)
    existing_open = session.exec(
        select(Alert).where(
            Alert.case_id == case_id,
            Alert.type == AlertType.ESCALATION,
            Alert.status == "open",
        )
    ).first()

    if existing_open:
        return existing_open

    msg = f"Case escalated: {remarks.strip()}" if remarks and remarks.strip() else "Case escalated: coordination required"
    alert = Alert(
        type=AlertType.ESCALATION,
        case_id=case_id,
        link_id=None,
        message=msg,
        priority=Priority.HIGH,
        status="open",
        created_at=datetime.now(timezone.utc),
    )
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return alert


def create_overlap_alert(
    session: Session,
    link_id: int,
    case_no: Optional[str] = None,
    commit: bool = True,
) -> Alert:
    """Create an overlap alert for coordination when a pair is flagged.

    ``commit=False`` lets a caller (e.g. the overlap scan) keep the whole
    operation in one transaction.
    """
    case_id = None
    if case_no:
        case = session.exec(select(Case).where(Case.case_no == case_no)).first()
        if case:
            case_id = case.id

    existing_open = session.exec(
        select(Alert).where(
            Alert.link_id == link_id,
            Alert.case_id == case_id,
            Alert.type == AlertType.OVERLAP,
            Alert.status == "open",
        )
    ).first()

    if existing_open:
        return existing_open

    alert = Alert(
        type=AlertType.OVERLAP,
        case_id=case_id,
        link_id=link_id,
        message="Potential overlapping cases. Coordination required",
        priority=Priority.HIGH,
        status="open",
        created_at=datetime.now(timezone.utc),
    )
    session.add(alert)
    if commit:
        session.commit()
        session.refresh(alert)
    else:
        session.flush()
    return alert


def refresh_alerts(session: Session, today: Optional[date] = None) -> int:
    """Evaluate cases and refresh alerts based on config rules.

    Rules per PRD Section 8 (FR13, FR14):
    - Reads pending_days (default 7) and sla_warn_days (default 3) from config.
    - Creates alerts for cases whose status is not "disposed":
      - pending_reminder: last_action_date older than pending_days (Priority: LOW).
      - sla_warning: expected_disposal_date within the next sla_warn_days days (Priority: MEDIUM).
      - sla_breach: expected_disposal_date earlier than today (Priority: HIGH).
    - At most one open alert per (case, type); running refresh twice creates no duplicates.
    - If a case becomes disposed or condition no longer applies, sets open alerts to "closed".
    - Messages say "(demo rule)" where a rule is involved.
    - today can be injected for testing.
    """
    if today is None:
        today = date.today()

    pending_days = int(get_or_create_config(session, "pending_days", "7"))
    sla_warn_days = int(get_or_create_config(session, "sla_warn_days", "3"))

    cases = session.exec(select(Case)).all()
    created_count = 0

    for case in cases:
        # 1. If case is disposed: close all open alerts for this case
        if case.status == CaseStatus.DISPOSED:
            open_alerts = session.exec(
                select(Alert).where(
                    Alert.case_id == case.id,
                    Alert.status == "open",
                )
            ).all()
            for a in open_alerts:
                a.status = "closed"
                session.add(a)
            continue

        # 2. Case is not disposed: evaluate active rule conditions
        # Condition A: pending_reminder
        is_pending_reminder = (
            case.last_action_date is not None
            and (today - case.last_action_date).days > pending_days
        )
        existing_pending = session.exec(
            select(Alert).where(
                Alert.case_id == case.id,
                Alert.type == AlertType.PENDING_REMINDER,
                Alert.status == "open",
            )
        ).first()

        if is_pending_reminder:
            if not existing_pending:
                alert = Alert(
                    type=AlertType.PENDING_REMINDER,
                    case_id=case.id,
                    message=f"No action for more than {pending_days} days (demo rule)",
                    priority=Priority.LOW,
                    status="open",
                    created_at=datetime.now(timezone.utc),
                )
                session.add(alert)
                created_count += 1
        else:
            if existing_pending:
                existing_pending.status = "closed"
                session.add(existing_pending)

        # Condition B: sla_warning
        # Warning window: expected_disposal_date between today and today + sla_warn_days (inclusive)
        is_sla_warning = (
            case.expected_disposal_date is not None
            and today <= case.expected_disposal_date <= (today + timedelta(days=sla_warn_days))
        )
        existing_sla_warning = session.exec(
            select(Alert).where(
                Alert.case_id == case.id,
                Alert.type == AlertType.SLA_WARNING,
                Alert.status == "open",
            )
        ).first()

        if is_sla_warning:
            if not existing_sla_warning:
                due_datetime = datetime.combine(
                    case.expected_disposal_date, datetime.min.time(), tzinfo=timezone.utc
                )
                alert = Alert(
                    type=AlertType.SLA_WARNING,
                    case_id=case.id,
                    message=f"Expected disposal within {sla_warn_days} days (demo rule)",
                    priority=Priority.MEDIUM,
                    status="open",
                    due_at=due_datetime,
                    created_at=datetime.now(timezone.utc),
                )
                session.add(alert)
                created_count += 1
        else:
            if existing_sla_warning:
                existing_sla_warning.status = "closed"
                session.add(existing_sla_warning)

        # Condition C: sla_breach
        # Breach: expected_disposal_date earlier than today
        is_sla_breach = (
            case.expected_disposal_date is not None
            and case.expected_disposal_date < today
        )
        existing_sla_breach = session.exec(
            select(Alert).where(
                Alert.case_id == case.id,
                Alert.type == AlertType.SLA_BREACH,
                Alert.status == "open",
            )
        ).first()

        if is_sla_breach:
            if not existing_sla_breach:
                due_datetime = datetime.combine(
                    case.expected_disposal_date, datetime.min.time(), tzinfo=timezone.utc
                )
                alert = Alert(
                    type=AlertType.SLA_BREACH,
                    case_id=case.id,
                    message="Expected disposal date passed without disposal (demo rule)",
                    priority=Priority.HIGH,
                    status="open",
                    due_at=due_datetime,
                    created_at=datetime.now(timezone.utc),
                )
                session.add(alert)
                created_count += 1
        else:
            if existing_sla_breach:
                existing_sla_breach.status = "closed"
                session.add(existing_sla_breach)

    session.commit()
    return created_count


def acknowledge_alert(session: Session, alert_id: int) -> Alert:
    """Acknowledge an open alert by ID."""
    alert = session.get(Alert, alert_id)
    if not alert:
        raise NotFoundError(f"Alert with id {alert_id} not found", details={"id": alert_id})

    alert.status = "acknowledged"
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return alert
