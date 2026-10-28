"""Deterministic generator to grow CaseBridge seed data from 200 to 555 cases.

Requirements:
- Preserves the existing 200 cases in data/seed/cases.csv line-for-line.
- Appends 355 filler cases with a deterministic seed (20261028).
- Status mix across all 555 cases:
    disposed: 166 (~30%) [6 existing + 160 filler]
    under_process: 166 (~30%) [83 existing + 83 filler]
    pending: 111 (~20%) [77 existing + 34 filler]
    escalated: 56 (~10%) [21 existing + 35 filler]
    transferred: 56 (~10%) [13 existing + 43 filler]
    Total = 555 cases
- Disposed cases: older received_date, closure timeline event, last_action_date after received, never overdue.
- Strictly valid institutions from data/seed/institutions.csv.
- Sequential case numbering per bureau prefix continuing from current maximums.
- Generates rich chronological timeline events and appends them to data/seed/events.csv.
"""

import csv
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import random
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
DATA_DIR = ROOT / "data"
SEED_DIR = DATA_DIR / "seed"

for p in (ROOT, BACKEND_DIR, ROOT / "scripts"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from app.models import Bureau, Case, CaseCategory, CaseEvent, CaseStatus, Priority
from scripts.enrich_timelines import generate_case_events

FIXED_TODAY = date(2026, 10, 24)
RANDOM_SEED = 20261028

OFFICER_NAMES = [
    "A. Rao",
    "P. Sharma",
    "R. K. Mehra",
    "S. Kulkarni",
    "M. Banerjee",
    "A. Joshi",
    "K. Singh",
    "N. Deshmukh",
    "R. Iyer",
    "P. Nambiar",
    "V. Nair",
    "T. Ghosh",
    "K. Aggarwal",
    "S. Sengupta",
    "H. Verma",
    "D. Patel",
]

CATEGORIES = [
    CaseCategory.INFRASTRUCTURE,
    CaseCategory.FACULTY,
    CaseCategory.FEE_REFUND,
    CaseCategory.ADMISSION,
    CaseCategory.APPROVAL,
    CaseCategory.EXAMINATION,
    CaseCategory.OTHER,
]

BUREAUS = [Bureau.RB, Bureau.PGRC, Bureau.RO, Bureau.OC]

DISPOSED_REMARKS = [
    "Committee inquiry concluded and institutional compliance recorded.",
    "Refund disbursement verified through transaction proofs; case closed.",
    "Faculty cadre ratio rectified with verified joining reports.",
    "Structural stability certificate submitted and approved; matter disposed.",
    "Admission quota reconciliation completed and compliant with AICTE norms.",
    "Grade recalculation cards distributed; student grievance resolved.",
]

TOPIC_TEMPLATES = {
    CaseCategory.INFRASTRUCTURE: [
        "Inquiry into hostel ventilation and fire fighting apparatus compliance.",
        "Inspection observation on library digital catalogue access and seating capacity.",
        "Verification of civil engineering materials testing equipment availability.",
        "Campus accessibility audit regarding barrier-free ramps and specialized facilities.",
    ],
    CaseCategory.FACULTY: [
        "Audit into assistant professor cadre distribution in core engineering departments.",
        "Verification of mandatory AICTE pay scales and quarterly allowances payment.",
        "Scrutiny of visiting lecturer appointment notifications and workload distribution.",
        "Grievance regarding faculty qualification verification in postgraduate programmes.",
    ],
    CaseCategory.FEE_REFUND: [
        "Grievance claiming delayed processing of hostel caution deposit upon withdrawal.",
        "Complaint regarding non-refund of provisional admission seat allotment charge.",
        "Request for refund of mandatory alumni association subscription fee.",
        "Petition regarding differential laboratory fee deduction after course change.",
    ],
    CaseCategory.ADMISSION: [
        "Verification of management quota seat allotment transparency.",
        "Scrutiny of lateral entry admission merit list and cutoff normalization.",
        "Inquiry regarding institutional adherence to state centralized admission timeline.",
        "Verification of document return timeline for withdrawn candidates.",
    ],
    CaseCategory.APPROVAL: [
        "Extension of Approval (EoA) verification for newly initiated diploma shifts.",
        "Scrutiny of land ownership records and built-up area floor plans.",
        "Verification of sanctioned student intake adherence across branches.",
        "Compliance review regarding closure of obsolete polytechnic course.",
    ],
    CaseCategory.EXAMINATION: [
        "Grievance regarding semester end practical examination marks moderation.",
        "Petition regarding answer script revaluation timeline and scrutiny fees.",
        "Complaint alleging procedural delay in final transcript issuance.",
        "Verification of internal assessment weightage records and audit logs.",
    ],
    CaseCategory.OTHER: [
        "General inquiry regarding student grievance redressal committee constitution.",
        "Administrative verification of anti-ragging committee notifications.",
        "Compliance check on internal complaints committee (ICC) annual returns.",
        "Inquiry regarding industry advisory board meeting records and curricula.",
    ],
}


def load_existing_cases():
    cases_path = SEED_DIR / "cases.csv"
    with open(cases_path, "r", encoding="utf-8") as f:
        reader = list(csv.DictReader(f))
    return reader


def load_institutions():
    inst_path = SEED_DIR / "institutions.csv"
    with open(inst_path, "r", encoding="utf-8") as f:
        reader = list(csv.DictReader(f))
    return reader


def get_current_max_counters(existing_cases):
    counters = {}
    for c in existing_cases:
        parts = c["case_no"].split("-")
        if len(parts) == 3:
            pfx, yr, num = parts[0], int(parts[1]), int(parts[2])
            counters[(pfx, yr)] = max(counters.get((pfx, yr), 0), num)
    return counters


def generate_filler_cases():
    random.seed(RANDOM_SEED)

    existing_cases = load_existing_cases()
    institutions = load_institutions()
    inst_ids = [inst["permanent_id"] for inst in institutions]

    print(f"Loaded {len(existing_cases)} existing cases.")
    print(f"Loaded {len(institutions)} institutions.")

    counters = get_current_max_counters(existing_cases)
    print("Initial max counters:", counters)

    bureau_prefix = {
        Bureau.RB: "RB",
        Bureau.PGRC: "PG",
        Bureau.RO: "RO",
        Bureau.OC: "OC",
    }

    # Filler status allocations to achieve exact target counts (total 555 cases)
    # Target totals: Disposed: 166, Under Process: 166, Pending: 111, Escalated: 56, Transferred: 56
    status_quotas = [
        ("disposed", 160),
        ("under_process", 83),
        ("pending", 34),
        ("escalated", 35),
        ("transferred", 43),
    ]

    # Build sequence of statuses
    status_sequence = []
    for st, count in status_quotas:
        status_sequence.extend([st] * count)

    # Deterministically shuffle the sequence so statuses are evenly mixed across bureaus & dates
    random.shuffle(status_sequence)
    print(f"Total filler cases to generate: {len(status_sequence)}")

    filler_cases = []

    for idx, status in enumerate(status_sequence):
        # Round-robin bureau and institution distribution
        bureau = BUREAUS[idx % len(BUREAUS)]
        prefix = bureau_prefix[bureau]
        inst_id = inst_ids[(idx * 7) % len(inst_ids)]
        cat = CATEGORIES[(idx * 3) % len(CATEGORIES)]
        officer = OFFICER_NAMES[(idx * 5) % len(OFFICER_NAMES)]

        # Unique sequential case number
        year = 2026
        seq = counters.get((prefix, year), 500) + 1
        counters[(prefix, year)] = seq
        case_no = f"{prefix}-{year}-{seq:05d}"

        # Category-based realistic description
        templates = TOPIC_TEMPLATES.get(cat, TOPIC_TEMPLATES[CaseCategory.OTHER])
        desc_base = templates[idx % len(templates)]
        description = f"{desc_base} Case tracking reference: {prefix}/{cat.value[:3].upper()}-{seq:04d}."

        if status == "disposed":
            # Disposed cases: older received_date, last_action_date after received, never overdue
            days_ago = 60 + (idx % 140)  # 60 to 199 days ago
            rec_date = FIXED_TODAY - timedelta(days=days_ago)
            duration = 18 + (idx % 25)  # took 18 to 42 days to resolve
            last_date = rec_date + timedelta(days=duration)
            exp_date = rec_date + timedelta(days=duration + 5)
            last_act = DISPOSED_REMARKS[idx % len(DISPOSED_REMARKS)]
            next_act = ""
            priority = "low" if idx % 2 == 0 else "medium"
        elif status == "under_process":
            days_ago = 12 + (idx % 35)
            rec_date = FIXED_TODAY - timedelta(days=days_ago)
            last_offset = 2 + (idx % 8)
            last_date = min(FIXED_TODAY, rec_date + timedelta(days=last_offset))
            # Mix of overdue (20%), due soon (20%), and standard SLA (60%)
            if idx % 5 == 0:
                exp_date = FIXED_TODAY - timedelta(days=1 + (idx % 3))  # Overdue
            elif idx % 5 == 1:
                exp_date = FIXED_TODAY + timedelta(days=1 + (idx % 3))  # Due soon
            else:
                exp_date = FIXED_TODAY + timedelta(days=12 + (idx % 15))
            last_act = "Institutional submission placed before Inquiry Committee"
            next_act = "Inquiry Committee hearing and evaluation"
            priority = "high" if idx % 3 == 0 else "medium"
        elif status == "pending":
            days_ago = 4 + (idx % 20)
            rec_date = FIXED_TODAY - timedelta(days=days_ago)
            last_date = rec_date + timedelta(days=1)
            exp_date = FIXED_TODAY + timedelta(days=10 + (idx % 15))
            last_act = "Preliminary scrutiny completed and docket assigned"
            next_act = "Dispatch institutional notice and summon records"
            priority = "medium" if idx % 2 == 0 else "low"
        elif status == "escalated":
            days_ago = 18 + (idx % 30)
            rec_date = FIXED_TODAY - timedelta(days=days_ago)
            last_date = FIXED_TODAY - timedelta(days=2 + (idx % 5))
            exp_date = FIXED_TODAY - timedelta(days=1) if (idx % 3 == 0) else FIXED_TODAY + timedelta(days=7)
            last_act = "Matter escalated to Vigilance Committee / Member Secretary"
            next_act = "Special committee hearing and statutory notice"
            priority = "high"
        elif status == "transferred":
            days_ago = 15 + (idx % 30)
            rec_date = FIXED_TODAY - timedelta(days=days_ago)
            last_date = FIXED_TODAY - timedelta(days=3 + (idx % 6))
            exp_date = FIXED_TODAY + timedelta(days=14)
            last_act = "Administrative transfer executed under statutory jurisdiction norms"
            next_act = "Jurisdiction desk review and verification"
            priority = "medium"
        else:
            raise ValueError(f"Unknown status: {status}")

        filler_cases.append({
            "case_no": case_no,
            "permanent_id": inst_id,
            "bureau": bureau.value,
            "category": cat.value,
            "description": description,
            "received_date": rec_date.isoformat(),
            "status": status,
            "assigned_officer": officer,
            "last_action": last_act,
            "last_action_date": last_date.isoformat() if last_date else "",
            "next_action": next_act,
            "expected_disposal_date": exp_date.isoformat() if exp_date else "",
            "priority": priority,
        })

    return existing_cases, filler_cases


def append_cases_and_events(existing_cases, filler_cases):
    cases_path = SEED_DIR / "cases.csv"
    events_path = SEED_DIR / "events.csv"

    # Read existing events to know current max event id
    with open(events_path, "r", encoding="utf-8") as f:
        existing_event_rows = list(csv.DictReader(f))
    current_max_event_id = max(int(r["id"]) for r in existing_event_rows) if existing_event_rows else 0
    print(f"Current existing events count: {len(existing_event_rows)}, max event id: {current_max_event_id}")

    # 1. Append cases to data/seed/cases.csv
    fieldnames = [
        "case_no",
        "permanent_id",
        "bureau",
        "category",
        "description",
        "received_date",
        "status",
        "assigned_officer",
        "last_action",
        "last_action_date",
        "next_action",
        "expected_disposal_date",
        "priority",
    ]

    all_cases = existing_cases + filler_cases
    with open(cases_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for c in all_cases:
            writer.writerow(c)
    print(f"[+] Wrote total {len(all_cases)} cases to {cases_path} (added {len(filler_cases)} filler rows).")

    # 2. Generate timeline events for each filler case
    new_event_rows = []
    next_event_id = current_max_event_id + 1

    # In-memory Case objects to run through generate_case_events
    for c_idx, cdata in enumerate(filler_cases, start=len(existing_cases) + 1):
        rec_d = date.fromisoformat(cdata["received_date"])
        last_d = date.fromisoformat(cdata["last_action_date"]) if cdata["last_action_date"] else None
        exp_d = date.fromisoformat(cdata["expected_disposal_date"]) if cdata["expected_disposal_date"] else None

        case_obj = Case(
            id=c_idx,
            case_no=cdata["case_no"],
            institution_id=1,
            bureau=Bureau(cdata["bureau"]),
            category=CaseCategory(cdata["category"]),
            description=cdata["description"],
            received_date=rec_d,
            status=CaseStatus(cdata["status"]),
            assigned_officer=cdata["assigned_officer"],
            last_action=cdata["last_action"],
            last_action_date=last_d,
            next_action=cdata["next_action"] or None,
            expected_disposal_date=exp_d,
            priority=Priority(cdata["priority"]),
        )

        events = generate_case_events(case_obj)
        for ev in events:
            new_event_rows.append({
                "id": next_event_id,
                "case_id": c_idx,
                "ts": ev.ts.strftime("%Y-%m-%d %H:%M:%S") if isinstance(ev.ts, datetime) else str(ev.ts),
                "actor": ev.actor or "",
                "bureau": ev.bureau.value if hasattr(ev.bureau, "value") else str(ev.bureau or ""),
                "event_type": ev.event_type.value if hasattr(ev.event_type, "value") else str(ev.event_type or ""),
                "from_bureau": ev.from_bureau.value if hasattr(ev.from_bureau, "value") else (str(ev.from_bureau) if ev.from_bureau else ""),
                "to_bureau": ev.to_bureau.value if hasattr(ev.to_bureau, "value") else (str(ev.to_bureau) if ev.to_bureau else ""),
                "from_status": ev.from_status.value if hasattr(ev.from_status, "value") else (str(ev.from_status) if ev.from_status else ""),
                "to_status": ev.to_status.value if hasattr(ev.to_status, "value") else (str(ev.to_status) if ev.to_status else ""),
                "remarks": ev.remarks or "",
                "attachment_ref": ev.attachment_ref or "",
            })
            next_event_id += 1

    event_fieldnames = [
        "id", "case_id", "ts", "actor", "bureau", "event_type",
        "from_bureau", "to_bureau", "from_status", "to_status",
        "remarks", "attachment_ref"
    ]

    all_events = existing_event_rows + new_event_rows
    with open(events_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=event_fieldnames)
        writer.writeheader()
        for ev in all_events:
            writer.writerow(ev)
    print(f"[+] Wrote total {len(all_events)} events to {events_path} (added {len(new_event_rows)} events).")


if __name__ == "__main__":
    existing, filler = generate_filler_cases()
    append_cases_and_events(existing, filler)
