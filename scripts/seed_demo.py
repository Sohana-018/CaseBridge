"""Seed demo scenario data per Section 7, 8 and 10 of CENTRAL_PRD.md.

Institutions and ~22 cases across RB, PGRC, RO, OC.
Varied statuses (pending, under_process, transferred, escalated, disposed).
Varied dates (overdue, due within 3 days, last_action older than 7 days).
Idempotent: Safe to execute multiple times.
"""

from datetime import date, datetime, timedelta, timezone
import os
from pathlib import Path
import sys

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
    EventType,
    Institution,
    Priority,
    Region,
)
from app.services.alerts import refresh_alerts
from app.services.overlap import detect_overlaps


def seed_demo() -> None:
    print("[CaseBridge] Initializing database tables...")
    create_db_and_tables()

    today = date.today()

    with Session(engine) as session:
        # 1. Institutions
        institutions_data = [
            {
                "permanent_id": "DEMO-1042",
                "name": "Example Institute of Technology",
                "address": "Outer Ring Road, Bengaluru",
                "region": Region.SOUTH,
                "state": "Karnataka",
                "type": "Engineering",
            },
            {
                "permanent_id": "DEMO-1055",
                "name": "National Polytechnic College",
                "address": "Sector 14, Gurugram",
                "region": Region.NORTH,
                "state": "Haryana",
                "type": "Polytechnic",
            },
            {
                "permanent_id": "DEMO-1078",
                "name": "Western Institute of Management",
                "address": "Shivaji Nagar, Pune",
                "region": Region.WEST,
                "state": "Maharashtra",
                "type": "Management",
            },
            {
                "permanent_id": "DEMO-1090",
                "name": "Eastern Academy of Pharmaceutical Sciences",
                "address": "Salt Lake Sector V, Kolkata",
                "region": Region.EAST,
                "state": "West Bengal",
                "type": "Pharmacy",
            },
            {
                "permanent_id": "DEMO-1102",
                "name": "Central College of Technology",
                "address": "MP Nagar, Bhopal",
                "region": Region.CENTRAL,
                "state": "Madhya Pradesh",
                "type": "Engineering",
            },
        ]

        inst_map = {}
        for idata in institutions_data:
            existing = session.exec(
                select(Institution).where(Institution.permanent_id == idata["permanent_id"])
            ).first()
            if not existing:
                inst = Institution(**idata)
                session.add(inst)
                session.commit()
                session.refresh(inst)
                inst_map[idata["permanent_id"]] = inst
                print(f"[+] Created institution: {inst.name} ({inst.permanent_id})")
            else:
                inst_map[idata["permanent_id"]] = existing
                print(f"[*] Institution exists: {existing.name} ({existing.permanent_id})")

        # 2. Cases definition (~22 total cases with varied dates, bureaus, and statuses)
        demo_cases = [
            # Original Section 7 Demo scenario pair
            {
                "case_no": "PG-2026-00104",
                "permanent_id": "DEMO-1042",
                "bureau": Bureau.PGRC,
                "category": CaseCategory.FACULTY,
                "description": "Complaint about unqualified faculty in the mechanical department.",
                "received_date": today - timedelta(days=42),
                "status": CaseStatus.UNDER_PROCESS,
                "assigned_officer": "A. Rao",
                "last_action": "Notice sent to institution",
                "last_action_date": today - timedelta(days=22),  # > 7 days (pending reminder eligible)
                "next_action": "Await institution reply",
                "expected_disposal_date": today + timedelta(days=22),
                "priority": Priority.MEDIUM,
            },
            {
                "case_no": "RB-2026-00219",
                "permanent_id": "DEMO-1042",
                "bureau": Bureau.RB,
                "category": CaseCategory.FACULTY,
                "description": "Regulatory inspection regarding mechanical department faculty cadre ratio.",
                "received_date": today - timedelta(days=28),
                "status": CaseStatus.PENDING,
                "assigned_officer": "P. Sharma",
                "last_action": "Inspection inquiry initiated",
                "last_action_date": today - timedelta(days=1),
                "next_action": "Review compliance documents",
                "expected_disposal_date": today + timedelta(days=2),  # <= 3 days (SLA warning eligible)
                "priority": Priority.HIGH,
            },
            # Additional ~20 cases
            # --- Overdue cases (expected_disposal_date < today) -> SLA Breach ---
            {
                "case_no": "RB-2026-00301",
                "permanent_id": "DEMO-1055",
                "bureau": Bureau.RB,
                "category": CaseCategory.INFRASTRUCTURE,
                "description": "Hostel safety non-compliance report submitted by regional team.",
                "received_date": today - timedelta(days=60),
                "status": CaseStatus.UNDER_PROCESS,
                "assigned_officer": "R. K. Mehra",
                "last_action": "Inspection report reviewed",
                "last_action_date": today - timedelta(days=10),
                "next_action": "Issue show cause notice",
                "expected_disposal_date": today - timedelta(days=5),  # Overdue (SLA breach)
                "priority": Priority.HIGH,
            },
            {
                "case_no": "PG-2026-00302",
                "permanent_id": "DEMO-1078",
                "bureau": Bureau.PGRC,
                "category": CaseCategory.FEE_REFUND,
                "description": "Grievance regarding non-refund of capitation fees upon withdrawal.",
                "received_date": today - timedelta(days=45),
                "status": CaseStatus.PENDING,
                "assigned_officer": "S. Kulkarni",
                "last_action": "Grievance recorded",
                "last_action_date": today - timedelta(days=14),  # > 7 days & Overdue
                "next_action": "Issue directive to institute",
                "expected_disposal_date": today - timedelta(days=12),  # Overdue
                "priority": Priority.HIGH,
            },
            {
                "case_no": "RO-2026-00303",
                "permanent_id": "DEMO-1090",
                "bureau": Bureau.RO,
                "category": CaseCategory.APPROVAL,
                "description": "Unauthorized intake expansion in pharmacy diploma wing.",
                "received_date": today - timedelta(days=70),
                "status": CaseStatus.UNDER_PROCESS,
                "assigned_officer": "M. Banerjee",
                "last_action": "Physical verification completed",
                "last_action_date": today - timedelta(days=4),
                "next_action": "Draft final penalty recommendation",
                "expected_disposal_date": today - timedelta(days=2),  # Overdue
                "priority": Priority.HIGH,
            },
            # --- Due within 3 days (today <= expected_disposal_date <= today + 3) -> SLA Warning ---
            {
                "case_no": "OC-2026-00304",
                "permanent_id": "DEMO-1102",
                "bureau": Bureau.OC,
                "category": CaseCategory.ADMISSION,
                "description": "Reservation quota discrepancy in postgraduate admissions.",
                "received_date": today - timedelta(days=20),
                "status": CaseStatus.UNDER_PROCESS,
                "assigned_officer": "A. Joshi",
                "last_action": "Roster sheet received",
                "last_action_date": today - timedelta(days=2),
                "next_action": "Prepare disposal summary",
                "expected_disposal_date": today + timedelta(days=1),  # Due tomorrow (SLA warning)
                "priority": Priority.MEDIUM,
            },
            {
                "case_no": "RO-2026-00305",
                "permanent_id": "DEMO-1055",
                "bureau": Bureau.RO,
                "category": CaseCategory.FACULTY,
                "description": "Irregular biometric attendance for visiting guest lecturers.",
                "received_date": today - timedelta(days=18),
                "status": CaseStatus.PENDING,
                "assigned_officer": "K. Singh",
                "last_action": "Inquiry letter dispatched",
                "last_action_date": today - timedelta(days=3),
                "next_action": "Await explanation letter",
                "expected_disposal_date": today + timedelta(days=3),  # Due in 3 days (SLA warning)
                "priority": Priority.MEDIUM,
            },
            {
                "case_no": "PG-2026-00306",
                "permanent_id": "DEMO-1102",
                "bureau": Bureau.PGRC,
                "category": CaseCategory.EXAMINATION,
                "description": "Delay in revaluation marks declaration causing student loss.",
                "received_date": today - timedelta(days=15),
                "status": CaseStatus.UNDER_PROCESS,
                "assigned_officer": "N. Deshmukh",
                "last_action": "Controller of exam contacted",
                "last_action_date": today - timedelta(days=1),
                "next_action": "Verify marksheets update",
                "expected_disposal_date": today + timedelta(days=2),  # Due in 2 days (SLA warning)
                "priority": Priority.HIGH,
            },
            # --- Inactive > 7 days (today - last_action_date > 7) -> Pending Reminder ---
            {
                "case_no": "RB-2026-00307",
                "permanent_id": "DEMO-1078",
                "bureau": Bureau.RB,
                "category": CaseCategory.APPROVAL,
                "description": "Missing fire safety and structural NOC in campus extension block.",
                "received_date": today - timedelta(days=30),
                "status": CaseStatus.UNDER_PROCESS,
                "assigned_officer": "R. Iyer",
                "last_action": "Second reminder issued to management",
                "last_action_date": today - timedelta(days=11),  # > 7 days (Pending reminder)
                "next_action": "Await NOC submission",
                "expected_disposal_date": today + timedelta(days=20),
                "priority": Priority.MEDIUM,
            },
            {
                "case_no": "OC-2026-00308",
                "permanent_id": "DEMO-1042",
                "bureau": Bureau.OC,
                "category": CaseCategory.OTHER,
                "description": "Internal committee complaint regarding laboratory equipment standards.",
                "received_date": today - timedelta(days=25),
                "status": CaseStatus.PENDING,
                "assigned_officer": "P. Nambiar",
                "last_action": "Referred to technical evaluation sub-committee",
                "last_action_date": today - timedelta(days=9),  # > 7 days (Pending reminder)
                "next_action": "Receive lab audit report",
                "expected_disposal_date": today + timedelta(days=15),
                "priority": Priority.LOW,
            },
            {
                "case_no": "RO-2026-00309",
                "permanent_id": "DEMO-1078",
                "bureau": Bureau.RO,
                "category": CaseCategory.INFRASTRUCTURE,
                "description": "Inadequate library journals and digital subscription facilities.",
                "received_date": today - timedelta(days=35),
                "status": CaseStatus.UNDER_PROCESS,
                "assigned_officer": "V. Nair",
                "last_action": "Librarian statement recorded",
                "last_action_date": today - timedelta(days=15),  # > 7 days (Pending reminder)
                "next_action": "Review updated catalog",
                "expected_disposal_date": today + timedelta(days=25),
                "priority": Priority.LOW,
            },
            # --- Disposed Cases (Should close/have NO open alerts) ---
            {
                "case_no": "RB-2026-00310",
                "permanent_id": "DEMO-1055",
                "bureau": Bureau.RB,
                "category": CaseCategory.FACULTY,
                "description": "Grievance resolved after replacement of unapproved faculty member.",
                "received_date": today - timedelta(days=50),
                "status": CaseStatus.DISPOSED,
                "assigned_officer": "P. Sharma",
                "last_action": "Disposal order issued",
                "last_action_date": today - timedelta(days=5),
                "next_action": None,
                "expected_disposal_date": today - timedelta(days=6),
                "priority": Priority.LOW,
            },
            {
                "case_no": "PG-2026-00311",
                "permanent_id": "DEMO-1090",
                "bureau": Bureau.PGRC,
                "category": CaseCategory.FEE_REFUND,
                "description": "Refund credited to complainant account with bank proof.",
                "received_date": today - timedelta(days=40),
                "status": CaseStatus.DISPOSED,
                "assigned_officer": "T. Ghosh",
                "last_action": "Complainant confirmed receipt and closed",
                "last_action_date": today - timedelta(days=8),
                "next_action": None,
                "expected_disposal_date": today - timedelta(days=10),
                "priority": Priority.LOW,
            },
            {
                "case_no": "RO-2026-00312",
                "permanent_id": "DEMO-1102",
                "bureau": Bureau.RO,
                "category": CaseCategory.ADMISSION,
                "description": "Correction made to merit cutoff list and student enrolled.",
                "received_date": today - timedelta(days=30),
                "status": CaseStatus.DISPOSED,
                "assigned_officer": "A. Joshi",
                "last_action": "Admission confirmed and case closed",
                "last_action_date": today - timedelta(days=3),
                "next_action": None,
                "expected_disposal_date": today - timedelta(days=4),
                "priority": Priority.LOW,
            },
            # --- Transferred and Escalated Cases ---
            {
                "case_no": "PG-2026-00313",
                "permanent_id": "DEMO-1055",
                "bureau": Bureau.RB,
                "category": CaseCategory.APPROVAL,
                "description": "Case transferred from PGRC to Regulation Bureau for policy review.",
                "received_date": today - timedelta(days=22),
                "status": CaseStatus.TRANSFERRED,
                "assigned_officer": "R. K. Mehra",
                "last_action": "Transferred from PGRC to RB",
                "last_action_date": today - timedelta(days=2),
                "next_action": "Schedule hearing under Regulation Bureau",
                "expected_disposal_date": today + timedelta(days=18),
                "priority": Priority.HIGH,
            },
            {
                "case_no": "RB-2026-00314",
                "permanent_id": "DEMO-1090",
                "bureau": Bureau.RB,
                "category": CaseCategory.INFRASTRUCTURE,
                "description": "Escalated for immediate vigilance committee inquiry.",
                "received_date": today - timedelta(days=12),
                "status": CaseStatus.ESCALATED,
                "assigned_officer": "M. Banerjee",
                "last_action": "Escalated: Serious safety violation",
                "last_action_date": today - timedelta(days=1),
                "next_action": "Convene vigilance committee",
                "expected_disposal_date": today + timedelta(days=10),
                "priority": Priority.HIGH,
            },
            # --- Active standard cases (Healthy timelines) ---
            {
                "case_no": "OC-2026-00315",
                "permanent_id": "DEMO-1078",
                "bureau": Bureau.OC,
                "category": CaseCategory.OTHER,
                "description": "Student scholarship disbursement verification query.",
                "received_date": today - timedelta(days=8),
                "status": CaseStatus.UNDER_PROCESS,
                "assigned_officer": "K. Aggarwal",
                "last_action": "Bank account statements received",
                "last_action_date": today - timedelta(days=2),
                "next_action": "Validate with nodal officer",
                "expected_disposal_date": today + timedelta(days=20),
                "priority": Priority.LOW,
            },
            {
                "case_no": "RO-2026-00316",
                "permanent_id": "DEMO-1042",
                "bureau": Bureau.RO,
                "category": CaseCategory.FACULTY,
                "description": "Routine verification of adjunct faculty teaching load records.",
                "received_date": today - timedelta(days=5),
                "status": CaseStatus.PENDING,
                "assigned_officer": "P. Nambiar",
                "last_action": "Documents requested from registrar",
                "last_action_date": today - timedelta(days=1),
                "next_action": "Await submission",
                "expected_disposal_date": today + timedelta(days=25),
                "priority": Priority.LOW,
            },
            {
                "case_no": "PG-2026-00317",
                "permanent_id": "DEMO-1102",
                "bureau": Bureau.PGRC,
                "category": CaseCategory.FEE_REFUND,
                "description": "Application fee refund claim for cancelled entrance test.",
                "received_date": today - timedelta(days=10),
                "status": CaseStatus.UNDER_PROCESS,
                "assigned_officer": "N. Deshmukh",
                "last_action": "Transaction UTR verified",
                "last_action_date": today - timedelta(days=3),
                "next_action": "Issue refund order",
                "expected_disposal_date": today + timedelta(days=12),
                "priority": Priority.MEDIUM,
            },
            {
                "case_no": "RB-2026-00318",
                "permanent_id": "DEMO-1055",
                "bureau": Bureau.RB,
                "category": CaseCategory.APPROVAL,
                "description": "Application for introduction of AI & Data Science B.Tech stream.",
                "received_date": today - timedelta(days=14),
                "status": CaseStatus.UNDER_PROCESS,
                "assigned_officer": "R. K. Mehra",
                "last_action": "Expert visit committee constituted",
                "last_action_date": today - timedelta(days=4),
                "next_action": "Conduct site inspection",
                "expected_disposal_date": today + timedelta(days=30),
                "priority": Priority.HIGH,
            },
            {
                "case_no": "OC-2026-00319",
                "permanent_id": "DEMO-1090",
                "bureau": Bureau.OC,
                "category": CaseCategory.EXAMINATION,
                "description": "Complaint on unfair grading scheme in semester 4 practicals.",
                "received_date": today - timedelta(days=7),
                "status": CaseStatus.PENDING,
                "assigned_officer": "T. Ghosh",
                "last_action": "Complaint registered",
                "last_action_date": today - timedelta(days=2),
                "next_action": "Call for evaluation rubrics",
                "expected_disposal_date": today + timedelta(days=14),
                "priority": Priority.MEDIUM,
            },
            {
                "case_no": "RO-2026-00320",
                "permanent_id": "DEMO-1078",
                "bureau": Bureau.RO,
                "category": CaseCategory.ADMISSION,
                "description": "Grievance alleging denial of admission under sports quota.",
                "received_date": today - timedelta(days=6),
                "status": CaseStatus.UNDER_PROCESS,
                "assigned_officer": "S. Kulkarni",
                "last_action": "Sports achievement certificates scrutinized",
                "last_action_date": today - timedelta(days=1),
                "next_action": "Directive to collegiate selection board",
                "expected_disposal_date": today + timedelta(days=9),
                "priority": Priority.MEDIUM,
            },
            {
                "case_no": "PG-2026-00321",
                "permanent_id": "DEMO-1042",
                "bureau": Bureau.PGRC,
                "category": CaseCategory.INFRASTRUCTURE,
                "description": "Complaints regarding broken hostel lifts and drinking water RO plant.",
                "received_date": today - timedelta(days=16),
                "status": CaseStatus.UNDER_PROCESS,
                "assigned_officer": "A. Rao",
                "last_action": "Maintenance logs inspected",
                "last_action_date": today - timedelta(days=2),
                "next_action": "Final verification visit",
                "expected_disposal_date": today + timedelta(days=8),
                "priority": Priority.LOW,
            },
            {
                "case_no": "RB-2026-00322",
                "permanent_id": "DEMO-1102",
                "bureau": Bureau.RB,
                "category": CaseCategory.FACULTY,
                "description": "Allegation of non-payment of 7th Pay Commission arrears to faculty.",
                "received_date": today - timedelta(days=40),
                "status": CaseStatus.PENDING,
                "assigned_officer": "A. Joshi",
                "last_action": "Financial audit records summoned",
                "last_action_date": today - timedelta(days=12),  # > 7 days & Overdue
                "next_action": "Review CA audited balance sheets",
                "expected_disposal_date": today - timedelta(days=1),  # Overdue
                "priority": Priority.HIGH,
            },
        ]

        for cdata in demo_cases:
            pid = cdata.pop("permanent_id")
            inst_obj = inst_map[pid]
            case_no = cdata["case_no"]

            existing_case = session.exec(select(Case).where(Case.case_no == case_no)).first()
            if not existing_case:
                c = Case(institution_id=inst_obj.id, **cdata)
                session.add(c)
                session.commit()
                session.refresh(c)

                # Add initial event
                ev = CaseEvent(
                    case_id=c.id,
                    ts=datetime.combine(c.received_date, datetime.min.time(), tzinfo=timezone.utc),
                    actor=c.assigned_officer or "System",
                    bureau=c.bureau,
                    event_type=EventType.CREATED,
                    to_status=c.status,
                    remarks=f"Initial registration in {c.bureau.value}",
                )
                session.add(ev)
                session.commit()
                print(f"[+] Created case: {c.case_no} [{c.bureau.value} - {c.status.value}]")
            else:
                print(f"[*] Case exists: {existing_case.case_no}")

        # 3. Refresh and generate all alerts
        print("[CaseBridge] Evaluating active alert rules across all cases...")
        alert_count = refresh_alerts(session, today=today)
        print(f"[+] Evaluated alert rules: {alert_count} alert(s) processed/created.")

        # 4. Run overlap detection scan
        print("[CaseBridge] Running overlap detection scan...")
        overlap_count = detect_overlaps(session, commit=True)
        print(f"[+] Evaluated overlap links: {overlap_count} new overlap link(s) created.")

    print("[CaseBridge] Demo seed completed successfully.")


if __name__ == "__main__":
    seed_demo()
