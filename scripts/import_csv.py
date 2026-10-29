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

# Ensure repository root, backend, and scripts directories are in sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
BACKEND_DIR = ROOT_DIR / "backend"
for p in (ROOT_DIR, BACKEND_DIR, SCRIPT_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

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
    OverlapLink,
    Priority,
    Region,
    ReviewStatus,
)
from app.services.alerts import refresh_alerts
from app.services.overlap import detect_overlaps

FIXED_TODAY = date(2026, 10, 24)
SEED_DIR = ROOT_DIR / "data" / "seed"


def seed_realistic_overlap_outcomes(session: Session) -> int:
    """Seed realistic coordinator review decisions for deployed/demo reports.

    Deterministically distributes review outcomes so the Overlap Outcomes
    chart reflects an active, realistic operational review history (73% reviewed),
    while preserving the central demo pair PG-2026-00104 / RB-2026-00219 as OPEN.
    """
    is_prod = (
        os.getenv("ENV", "").lower() in ("production", "prod")
        or os.getenv("ENVIRONMENT", "").lower() in ("production", "prod")
        or os.getenv("APP_ENV", "").lower() in ("production", "prod")
        or os.getenv("IS_PRODUCTION", "").lower() in ("true", "1")
    )
    allow_demo = os.getenv("SEED_DEMO_OUTCOMES", "false").lower() in ("true", "1", "yes")

    if not allow_demo:
        print("[Import] SEED_DEMO_OUTCOMES is false/unset: skipping generation of fabricated overlap review outcomes.")
        return 0

    if is_prod:
        print("[Import] CRITICAL WARNING: Target database/environment is marked as PRODUCTION! Refusing to generate fabricated demo review outcomes.")
        return 0

    print("=" * 80)
    print("[Import] NOTICE: SEED_DEMO_OUTCOMES=true detected on non-production database. GENERATING FABRICATED DEMO OVERLAP OUTCOMES!")
    print("=" * 80)

    import random

    existing_reviewed = session.exec(
        select(OverlapLink).where(OverlapLink.review_status != ReviewStatus.OPEN)
    ).first()
    if existing_reviewed:
        return 0

    all_links = list(session.exec(select(OverlapLink)).all())
    if not all_links:
        return 0

    # Preserve demo pair PG-2026-00104 / RB-2026-00219 as OPEN
    c_pg = session.exec(select(Case).where(Case.case_no == "PG-2026-00104")).first()
    c_rb = session.exec(select(Case).where(Case.case_no == "RB-2026-00219")).first()
    demo_ids = {c_pg.id, c_rb.id} if c_pg and c_rb else set()

    eligible = [
        link for link in all_links
        if not (demo_ids and link.case_a_id in demo_ids and link.case_b_id in demo_ids)
    ]

    rng = random.Random(42)
    rng.shuffle(eligible)

    # 835 not_related, 439 related, 294 duplicate, 116 needs_review (1684 reviewed)
    targets = [
        (ReviewStatus.NOT_RELATED, 835, "Decoupled after initial triage - distinct procedural tracks"),
        (ReviewStatus.RELATED, 439, "Related institutional inquiry identified; consolidated cross-bureau tracking"),
        (ReviewStatus.DUPLICATE, 294, "Verified identical complaint details and institution record; confirmed duplicate"),
        (ReviewStatus.NEEDS_REVIEW, 116, "Requires further institutional fact-finding before final linking"),
    ]

    idx = 0
    updated = 0
    review_dt = datetime(2026, 10, 24, 14, 30, tzinfo=timezone.utc)

    for status, count, note in targets:
        chunk = eligible[idx : idx + count]
        idx += count
        for link in chunk:
            link.review_status = status
            link.reviewed_by = "coordinator"
            link.reviewed_at = review_dt
            link.note = note
            session.add(link)
            updated += 1

    session.commit()
    print(f"[Import] Seeded {updated} realistic overlap review outcomes (73% reviewed, demo pair left open).")
    return updated


def import_csv(
    session: Optional[Session] = None,
    seed_dir: Optional[Path] = None,
    today: Optional[date] = None,
) -> dict:
    if os.getenv("SYSTEM_MAINTENANCE_MODE", "false").lower() in ("true", "1", "yes"):
        print("[Import] SYSTEM_MAINTENANCE_MODE is active: aborting CSV import to prevent database writes.")
        return {"institutions": 0, "cases": 0, "events": 0}
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
                session.flush()

                # Add rich chronological timeline events (max 6)
                try:
                    from scripts.enrich_timelines import generate_case_events
                except ModuleNotFoundError:
                    from enrich_timelines import generate_case_events
                for ev in generate_case_events(new_case):
                    session.add(ev)

                existing_case_set.add(c_no)
                cases_created += 1

                if cases_created % 50 == 0:
                    session.commit()

        session.commit()

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

        # 6. Seed realistic review outcomes so deployed reports match local queue
        reviewed_seeded = seed_realistic_overlap_outcomes(session)

        return {
            "institutions_created": inst_created,
            "institutions_skipped": inst_skipped,
            "cases_created": cases_created,
            "cases_skipped": cases_skipped,
            "counters_synced": len(max_counters),
            "alerts_created": alert_count,
            "overlaps_created": overlap_count,
            "reviews_seeded": reviewed_seeded,
        }

    finally:
        if close_session_at_end:
            session.close()


if __name__ == "__main__":
    run_seed_flag = os.getenv("RUN_SEED_IMPORT")
    if run_seed_flag is not None and run_seed_flag.lower() not in ("true", "1", "yes"):
        print("[CaseBridge] RUN_SEED_IMPORT is set to false/disabled: skipping CSV Import.")
        sys.exit(0)

    print("[CaseBridge] Starting CSV Import...")
    result = import_csv()
    print(f"[CaseBridge] Import finished: {result}")
