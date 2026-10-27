"""Enrich case events in CaseBridge database and seed files with realistic 3-6 event timelines.

- Removes all ' (demo)' suffixes from institutions, cases, and officer names.
- Restructures event history for every case: generates 2 to 6 realistic, strictly chronological
  events matching case status, category, received_date, and last_action.
- Exports enriched events, cases, and institutions to data/seed/*.csv.
"""

from datetime import date, datetime, timedelta, timezone
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("DATABASE_URL", f"sqlite:///{(BACKEND_DIR / 'casebridge.db').as_posix()}")

from sqlmodel import Session, select
from app.db import engine
from app.models import (
    Bureau,
    Case,
    CaseCategory,
    CaseEvent,
    CaseStatus,
    EventType,
    Institution,
)
from scripts.export_seed_csv import export_cases, export_events, export_institutions

CATEGORY_SCRUTINY_REMARKS = {
    CaseCategory.FEE_REFUND: "Official notice served to institution registrar summoning fee payment ledger, student account statement, and refund transaction proofs.",
    CaseCategory.FACULTY: "Summoned approved faculty roster, qualification verification certificates, and monthly salary disbursement registers under 7th Pay norms.",
    CaseCategory.INFRASTRUCTURE: "Directed college administration to submit certified architectural layout, fire safety NOC, and laboratory equipment compliance audit.",
    CaseCategory.ADMISSION: "Summoned centralized admission merit lists, category allotment registers, and vacant seat declarations.",
    CaseCategory.APPROVAL: "Scrutinized regulatory approval certificates, extension of approval (EoA) records, and AICTE sanctioned intake.",
    CaseCategory.EXAMINATION: "Summoned evaluation rubrics, continuous assessment score sheets, and re-evaluation registers.",
    CaseCategory.OTHER: "Notice issued to institution management seeking detailed parawise response and supporting documentation.",
}


def clean_name(val: str | None) -> str | None:
    if not val:
        return val
    return val.replace(" (demo)", "").strip()


