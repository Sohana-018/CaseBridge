"""Seed demo scenario data per Section 7 and 10 of CENTRAL_PRD.md.

Institution: Example Institute of Technology (demo) (DEMO-1042)
Cases:
- PG-2026-00104 (PGRC, under_process)
- RB-2026-00219 (RB, pending)

Idempotent: Safe to execute multiple times.
"""

from datetime import date, datetime, timezone
import os
from pathlib import Path
import sys

# Ensure backend directory is in sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlmodel import Session, select
from app.db import create_db_and_tables, engine
from app.models import (
    Bureau,
    Case,
    CaseCategory,
    CaseEvent,
    CaseStatus,
    EventType,
    Institution,
    Priority,
    Region,
)


def seed_demo() -> None:
    print("[CaseBridge] Initializing database tables...")
    create_db_and_tables()

    with Session(engine) as session:
        # 1. Institution
        inst = session.exec(
            select(Institution).where(Institution.permanent_id == "DEMO-1042")
        ).first()

        if not inst:
            inst = Institution(
                permanent_id="DEMO-1042",
                name="Example Institute of Technology (demo)",
                address="Outer Ring Road, Bengaluru",
                region=Region.SOUTH,
                state="Karnataka",
                type="Engineering",
            )
            session.add(inst)
            session.commit()
            session.refresh(inst)
            print(f"[+] Created institution: {inst.name} ({inst.permanent_id})")
        else:
            print(f"[*] Institution already exists: {inst.name} ({inst.permanent_id})")

        # 2. PGRC Case: PG-2026-00104
        case_pg = session.exec(
            select(Case).where(Case.case_no == "PG-2026-00104")
        ).first()

        if not case_pg:
            case_pg = Case(
                case_no="PG-2026-00104",
                institution_id=inst.id,
                bureau=Bureau.PGRC,
                category=CaseCategory.FACULTY,
                description="Complaint about unqualified faculty in the mechanical department.",
                received_date=date(2026, 9, 12),
                status=CaseStatus.UNDER_PROCESS,
                assigned_officer="A. Rao (demo)",
                last_action="Notice sent to institution",
                last_action_date=date(2026, 10, 2),
                next_action="Await institution reply",
                expected_disposal_date=date(2026, 11, 15),
                priority=Priority.MEDIUM,
            )
            session.add(case_pg)
            session.commit()
            session.refresh(case_pg)

            # Seed timeline events for PG case
            ev1 = CaseEvent(
                case_id=case_pg.id,
                ts=datetime(2026, 9, 12, 10, 0, 0, tzinfo=timezone.utc),
                actor="System (demo)",
                bureau=Bureau.PGRC,
                event_type=EventType.CREATED,
                to_status=CaseStatus.PENDING,
                remarks="Grievance lodged in Public Grievance Redressal Cell",
            )
            ev2 = CaseEvent(
                case_id=case_pg.id,
                ts=datetime(2026, 10, 2, 10, 30, 0, tzinfo=timezone.utc),
                actor="A. Rao (demo)",
                bureau=Bureau.PGRC,
                event_type=EventType.REMARK,
                from_status=CaseStatus.PENDING,
                to_status=CaseStatus.UNDER_PROCESS,
                remarks="Notice sent to institution",
            )
            session.add_all([ev1, ev2])
            session.commit()
            print(f"[+] Created case: {case_pg.case_no} with initial timeline events")
        else:
            print(f"[*] Case already exists: {case_pg.case_no}")

        # 3. RB Case: RB-2026-00219
        case_rb = session.exec(
            select(Case).where(Case.case_no == "RB-2026-00219")
        ).first()

        if not case_rb:
            case_rb = Case(
                case_no="RB-2026-00219",
                institution_id=inst.id,
                bureau=Bureau.RB,
                category=CaseCategory.FACULTY,
                description="Regulatory inspection regarding mechanical department faculty cadre ratio.",
                received_date=date(2026, 9, 26),
                status=CaseStatus.PENDING,
                assigned_officer="P. Sharma (demo)",
                last_action="Inspection inquiry initiated",
                last_action_date=date(2026, 9, 26),
                next_action="Review compliance documents",
                expected_disposal_date=date(2026, 12, 1),
                priority=Priority.HIGH,
            )
            session.add(case_rb)
            session.commit()
            session.refresh(case_rb)

            ev_rb = CaseEvent(
                case_id=case_rb.id,
                ts=datetime(2026, 9, 26, 11, 15, 0, tzinfo=timezone.utc),
                actor="P. Sharma (demo)",
                bureau=Bureau.RB,
                event_type=EventType.CREATED,
                to_status=CaseStatus.PENDING,
                remarks="Inquiry initiated under Regulation Bureau",
            )
            session.add(ev_rb)
            session.commit()
            print(f"[+] Created case: {case_rb.case_no} with initial timeline event")
        else:
            print(f"[*] Case already exists: {case_rb.case_no}")

    print("[CaseBridge] Demo seed completed successfully.")


if __name__ == "__main__":
    seed_demo()
