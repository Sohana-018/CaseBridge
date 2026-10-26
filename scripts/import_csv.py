"""CSV Data Importer for CaseBridge (SIH26264).

Loads institutions.csv and cases.csv into the database.
- Safe to run multiple times (idempotent, skips existing records by permanent_id or case_no).
- Preserves imported case numbers.
- Appends initial 'created' CaseEvent for each newly imported case.
- Sets the counters table above the maximum existing case number for each prefix and year.
- Compatible with scripts/seed_demo.py (can run before or after without duplicating demo cases).
"""

import csv
from datetime import date, datetime, timezone
import os
from pathlib import Path
import sys
from typing import Optional

# Ensure backend directory is in sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Default to backend/casebridge.db regardless of the caller's working directory.
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(BACKEND_DIR / 'casebridge.db').as_posix()}")

from sqlmodel import Session, select

from app.db import create_db_and_tables, engine
from app.models import (
    Bureau,
    Case,
    CaseCategory,
    CaseEvent,
    CaseStatus,
    Counter,
    EventType,
    Institution,
    Priority,
    Region,
)
from app.services.alerts import refresh_alerts
from app.services.overlap import detect_overlaps

FIXED_TODAY = date(2026, 10, 24)
SEED_DIR = ROOT_DIR / "data" / "seed"


def import_csv(
    session: Optional[Session] = None,
    seed_dir: Optional[Path] = None,
    today: Optional[date] = None,
) -> dict:
    """Import institutions and cases CSVs into database session.

    Skips already existing institutions (by permanent_id) and cases (by case_no).
    """
    if seed_dir is None:
        seed_dir = SEED_DIR
    if today is None:
        today = FIXED_TODAY

    close_session_at_end = False
    if session is None:
        create_db_and_tables()
        session = Session(engine)
        close_session_at_end = True

    try:
        institutions_csv = seed_dir / "institutions.csv"
        cases_csv = seed_dir / "cases.csv"

        if not institutions_csv.exists() or not cases_csv.exists():
            raise FileNotFoundError(f"Missing CSV files in {seed_dir}. Run scripts/generate_data.py first.")

        # 1. Load Institutions
        inst_created = 0
        inst_skipped = 0
        inst_map = {}

        # First preload existing institutions
        all_existing_inst = session.exec(select(Institution)).all()
        for inst in all_existing_inst:
            inst_map[inst.permanent_id] = inst

        with open(institutions_csv, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                pid = row["permanent_id"].strip()
                if pid in inst_map:
                    inst_skipped += 1
                    continue

                inst = Institution(
                    permanent_id=pid,
                    name=row["name"].strip(),
                    address=row.get("address") or None,
                    region=Region(row["region"].strip()),
                    state=row.get("state") or None,
                    type=row.get("type") or None,
                )
                session.add(inst)
                session.commit()
                session.refresh(inst)
                inst_map[pid] = inst
                inst_created += 1

        print(f"[Import] Institutions: {inst_created} created, {inst_skipped} skipped (already existed).")

        # 2. Load Cases
        cases_created = 0
        cases_skipped = 0

        # Preload existing case numbers
        existing_cases = session.exec(select(Case.case_no)).all()
        existing_case_set = set(existing_cases)

        with open(cases_csv, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                c_no = row["case_no"].strip()
                if c_no in existing_case_set:
                    cases_skipped += 1
                    continue

                pid = row["permanent_id"].strip()
                if pid not in inst_map:
                    # Fetch from database if needed
                    inst = session.exec(select(Institution).where(Institution.permanent_id == pid)).first()
                    if not inst:
                        raise ValueError(f"Institution '{pid}' not found for case '{c_no}'")
                    inst_map[pid] = inst

                inst_id = inst_map[pid].id

                # Parse dates
                rec_date = date.fromisoformat(row["received_date"].strip())
                last_act_date = (
                    date.fromisoformat(row["last_action_date"].strip())
                    if row.get("last_action_date") and row["last_action_date"].strip()
                    else None
                )
                exp_disp_date = (
                    date.fromisoformat(row["expected_disposal_date"].strip())
                    if row.get("expected_disposal_date") and row["expected_disposal_date"].strip()
                    else None
                )

                new_case = Case(
                    case_no=c_no,
                    institution_id=inst_id,
                    bureau=Bureau(row["bureau"].strip()),
                    category=CaseCategory(row["category"].strip()),
                    description=row["description"].strip(),
                    received_date=rec_date,
                    status=CaseStatus(row["status"].strip()),
                    assigned_officer=row.get("assigned_officer") or None,
                    last_action=row.get("last_action") or None,
                    last_action_date=last_act_date,
                    next_action=row.get("next_action") or None,
                    expected_disposal_date=exp_disp_date,
                    priority=Priority(row["priority"].strip()),
                )
                session.add(new_case)
                session.commit()
                session.refresh(new_case)

                # Add initial 'created' event
                ev = CaseEvent(
                    case_id=new_case.id,
                    ts=datetime.combine(rec_date, datetime.min.time(), tzinfo=timezone.utc),
                    actor=new_case.assigned_officer or "System (demo)",
                    bureau=new_case.bureau,
                    event_type=EventType.CREATED,
                    to_status=new_case.status,
                    remarks=f"Initial registration in {new_case.bureau.value}",
                )
                session.add(ev)
                session.commit()

                existing_case_set.add(c_no)
                cases_created += 1

        print(f"[Import] Cases: {cases_created} created, {cases_skipped} skipped (already existed).")

        # 3. Set counters above maximum existing case numbers
        all_cases = session.exec(select(Case)).all()
        max_counters = {}
        for c in all_cases:
            parts = c.case_no.split("-")
            if len(parts) == 3:
                prefix, year, num_str = parts[0], parts[1], parts[2]
                try:
                    num = int(num_str)
                    key = f"{prefix}-{year}"
                    if key not in max_counters or num > max_counters[key]:
                        max_counters[key] = num
                except ValueError:
                    pass

        counters_updated = 0
        for key, max_num in max_counters.items():
            counter = session.exec(select(Counter).where(Counter.key == key)).first()
            if not counter:
                counter = Counter(key=key, value=max_num)
                session.add(counter)
                counters_updated += 1
            else:
                if counter.value < max_num:
                    counter.value = max_num
                    session.add(counter)
                    counters_updated += 1
        session.commit()
        print(f"[Import] Counters synced for {len(max_counters)} prefix-year keys.")

        # 4. Refresh alerts
        alert_count = refresh_alerts(session, today=today)
        print(f"[Import] Evaluated alert rules ({alert_count} alert(s) processed/created).")

        # 5. Run overlap scan
        overlap_count = detect_overlaps(session, commit=True)
        print(f"[Import] Evaluated overlap links ({overlap_count} new overlap link(s) created).")

        return {
            "institutions_created": inst_created,
            "institutions_skipped": inst_skipped,
            "cases_created": cases_created,
            "cases_skipped": cases_skipped,
            "counters_synced": len(max_counters),
            "alerts_created": alert_count,
            "overlaps_created": overlap_count,
        }

    finally:
        if close_session_at_end:
            session.close()


if __name__ == "__main__":
    print("[CaseBridge] Starting CSV Import...")
    result = import_csv()
    print(f"[CaseBridge] Import finished: {result}")