def generate_case_events(c: Case) -> list[CaseEvent]:
    events: list[CaseEvent] = []
    officer = clean_name(c.assigned_officer) or "Investigation Officer"
    rec_date = c.received_date
    today = date.today()

    # 1. Created Event (Day 0)
    t0 = datetime.combine(rec_date, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=10, minutes=15)
    events.append(
        CaseEvent(
            case_id=c.id,
            ts=t0,
            actor=officer,
            bureau=c.bureau,
            event_type=EventType.CREATED,
            to_status=CaseStatus.PENDING,
            remarks=f"Formal grievance docket registered under {c.bureau.value} Cell.",
        )
    )

    # 2. Assignment / Scrutiny Remark (Day 1)
    t1 = t0 + timedelta(days=1, hours=2, minutes=30)
    events.append(
        CaseEvent(
            case_id=c.id,
            ts=t1,
            actor=officer,
            bureau=c.bureau,
            event_type=EventType.REMARK,
            remarks=f"Preliminary administrative scrutiny completed. Case docket assigned to {officer} for formal inquiry.",
        )
    )

    # 3. Category-specific Document Summon / Verification (Day 3)
    t2 = t0 + timedelta(days=3, hours=4, minutes=15)
    cat_remark = CATEGORY_SCRUTINY_REMARKS.get(c.category, CATEGORY_SCRUTINY_REMARKS[CaseCategory.OTHER])
    events.append(
        CaseEvent(
            case_id=c.id,
            ts=t2,
            actor=officer,
            bureau=c.bureau,
            event_type=EventType.REMARK,
            remarks=cat_remark,
        )
    )

    # 4. Status progression to UNDER_PROCESS (for non-pending cases)
    if c.status != CaseStatus.PENDING:
        t3 = t0 + timedelta(days=6, hours=1, minutes=45)
        events.append(
            CaseEvent(
                case_id=c.id,
                ts=t3,
                actor=officer,
                bureau=c.bureau,
                event_type=EventType.STATUS_CHANGE,
                from_status=CaseStatus.PENDING,
                to_status=CaseStatus.UNDER_PROCESS,
                remarks="Institutional submission received and placed before Inquiry Committee. Case marked Under Process.",
            )
        )

    # 5. Subsequent intermediate event (Transfer, Escalation, or Operational Remark)
    if c.status == CaseStatus.TRANSFERRED:
        from_bur = Bureau.PGRC if c.bureau == Bureau.RB else Bureau.RB
        t4 = datetime.combine(c.last_action_date or (rec_date + timedelta(days=12)), datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=14)
        if t4 <= t2:
            t4 = t2 + timedelta(days=2)
        events.append(
            CaseEvent(
                case_id=c.id,
                ts=t4,
                actor="Central Coordination Desk",
                bureau=c.bureau,
                event_type=EventType.TRANSFER,
                from_bureau=from_bur,
                to_bureau=c.bureau,
                remarks=f"Matter transferred to {c.bureau.value} due to statutory jurisdiction requirements: {c.last_action or 'Administrative transfer'}.",
            )
        )
    elif c.status == CaseStatus.ESCALATED:
        t4 = datetime.combine(c.last_action_date or (rec_date + timedelta(days=10)), datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=15)
        if t4 <= t2:
            t4 = t2 + timedelta(days=2)
        events.append(
            CaseEvent(
                case_id=c.id,
                ts=t4,
                actor=officer,
                bureau=c.bureau,
                event_type=EventType.ESCALATION,
                to_status=CaseStatus.ESCALATED,
                remarks=f"Matter escalated to Vigilance Committee / Member Secretary: {c.last_action or 'High-priority non-compliance'}.",
            )
        )
    elif c.status == CaseStatus.UNDER_PROCESS and c.last_action:
        act_date = c.last_action_date or min(today, rec_date + timedelta(days=12))
        t4 = datetime.combine(act_date, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=11)
        if t4 <= t2:
            t4 = t2 + timedelta(days=2)
        events.append(
            CaseEvent(
                case_id=c.id,
                ts=t4,
                actor=officer,
                bureau=c.bureau,
                event_type=EventType.REMARK,
                remarks=f"Procedural update: {c.last_action}.",
            )
        )
    elif c.status == CaseStatus.DISPOSED:
        mid_date = rec_date + timedelta(days=10)
        t4 = datetime.combine(mid_date, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=12)
        if t4 <= t2:
            t4 = t2 + timedelta(days=2)
        events.append(
            CaseEvent(
                case_id=c.id,
                ts=t4,
                actor=officer,
                bureau=c.bureau,
                event_type=EventType.REMARK,
                remarks="Committee inquiry completed. Parawise inspection report submitted for final administrative disposal.",
            )
        )

    # 6. Final event for DISPOSED cases
    if c.status == CaseStatus.DISPOSED:
        disp_date = c.last_action_date or c.expected_disposal_date or (rec_date + timedelta(days=20))
        t5 = datetime.combine(disp_date, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=16, minutes=30)
        if events and t5 <= events[-1].ts:
            t5 = events[-1].ts + timedelta(days=1)
        events.append(
            CaseEvent(
                case_id=c.id,
                ts=t5,
                actor=officer,
                bureau=c.bureau,
                event_type=EventType.STATUS_CHANGE,
                from_status=CaseStatus.UNDER_PROCESS,
                to_status=CaseStatus.DISPOSED,
                remarks=f"Formal disposal order issued: {c.last_action or 'Compliance verified and grievance resolved'}. Case closed.",
            )
        )

    # Enforce maximum 6 events per case
    return events[:6]


def run_enrichment():
    print("[CaseBridge] Enriching database and cleaning ' (demo)' labels...")
    with Session(engine) as session:
        # 1. Clean institutions
        insts = session.exec(select(Institution)).all()
        for inst in insts:
            cleaned = clean_name(inst.name)
            if cleaned != inst.name:
                inst.name = cleaned
                session.add(inst)
        session.commit()
        print(f"[+] Cleaned {len(insts)} institution names.")

        # 2. Clean cases and officers
        cases = session.exec(select(Case)).all()
        for c in cases:
            cleaned_off = clean_name(c.assigned_officer)
            if cleaned_off != c.assigned_officer:
                c.assigned_officer = cleaned_off
                session.add(c)
        session.commit()
        print(f"[+] Cleaned {len(cases)} case officer names.")

        # 3. Replace events with rich multi-event timeline
        # Delete existing events
        existing_events = session.exec(select(CaseEvent)).all()
        print(f"[*] Removing {len(existing_events)} old single events...")
        for ev in existing_events:
            session.delete(ev)
        session.commit()

        # Generate rich timeline for every case
        total_created = 0
        for c in cases:
            new_events = generate_case_events(c)
            for ev in new_events:
                session.add(ev)
                total_created += 1
        session.commit()
        print(f"[+] Successfully generated {total_created} chronological events for {len(cases)} cases (average {total_created/len(cases):.1f} events/case, max 6).")

        # 4. Export to CSV files in data/seed/
        print("[*] Exporting cleaned records to data/seed/...")
        export_institutions(session)
        export_cases(session)
        export_events(session)
        print("[+] CSV export complete!")


if __name__ == "__main__":
    run_enrichment()
