"""Export seed data from the live SQLite database to data/seed/ CSV files.

Produces:
  data/seed/institutions.csv
  data/seed/cases.csv
  data/seed/events.csv

Run AFTER seed_demo.py has been executed (database must exist).
All data is synthetic demo data.
"""

import csv
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Default to backend/casebridge.db regardless of the caller's working directory.
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(BACKEND_DIR / 'casebridge.db').as_posix()}")

from sqlmodel import Session, select  # noqa: E402
from app.db import engine  # noqa: E402
from app.models import Case, CaseEvent, Institution  # noqa: E402

SEED_DIR = ROOT / "data" / "seed"
SEED_DIR.mkdir(parents=True, exist_ok=True)


def export_institutions(session: Session) -> int:
    rows = session.exec(select(Institution).order_by(Institution.id)).all()
    out = SEED_DIR / "institutions.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "permanent_id", "name", "address", "region", "state", "type"])
        for r in rows:
            writer.writerow([
                r.id, r.permanent_id, r.name, r.address,
                r.region.value if hasattr(r.region, "value") else r.region,
                r.state, r.type,
            ])
    print(f"[+] institutions.csv - {len(rows)} rows -> {out}")
    return len(rows)


def export_cases(session: Session) -> int:
    rows = session.exec(select(Case).order_by(Case.id)).all()
    out = SEED_DIR / "cases.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "id", "case_no", "institution_id", "bureau", "category", "description",
            "received_date", "status", "assigned_officer", "last_action",
            "last_action_date", "next_action", "expected_disposal_date",
            "priority", "created_at",
        ])
        for r in rows:
            writer.writerow([
                r.id, r.case_no, r.institution_id,
                r.bureau.value if hasattr(r.bureau, "value") else r.bureau,
                r.category.value if hasattr(r.category, "value") else r.category,
                r.description, r.received_date,
                r.status.value if hasattr(r.status, "value") else r.status,
                r.assigned_officer, r.last_action, r.last_action_date,
                r.next_action, r.expected_disposal_date,
                r.priority.value if hasattr(r.priority, "value") else r.priority,
                r.created_at,
            ])
    print(f"[+] cases.csv - {len(rows)} rows -> {out}")
    return len(rows)


def export_events(session: Session) -> int:
    rows = session.exec(select(CaseEvent).order_by(CaseEvent.id)).all()
    out = SEED_DIR / "events.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "id", "case_id", "ts", "actor", "bureau", "event_type",
            "from_bureau", "to_bureau", "from_status", "to_status",
            "remarks", "attachment_ref",
        ])
        for r in rows:
            writer.writerow([
                r.id, r.case_id, r.ts, r.actor,
                r.bureau.value if hasattr(r.bureau, "value") else r.bureau,
                r.event_type.value if hasattr(r.event_type, "value") else r.event_type,
                r.from_bureau.value if r.from_bureau and hasattr(r.from_bureau, "value") else r.from_bureau,
                r.to_bureau.value if r.to_bureau and hasattr(r.to_bureau, "value") else r.to_bureau,
                r.from_status.value if r.from_status and hasattr(r.from_status, "value") else r.from_status,
                r.to_status.value if r.to_status and hasattr(r.to_status, "value") else r.to_status,
                r.remarks, r.attachment_ref,
            ])
    print(f"[+] events.csv - {len(rows)} rows -> {out}")
    return len(rows)


def main() -> None:
    print("[CaseBridge] Exporting seed CSVs from database...")
    with Session(engine) as session:
        n_inst = export_institutions(session)
        n_cases = export_cases(session)
        n_events = export_events(session)
    print(f"\n[+] Export complete: {n_inst} institutions, {n_cases} cases, {n_events} events")
    print("    All data is synthetic demo data.")


if __name__ == "__main__":
    main()
