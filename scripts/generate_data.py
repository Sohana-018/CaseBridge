"""Synthetic Data Generator for CaseBridge (SIH26264).

Generates reproducible CSV datasets per PRD Section 7 and Section 9:
1. data/seed/institutions.csv: 25 institutions across 5 regions.
2. data/seed/cases.csv: ~200 cases across RB, PGRC, RO, OC with varied statuses and dates.
   Maintains the PRD demo scenario: DEMO-1042 with PG-2026-00104 and RB-2026-00219.
3. data/planted_truth.md: Planted overlap ground truth documentation.
4. data/labelled_pairs.csv: >= 200 pairs with balanced 50/50 development/test splits.

Fixed random seed for total reproducibility.
"""

import csv
from datetime import date, timedelta
from pathlib import Path
import random

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
SEED_DIR = DATA_DIR / "seed"

FIXED_TODAY = date(2026, 10, 24)
RANDOM_SEED = 42

OFFICER_NAMES = [
    "A. Rao (demo)",
    "P. Sharma (demo)",
    "R. K. Mehra (demo)",
    "S. Kulkarni (demo)",
    "M. Banerjee (demo)",
    "A. Joshi (demo)",
    "K. Singh (demo)",
    "N. Deshmukh (demo)",
    "R. Iyer (demo)",
    "P. Nambiar (demo)",
    "V. Nair (demo)",
    "T. Ghosh (demo)",
    "K. Aggarwal (demo)",
    "S. Sengupta (demo)",
    "H. Verma (demo)",
    "D. Patel (demo)",
]

# Paraphrase templates per topic (Variant A and Variant B for related complaints)
TOPIC_PARAPHRASES = [
    # 1. Faculty cadre & qualification
    {
        "category": "faculty",
        "topic": "Mechanical faculty cadre ratio deficiency",
        "variant_a": "Complaint alleging inadequate qualified professors and abnormal lecturer cadre ratio in mechanical engineering.",
        "variant_b": "Regulatory inspection inquiry reporting non-compliance with AICTE cadre ratio norms in mechanical department.",
        "shared_ref": "Ref: AICTE/2026/FAC-1042",
    },
    {
        "category": "faculty",
        "topic": "Computer Science unapproved visiting faculty",
        "variant_a": "Grievance regarding unqualified visiting faculty conducting core courses in computer science without approval.",
        "variant_b": "Inspection findings highlighting reliance on unapproved ad-hoc instructors for computer science degree modules.",
        "shared_ref": "Ref: GOV/HE/CS-8821",
    },
    {
        "category": "faculty",
        "topic": "Biometric attendance evasion",
        "variant_a": "Petition alleging ghost faculty on college rolls who evade daily biometric attendance verification.",
        "variant_b": "Audit finding indicating systemic manipulation of biometric fingerprint logs for non-resident faculty members.",
        "shared_ref": None,
    },
    {
        "category": "faculty",
        "topic": "7th Pay Commission arrears non-payment",
        "variant_a": "Staff grievance regarding non-implementation of 7th Pay Commission salary scale and delayed arrears.",
        "variant_b": "Notice regarding underpayment of prescribed AICTE pay bands and withholding statutory DA increments.",
        "shared_ref": "Ref: PAY/COMM/2026-09",
    },
    {
        "category": "faculty",
        "topic": "Electrical department faculty shortage",
        "variant_a": "Complaint highlighting critical shortage of teaching staff in electrical and electronics engineering wing.",
        "variant_b": "Inspection report noting vacant sanctioned teaching posts across electrical faculty cadre.",
        "shared_ref": None,
    },
    # 2. Infrastructure & safety
    {
        "category": "infrastructure",
        "topic": "Fire safety and structural NOC missing",
        "variant_a": "Safety notice regarding missing fire clearance certificate and structural stability NOC for academic tower B.",
        "variant_b": "Regulatory inquiry into unauthorized occupation of campus extension wing without mandatory fire safety NOC.",
        "shared_ref": "Ref: FIRE/NOC/2026-441",
    },
    {
        "category": "infrastructure",
        "topic": "Hostel lift and electrical hazards",
        "variant_a": "Student complaints regarding broken passenger elevators and hazardous open electrical panels in boys hostel.",
        "variant_b": "Grievance alleging maintenance negligence resulting in uncertified lifts and dangerous wiring in residential halls.",
        "shared_ref": None,
    },
    {
        "category": "infrastructure",
        "topic": "Deficient pharmacy testing laboratories",
        "variant_a": "Deficiency report indicating missing spectrometer apparatus and expired chemicals in pharmaceutical analysis lab.",
        "variant_b": "Inspection observation stating physical pharmaceutical laboratories lack mandatory analytical equipment.",
        "shared_ref": "Ref: PHARM/LAB/802",
    },
    {
        "category": "infrastructure",
        "topic": "Civil engineering lab equipment breakdown",
        "variant_a": "Complaint regarding obsolete compression testing machines and uncalibrated soil mechanics lab instruments.",
        "variant_b": "Audit query regarding failure to maintain operational machinery required for civil engineering practical exams.",
        "shared_ref": None,
    },
    {
        "category": "infrastructure",
        "topic": "Library digital journal subscription lapse",
        "variant_a": "Grievance alleging complete lapse of mandated IEEE and ScienceDirect digital database subscriptions.",
        "variant_b": "Academic audit stating central library lacks required international e-journal subscriptions for postgraduate research.",
        "shared_ref": None,
    },
    # 3. Fee refund
    {
        "category": "fee_refund",
        "topic": "Capitation fee retention upon withdrawal",
        "variant_a": "Grievance regarding refusal to refund tuition fees following seat withdrawal prior to counseling cutoff.",
        "variant_b": "Complaint citing illegal deduction and retention of full academic semester charges upon admission cancellation.",
        "shared_ref": "Ref: UGC/REFUND/2026-99",
    },
    {
        "category": "fee_refund",
        "topic": "Hostel caution deposit withholding",
        "variant_a": "Petition by outgoing batch regarding unexplained non-refund of institutional caution money deposits.",
        "variant_b": "Grievance alleging institutional withholding of refundable library and hostel caution deposits past graduation.",
        "shared_ref": None,
    },
    {
        "category": "fee_refund",
        "topic": "Cancelled entrance examination fee refund",
        "variant_a": "Complaint regarding failure to process automated refund of registration fees for cancelled entrance test.",
        "variant_b": "Application demanding reimbursement of entrance examination application charges following test scrapping.",
        "shared_ref": "Ref: ENTR/FEE/REF-12",
    },
    {
        "category": "fee_refund",
        "topic": "Arbitrary bus and transport fee forfeiture",
        "variant_a": "Parent grievance protesting non-refund of annual transport fees during mandatory remote internship semester.",
        "variant_b": "Dispute concerning refusal to prorate and refund mandatory bus charges for semester spent off-campus.",
        "shared_ref": None,
    },
    {
        "category": "fee_refund",
        "topic": "Excess tuition fee overcharge",
        "variant_a": "Complaint alleging collection of unapproved capitation fees exceeding state fee regulatory committee caps.",
        "variant_b": "Inquiry into levy of development overhead charges in contravention of statutory fee committee directives.",
        "shared_ref": "Ref: FRC/PENAL/2026-71",
    },
    # 4. Admission
    {
        "category": "admission",
        "topic": "Management quota merit violation",
        "variant_a": "Allegation of irregular admissions in institutional quota bypassing state centralized merit rank list.",
        "variant_b": "Complaint regarding back-door management quota enrollments offered to candidates failing cutoff eligibility.",
        "shared_ref": "Ref: MERIT/ADM/2026-301",
    },
    {
        "category": "admission",
        "topic": "Over-intake beyond sanctioned strength",
        "variant_a": "Regulatory notice regarding admission of students in excess of approved intake capacity in computer science.",
        "variant_b": "Inquiry into unauthorized enrollment over and above sanctioned intake ceiling for B.Tech degree programs.",
        "shared_ref": "Ref: AICTE/CAP/2026-05",
    },
    {
        "category": "admission",
        "topic": "Reserved category seat diversion",
        "variant_a": "Grievance alleging arbitrary de-reservation and commercial sale of unfilled SC/ST quota technical seats.",
        "variant_b": "Petition challenging irregular conversion of statutory reservation quota seats to general unreserved category.",
        "shared_ref": None,
    },
    {
        "category": "admission",
        "topic": "Sports quota document forgery",
        "variant_a": "Complaint regarding fake national sports certificates utilized to secure subsidized engineering admissions.",
        "variant_b": "Inquiry into fraudulent sports credential verifications accepted by collegiate admission committee.",
        "shared_ref": None,
    },
    {
        "category": "admission",
        "topic": "NRI quota commercialization",
        "variant_a": "Petition alleging allotment of NRI quota seats to local non-sponsored applicants for exorbitant cash fees.",
        "variant_b": "Grievance challenging procedural violations in non-resident Indian sponsored seat allocations.",
        "shared_ref": "Ref: NRI/SCRUTINY/2026",
    },
    # 5. Approval
    {
        "category": "approval",
        "topic": "Unapproved evening shift programs",
        "variant_a": "Report citing operation of unauthorized evening polytechnic diploma shifts without statutory sanction.",
        "variant_b": "Regulatory violation notice regarding unapproved second-shift engineering classes conducted off-schedule.",
        "shared_ref": "Ref: APPR/EVN/2026-88",
    },
    {
        "category": "approval",
        "topic": "Off-campus study center without approval",
        "variant_a": "Complaint detailing unauthorized off-campus extension learning center running unapproved management courses.",
        "variant_b": "Inquiry into unaccredited satellite study center operating under parent brand without council clearance.",
        "shared_ref": "Ref: EXT/CAMPUS/2026-19",
    },
    {
        "category": "approval",
        "topic": "Lapse of mandatory NBA accreditation claim",
        "variant_a": "Grievance highlighting false marketing claims of active NBA accreditation for unaccredited core branches.",
        "variant_b": "Notice regarding deceptive publication of expired accreditation status on institutional website and brochure.",
        "shared_ref": None,
    },
    {
        "category": "approval",
        "topic": "AI and Data Science unapproved branch introduction",
        "variant_a": "Complaint regarding enrollment of students in new AI & Data Science B.Tech stream prior to AICTE approval.",
        "variant_b": "Regulatory show cause notice for floating unapproved emerging technology specialization without council NOC.",
        "shared_ref": "Ref: EMERG/TECH/2026-02",
    },
    {
        "category": "approval",
        "topic": "Failure to submit mandatory annual compliance",
        "variant_a": "Regulatory notice regarding non-submission of mandatory annual compliance report for extension of approval.",
        "variant_b": "Default notification for failure to upload audited faculty and infrastructure data for EOA cycle.",
        "shared_ref": None,
    },
    # 6. Examination
    {
        "category": "examination",
        "topic": "Revaluation result deliberate delay",
        "variant_a": "Student petition regarding unexplainable 4-month delay in publishing final year revaluation marksheets.",
        "variant_b": "Grievance detailing delayed declaration of revaluation grades preventing graduates from joining corporate jobs.",
        "shared_ref": "Ref: EXAM/REVAL/2026-61",
    },
    {
        "category": "examination",
        "topic": "Mass practical exam marks manipulation",
        "variant_a": "Complaint alleging arbitrary marks deduction in semester practical exams by external examination panel.",
        "variant_b": "Inquiry into irregularities and biased assessment during final semester laboratory viva examinations.",
        "shared_ref": None,
    },
    {
        "category": "examination",
        "topic": "Withholding degrees for disputed dues",
        "variant_a": "Grievance protesting unlawful retention of original degree certificates over disputed library fines.",
        "variant_b": "Petition challenging collegiate refusal to issue provisional degree scrolls to graduated engineering students.",
        "shared_ref": "Ref: CERT/ISSUE/2026-14",
    },
    {
        "category": "examination",
        "topic": "Paper leakage and exam center tampering",
        "variant_a": "Complaint alleging breach of sealed question paper packets prior to scheduled university examination.",
        "variant_b": "Vigilance inquiry regarding security protocol compromise at designated collegiate examination center.",
        "shared_ref": "Ref: VIG/EXAM/2026-90",
    },
    {
        "category": "examination",
        "topic": "Erratic internal assessment score compilation",
        "variant_a": "Student grievance alleging fabricated mid-term continuous assessment scores uploaded to portal.",
        "variant_b": "Dispute concerning non-transparent internal assessment evaluation rubrics and missing answer scripts.",
        "shared_ref": None,
    },
]


def generate_institutions():
    """Generate exactly 25 institutions across 5 regions."""
    institutions = [
        # Original PRD Demo Scenario institution
        {
            "permanent_id": "DEMO-1042",
            "name": "Example Institute of Technology (demo)",
            "address": "Outer Ring Road, Bengaluru",
            "region": "South",
            "state": "Karnataka",
            "type": "Engineering",
        },
        # 5 North
        {
            "permanent_id": "DEMO-1001",
            "name": "Delhi Technical Campus (demo)",
            "address": "12 Ring Road, Rohini, New Delhi",
            "region": "North",
            "state": "Delhi",
            "type": "Engineering",
        },
        {
            "permanent_id": "DEMO-1002",
            "name": "Himalayan Institute of Technology (demo)",
            "address": "Subhash Road, Dehradun",
            "region": "North",
            "state": "Uttarakhand",
            "type": "Engineering",
        },
        {
            "permanent_id": "DEMO-1003",
            "name": "Punjab Polytechnic Academy (demo)",
            "address": "GT Road, Ludhiana",
            "region": "North",
            "state": "Punjab",
            "type": "Polytechnic",
        },
        {
            "permanent_id": "DEMO-1004",
            "name": "Haryana College of Pharmacy (demo)",
            "address": "NH-44, Sonipat",
            "region": "North",
            "state": "Haryana",
            "type": "Pharmacy",
        },
        {
            "permanent_id": "DEMO-1005",
            "name": "Lucknow Management Institute (demo)",
            "address": "Gomti Nagar, Lucknow",
            "region": "North",
            "state": "Uttar Pradesh",
            "type": "Management",
        },
        # 5 South
        {
            "permanent_id": "DEMO-1006",
            "name": "Bangalore Institute of Applied Sciences (demo)",
            "address": "Electronics City, Bengaluru",
            "region": "South",
            "state": "Karnataka",
            "type": "Science",
        },
        {
            "permanent_id": "DEMO-1007",
            "name": "Chennai Technological University Campus (demo)",
            "address": "OMR Tech Corridor, Chennai",
            "region": "South",
            "state": "Tamil Nadu",
            "type": "Engineering",
        },
        {
            "permanent_id": "DEMO-1008",
            "name": "Kerala College of Architecture (demo)",
            "address": "Kochi Infopark Road, Kochi",
            "region": "South",
            "state": "Kerala",
            "type": "Architecture",
        },
        {
            "permanent_id": "DEMO-1009",
            "name": "Hyderabad Polytechnic Institute (demo)",
            "address": "HITEC City, Hyderabad",
            "region": "South",
            "state": "Telangana",
            "type": "Polytechnic",
        },
        {
            "permanent_id": "DEMO-1010",
            "name": "Mysore School of Management (demo)",
            "address": "Hunsur Road, Mysuru",
            "region": "South",
            "state": "Karnataka",
            "type": "Management",
        },
        # 5 East
        {
            "permanent_id": "DEMO-1011",
            "name": "Kolkata Engineering College (demo)",
            "address": "Salt Lake Sector V, Kolkata",
            "region": "East",
            "state": "West Bengal",
            "type": "Engineering",
        },
        {
            "permanent_id": "DEMO-1012",
            "name": "Odisha Institute of Technology (demo)",
            "address": "Infocity, Bhubaneswar",
            "region": "East",
            "state": "Odisha",
            "type": "Engineering",
        },
        {
            "permanent_id": "DEMO-1013",
            "name": "Patna Polytechnic College (demo)",
            "address": "Bailey Road, Patna",
            "region": "East",
            "state": "Bihar",
            "type": "Polytechnic",
        },
        {
            "permanent_id": "DEMO-1014",
            "name": "Assam Pharmaceutical Academy (demo)",
            "address": "Jalukbari, Guwahati",
            "region": "East",
            "state": "Assam",
            "type": "Pharmacy",
        },
        {
            "permanent_id": "DEMO-1015",
            "name": "Ranchi Management Institute (demo)",
            "address": "Kanke Road, Ranchi",
            "region": "East",
            "state": "Jharkhand",
            "type": "Management",
        },
        # 5 West
        {
            "permanent_id": "DEMO-1016",
            "name": "Mumbai Institute of Technology (demo)",
            "address": "Andheri East, Mumbai",
            "region": "West",
            "state": "Maharashtra",
            "type": "Engineering",
        },
        {
            "permanent_id": "DEMO-1017",
            "name": "Gujarat Technological Academy (demo)",
            "address": "SG Highway, Ahmedabad",
            "region": "West",
            "state": "Gujarat",
            "type": "Engineering",
        },
        {
            "permanent_id": "DEMO-1018",
            "name": "Pune College of Pharmacy (demo)",
            "address": "Kothrud, Pune",
            "region": "West",
            "state": "Maharashtra",
            "type": "Pharmacy",
        },
        {
            "permanent_id": "DEMO-1019",
            "name": "Goa Institute of Management Studies (demo)",
            "address": "Panaji Marine Drive, Goa",
            "region": "West",
            "state": "Goa",
            "type": "Management",
        },
        {
            "permanent_id": "DEMO-1020",
            "name": "Nagpur Polytechnic Institute (demo)",
            "address": "Wardha Road, Nagpur",
            "region": "West",
            "state": "Maharashtra",
            "type": "Polytechnic",
        },
        # 4 Central
        {
            "permanent_id": "DEMO-1021",
            "name": "Bhopal Engineering College (demo)",
            "address": "Hoshangabad Road, Bhopal",
            "region": "Central",
            "state": "Madhya Pradesh",
            "type": "Engineering",
        },
        {
            "permanent_id": "DEMO-1022",
            "name": "Indore Institute of Management (demo)",
            "address": "Bhawarkua, Indore",
            "region": "Central",
            "state": "Madhya Pradesh",
            "type": "Management",
        },
        {
            "permanent_id": "DEMO-1023",
            "name": "Raipur Institute of Technology (demo)",
            "address": "GE Road, Raipur",
            "region": "Central",
            "state": "Chhattisgarh",
            "type": "Engineering",
        },
        {
            "permanent_id": "DEMO-1024",
            "name": "Gwalior Polytechnic College (demo)",
            "address": "Jhansi Road, Gwalior",
            "region": "Central",
            "state": "Madhya Pradesh",
            "type": "Polytechnic",
        },
    ]
    return institutions


def make_case_number(bureau: str, year: int, seq: int) -> str:
    """Format case number according to PRD prefix rule."""
    prefix_map = {"RB": "RB", "PGRC": "PG", "RO": "RO", "OC": "OC"}
    p = prefix_map[bureau]
    return f"{p}-{year}-{seq:05d}"


def build_cases_and_ground_truth(institutions):
    """Generate ~200 cases with planted true overlaps, near-misses, and trap pairs."""
    random.seed(RANDOM_SEED)

    cases = []
    true_overlaps = []
    near_misses = []
    traps = []

    case_counters = {"RB": 500, "PGRC": 500, "RO": 500, "OC": 500}

    def next_case_no(bureau: str, year: int = 2026) -> str:
        case_counters[bureau] += 1
        return make_case_number(bureau, year, case_counters[bureau])

    # 1. Exact PRD Demo Scenario at DEMO-1042
    demo_case_pg = {
        "case_no": "PG-2026-00104",
        "permanent_id": "DEMO-1042",
        "bureau": "PGRC",
        "category": "faculty",
        "description": "Complaint about unqualified faculty in the mechanical department.",
        "received_date": FIXED_TODAY - timedelta(days=42),
        "status": "under_process",
        "assigned_officer": "A. Rao (demo)",
        "last_action": "Notice sent to institution",
        "last_action_date": FIXED_TODAY - timedelta(days=22),
        "next_action": "Await institution reply",
        "expected_disposal_date": FIXED_TODAY + timedelta(days=22),
        "priority": "medium",
    }
    demo_case_rb = {
        "case_no": "RB-2026-00219",
        "permanent_id": "DEMO-1042",
        "bureau": "RB",
        "category": "faculty",
        "description": "Regulatory inspection regarding mechanical department faculty cadre ratio. Ref: AICTE/2026/FAC-1042",
        "received_date": FIXED_TODAY - timedelta(days=28),
        "status": "pending",
        "assigned_officer": "P. Sharma (demo)",
        "last_action": "Inspection inquiry initiated",
        "last_action_date": FIXED_TODAY - timedelta(days=1),
        "next_action": "Review compliance documents",
        "expected_disposal_date": FIXED_TODAY + timedelta(days=2),  # Due in 2 days (SLA warning)
        "priority": "high",
    }
    cases.append(demo_case_pg)
    cases.append(demo_case_rb)
    true_overlaps.append({
        "case_a": min(demo_case_pg["case_no"], demo_case_rb["case_no"]),
        "case_b": max(demo_case_pg["case_no"], demo_case_rb["case_no"]),
        "permanent_id": "DEMO-1042",
        "reason": "PRD central demo scenario: PGRC grievance and RB regulatory inquiry about mechanical faculty cadre ratio",
    })

    # Plant 29 more True Overlaps (making 30 true overlaps total)
    # Use topic paraphrases across institutions
    inst_pool = [inst["permanent_id"] for inst in institutions if inst["permanent_id"] != "DEMO-1042"]

    bureau_pairs = [
        ("RB", "PGRC"),
        ("PGRC", "RO"),
        ("RO", "OC"),
        ("RB", "OC"),
        ("PGRC", "RB"),
        ("RO", "RB"),
    ]

    for i in range(1, 30):
        topic_info = TOPIC_PARAPHRASES[i % len(TOPIC_PARAPHRASES)]
        inst_id = inst_pool[i % len(inst_pool)]
        bureau_a, bureau_b = bureau_pairs[i % len(bureau_pairs)]

        # Variation in timing: fresh, pending reminder, SLA warning, overdue
        days_rec_a = 15 + (i * 3) % 40
        days_rec_b = days_rec_a - ((i % 10) + 1)
        rec_a = FIXED_TODAY - timedelta(days=days_rec_a)
        rec_b = FIXED_TODAY - timedelta(days=days_rec_b)

        last_a = rec_a + timedelta(days=(days_rec_a // 2))
        last_b = rec_b + timedelta(days=(days_rec_b // 2))

        # Expected disposal variation
        if i % 4 == 0:  # Overdue
            exp_a = FIXED_TODAY - timedelta(days=2)
            exp_b = FIXED_TODAY - timedelta(days=4)
            status_a = "under_process"
            status_b = "under_process"
        elif i % 4 == 1:  # Due soon
            exp_a = FIXED_TODAY + timedelta(days=2)
            exp_b = FIXED_TODAY + timedelta(days=3)
            status_a = "pending"
            status_b = "pending"
        elif i % 4 == 2:  # Stale (last action > 7 days ago)
            last_a = FIXED_TODAY - timedelta(days=12)
            last_b = FIXED_TODAY - timedelta(days=9)
            exp_a = FIXED_TODAY + timedelta(days=20)
            exp_b = FIXED_TODAY + timedelta(days=25)
            status_a = "under_process"
            status_b = "escalated"
        else:
            exp_a = FIXED_TODAY + timedelta(days=15)
            exp_b = FIXED_TODAY + timedelta(days=18)
            status_a = "under_process"
            status_b = "pending"

        desc_a = topic_info["variant_a"]
        desc_b = topic_info["variant_b"]
        if topic_info["shared_ref"]:
            desc_a += f" [{topic_info['shared_ref']}]"
            desc_b += f" [Inquiry {topic_info['shared_ref']}]"

        c_a = {
            "case_no": next_case_no(bureau_a),
            "permanent_id": inst_id,
            "bureau": bureau_a,
            "category": topic_info["category"],
            "description": desc_a,
            "received_date": rec_a,
            "status": status_a,
            "assigned_officer": OFFICER_NAMES[(i * 2) % len(OFFICER_NAMES)],
            "last_action": "Preliminary scrutiny completed",
            "last_action_date": last_a,
            "next_action": "Await institutional clarification",
            "expected_disposal_date": exp_a,
            "priority": "high" if i % 2 == 0 else "medium",
        }
        c_b = {
            "case_no": next_case_no(bureau_b),
            "permanent_id": inst_id,
            "bureau": bureau_b,
            "category": topic_info["category"],
            "description": desc_b,
            "received_date": rec_b,
            "status": status_b,
            "assigned_officer": OFFICER_NAMES[(i * 2 + 1) % len(OFFICER_NAMES)],
            "last_action": "Notice issued to college management",
            "last_action_date": last_b,
            "next_action": "Conduct committee verification",
            "expected_disposal_date": exp_b,
            "priority": "high" if i % 2 == 0 else "medium",
        }
        cases.append(c_a)
        cases.append(c_b)

        true_overlaps.append({
            "case_a": min(c_a["case_no"], c_b["case_no"]),
            "case_b": max(c_a["case_no"], c_b["case_no"]),
            "permanent_id": inst_id,
            "reason": f"Same institution ({inst_id}), different bureaus ({bureau_a} & {bureau_b}), related topic: '{topic_info['topic']}'",
        })

    # 3. Plant 30 Near-Misses (same institution, different bureau, completely unrelated topic)
    for j in range(30):
        inst_id = institutions[j % len(institutions)]["permanent_id"]
        bureau_a, bureau_b = bureau_pairs[(j + 2) % len(bureau_pairs)]

        topic_1 = TOPIC_PARAPHRASES[j % len(TOPIC_PARAPHRASES)]
        topic_2 = TOPIC_PARAPHRASES[(j + 11) % len(TOPIC_PARAPHRASES)]
        # Ensure distinct categories
        while topic_2["category"] == topic_1["category"]:
            topic_2 = TOPIC_PARAPHRASES[(topic_2.get("__idx", 0) + 3) % len(TOPIC_PARAPHRASES)]

        rec_a = FIXED_TODAY - timedelta(days=20 + (j % 25))
        rec_b = FIXED_TODAY - timedelta(days=15 + (j % 20))

        c_a = {
            "case_no": next_case_no(bureau_a),
            "permanent_id": inst_id,
            "bureau": bureau_a,
            "category": topic_1["category"],
            "description": topic_1["variant_a"],
            "received_date": rec_a,
            "status": "under_process",
            "assigned_officer": OFFICER_NAMES[j % len(OFFICER_NAMES)],
            "last_action": "Documents called for review",
            "last_action_date": rec_a + timedelta(days=5),
            "next_action": "Verification meeting",
            "expected_disposal_date": FIXED_TODAY + timedelta(days=20),
            "priority": "medium",
        }
        c_b = {
            "case_no": next_case_no(bureau_b),
            "permanent_id": inst_id,
            "bureau": bureau_b,
            "category": topic_2["category"],
            "description": topic_2["variant_b"],
            "received_date": rec_b,
            "status": "pending",
            "assigned_officer": OFFICER_NAMES[(j + 3) % len(OFFICER_NAMES)],
            "last_action": "Grievance received and cataloged",
            "last_action_date": rec_b + timedelta(days=2),
            "next_action": "Initial notice dispatch",
            "expected_disposal_date": FIXED_TODAY + timedelta(days=25),
            "priority": "low",
        }
        cases.append(c_a)
        cases.append(c_b)

        near_misses.append({
            "case_a": min(c_a["case_no"], c_b["case_no"]),
            "case_b": max(c_a["case_no"], c_b["case_no"]),
            "permanent_id": inst_id,
            "reason": f"Same institution ({inst_id}), different bureaus ({bureau_a} & {bureau_b}), but unrelated issues: '{topic_1['topic']}' vs '{topic_2['topic']}'",
        })

    # 4. Plant 10 Trap Pairs (Similar wording, DIFFERENT institutions)
    for k in range(10):
        inst_a = institutions[k % len(institutions)]["permanent_id"]
        inst_b = institutions[(k + 7) % len(institutions)]["permanent_id"]

        topic_info = TOPIC_PARAPHRASES[(k + 5) % len(TOPIC_PARAPHRASES)]
        template_text = f"Standard complaint alleging {topic_info['topic'].lower()} in campus premises without required compliance. Template ref code: STD-TMP-{k:02d}."

        c_a = {
            "case_no": next_case_no("PGRC"),
            "permanent_id": inst_a,
            "bureau": "PGRC",
            "category": topic_info["category"],
            "description": template_text,
            "received_date": FIXED_TODAY - timedelta(days=18),
            "status": "under_process",
            "assigned_officer": OFFICER_NAMES[k % len(OFFICER_NAMES)],
            "last_action": "Notice sent",
            "last_action_date": FIXED_TODAY - timedelta(days=5),
            "next_action": "Await reply",
            "expected_disposal_date": FIXED_TODAY + timedelta(days=12),
            "priority": "medium",
        }
        c_b = {
            "case_no": next_case_no("RB"),
            "permanent_id": inst_b,
            "bureau": "RB",
            "category": topic_info["category"],
            "description": template_text,
            "received_date": FIXED_TODAY - timedelta(days=22),
            "status": "pending",
            "assigned_officer": OFFICER_NAMES[(k + 2) % len(OFFICER_NAMES)],
            "last_action": "Complaint logged",
            "last_action_date": FIXED_TODAY - timedelta(days=6),
            "next_action": "Review report",
            "expected_disposal_date": FIXED_TODAY + timedelta(days=14),
            "priority": "medium",
        }
        cases.append(c_a)
        cases.append(c_b)

        traps.append({
            "case_a": min(c_a["case_no"], c_b["case_no"]),
            "case_b": max(c_a["case_no"], c_b["case_no"]),
            "inst_a": inst_a,
            "inst_b": inst_b,
            "reason": f"Trap pair: identical wording ('{topic_info['topic']}'), but distinct institutions ({inst_a} vs {inst_b})",
        })

    # 5. Plant a few Disposed cases and Old cases (>365 days old)
    # Case 1 & 2: Same institution, related issue, but OLD (>365 days apart)
    old_c1 = {
        "case_no": next_case_no("PGRC", year=2025),
        "permanent_id": "DEMO-1001",
        "bureau": "PGRC",
        "category": "infrastructure",
        "description": "Historical complaint regarding hostel water filtration plant in academic block.",
        "received_date": FIXED_TODAY - timedelta(days=400),
        "status": "disposed",
        "assigned_officer": "R. K. Mehra (demo)",
        "last_action": "Filter plant overhauled and case closed",
        "last_action_date": FIXED_TODAY - timedelta(days=350),
        "next_action": None,
        "expected_disposal_date": FIXED_TODAY - timedelta(days=340),
        "priority": "low",
    }
    old_c2 = {
        "case_no": next_case_no("RB"),
        "permanent_id": "DEMO-1001",
        "bureau": "RB",
        "category": "infrastructure",
        "description": "Notice regarding water quality and RO plant compliance in student hostels.",
        "received_date": FIXED_TODAY - timedelta(days=15),
        "status": "under_process",
        "assigned_officer": "K. Singh (demo)",
        "last_action": "Water sample test requested",
        "last_action_date": FIXED_TODAY - timedelta(days=2),
        "next_action": "Review lab results",
        "expected_disposal_date": FIXED_TODAY + timedelta(days=15),
        "priority": "medium",
    }
    cases.append(old_c1)
    cases.append(old_c2)

    # Disposed cases with varied categories
    disposed_examples = [
        ("DEMO-1002", "RO", "approval", "Approval renewal completed after inspection report."),
        ("DEMO-1003", "PGRC", "fee_refund", "Excess examination charges refunded with bank transaction proof."),
        ("DEMO-1004", "OC", "admission", "Quota roster reconciliation completed by registrar office."),
        ("DEMO-1005", "RB", "faculty", "Replacement of unqualified department head confirmed with CV records."),
        ("DEMO-1006", "PGRC", "examination", "Corrected grade cards distributed to all affected candidates."),
    ]
    for d_inst, d_bur, d_cat, d_desc in disposed_examples:
        d_rec = FIXED_TODAY - timedelta(days=50)
        cases.append({
            "case_no": next_case_no(d_bur),
            "permanent_id": d_inst,
            "bureau": d_bur,
            "category": d_cat,
            "description": d_desc,
            "received_date": d_rec,
            "status": "disposed",
            "assigned_officer": OFFICER_NAMES[len(cases) % len(OFFICER_NAMES)],
            "last_action": "Disposal order issued and verified",
            "last_action_date": FIXED_TODAY - timedelta(days=10),
            "next_action": None,
            "expected_disposal_date": FIXED_TODAY - timedelta(days=15),
            "priority": "low",
        })

    # 6. Fill remaining cases up to ~200 with varied realistic cases
    statuses = ["pending", "under_process", "transferred", "escalated"]
    categories = ["infrastructure", "faculty", "fee_refund", "admission", "approval", "examination", "other"]
    bureaus = ["RB", "PGRC", "RO", "OC"]

    while len(cases) < 200:
        idx = len(cases)
        inst_obj = institutions[idx % len(institutions)]
        bureau = bureaus[idx % len(bureaus)]
        cat = categories[idx % len(categories)]
        stat = statuses[idx % len(statuses)]
        topic_info = TOPIC_PARAPHRASES[idx % len(TOPIC_PARAPHRASES)]

        rec = FIXED_TODAY - timedelta(days=8 + (idx % 35))
        # ensure last_action_date is between rec and today
        last_offset = (idx % 6) + 1
        last_d = min(FIXED_TODAY, rec + timedelta(days=last_offset))

        # Expected disposal date logic
        if idx % 5 == 0:  # Overdue
            exp = FIXED_TODAY - timedelta(days=1 + (idx % 4))
        elif idx % 5 == 1:  # Due within 3 days
            exp = FIXED_TODAY + timedelta(days=idx % 4)
        else:
            exp = FIXED_TODAY + timedelta(days=10 + (idx % 20))

        # Ensure expected >= received
        if exp < rec:
            exp = rec + timedelta(days=5)

        cases.append({
            "case_no": next_case_no(bureau),
            "permanent_id": inst_obj["permanent_id"],
            "bureau": bureau,
            "category": cat,
            "description": f"Standard institutional monitoring matter regarding {cat} compliance in {inst_obj['name']}. {topic_info['variant_a']}",
            "received_date": rec,
            "status": stat,
            "assigned_officer": OFFICER_NAMES[idx % len(OFFICER_NAMES)],
            "last_action": "Routine case activity recorded",
            "last_action_date": last_d,
            "next_action": "Periodic compliance review",
            "expected_disposal_date": exp,
            "priority": "high" if idx % 3 == 0 else "medium",
        })

    return cases, true_overlaps, near_misses, traps


def generate_labelled_pairs(cases, true_overlaps, near_misses, traps):
    """Generate at least 200 labelled pairs (development and test, 50/50 balanced).

    Includes:
    - 30 true overlaps (related)
    - 30 near-misses (not_related, same institution different bureau)
    - 10 trap pairs (not_related, different institution similar text)
    - 140 easy negatives (not_related, different institution unrelated text)
    Total: 210 pairs (105 dev, 105 test).
    """
    random.seed(RANDOM_SEED)

    case_map = {c["case_no"]: c for c in cases}
    used_pairs = set()

    labelled_pairs = []

    # 1. 30 True overlaps (related)
    for idx, item in enumerate(true_overlaps):
        c1, c2 = item["case_a"], item["case_b"]
        pair_key = (min(c1, c2), max(c1, c2))
        used_pairs.add(pair_key)
        # Alternate dev/test to keep 50/50 balance
        split = "development" if idx % 2 == 0 else "test"
        labelled_pairs.append({
            "case_a": pair_key[0],
            "case_b": pair_key[1],
            "label": "related",
            "split": split,
            "type": "true_overlap",
        })

    # 2. 30 Near-misses (not_related, same institution)
    for idx, item in enumerate(near_misses):
        c1, c2 = item["case_a"], item["case_b"]
        pair_key = (min(c1, c2), max(c1, c2))
        used_pairs.add(pair_key)
        split = "development" if idx % 2 == 0 else "test"
        labelled_pairs.append({
            "case_a": pair_key[0],
            "case_b": pair_key[1],
            "label": "not_related",
            "split": split,
            "type": "near_miss",
        })

    # 3. 10 Trap pairs (not_related, different institutions)
    for idx, item in enumerate(traps):
        c1, c2 = item["case_a"], item["case_b"]
        pair_key = (min(c1, c2), max(c1, c2))
        used_pairs.add(pair_key)
        split = "development" if idx % 2 == 0 else "test"
        labelled_pairs.append({
            "case_a": pair_key[0],
            "case_b": pair_key[1],
            "label": "not_related",
            "split": split,
            "type": "trap",
        })

    # 4. 140 Easy negatives (random pairs across different institutions)
    all_case_nos = [c["case_no"] for c in cases]
    easy_count = 0
    dev_easy_count = 0
    test_easy_count = 0

    attempts = 0
    while easy_count < 140 and attempts < 10000:
        attempts += 1
        c1 = random.choice(all_case_nos)
        c2 = random.choice(all_case_nos)
        if c1 == c2:
            continue
        p1, p2 = min(c1, c2), max(c1, c2)
        if (p1, p2) in used_pairs:
            continue

        obj1 = case_map[p1]
        obj2 = case_map[p2]
        # Must be different institutions and different categories for easy negative
        if obj1["permanent_id"] == obj2["permanent_id"] or obj1["category"] == obj2["category"]:
            continue

        used_pairs.add((p1, p2))
        split = "development" if (easy_count % 2 == 0) else "test"
        if split == "development":
            dev_easy_count += 1
        else:
            test_easy_count += 1

        labelled_pairs.append({
            "case_a": p1,
            "case_b": p2,
            "label": "not_related",
            "split": split,
            "type": "easy_negative",
        })
        easy_count += 1

    return labelled_pairs


def write_outputs(institutions, cases, true_overlaps, near_misses, traps, labelled_pairs):
    """Write institutions.csv, cases.csv, planted_truth.md, and labelled_pairs.csv."""
    SEED_DIR.mkdir(parents=True, exist_ok=True)

    # 1. institutions.csv
    inst_csv_path = SEED_DIR / "institutions.csv"
    with open(inst_csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["permanent_id", "name", "address", "region", "state", "type"])
        writer.writeheader()
        for inst in institutions:
            writer.writerow(inst)
    print(f"[+] Wrote {len(institutions)} institutions to {inst_csv_path}")

    # 2. cases.csv
    cases_csv_path = SEED_DIR / "cases.csv"
    case_fields = [
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
    with open(cases_csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=case_fields)
        writer.writeheader()
        for c in cases:
            row = dict(c)
            # Ensure dates are YYYY-MM-DD
            for d_field in ["received_date", "last_action_date", "expected_disposal_date"]:
                if isinstance(row.get(d_field), date):
                    row[d_field] = row[d_field].isoformat()
            writer.writerow(row)
    print(f"[+] Wrote {len(cases)} cases to {cases_csv_path}")

    # 3. planted_truth.md
    planted_path = DATA_DIR / "planted_truth.md"
    with open(planted_path, "w", encoding="utf-8") as f:
        f.write("# CaseBridge: Planted Overlap Ground Truth\n\n")
        f.write("This document records the exact ground truth pairs planted into the synthetic dataset.\n")
        f.write("Labels are defined by actual scenario design, never derived from similarity or heuristic algorithms.\n\n")

        f.write(f"## Summary\n")
        f.write(f"- Total Institutions: {len(institutions)}\n")
        f.write(f"- Total Cases: {len(cases)}\n")
        f.write(f"- True Overlaps (Related): {len(true_overlaps)}\n")
        f.write(f"- Near-Misses (Same institution, different bureau, unrelated issue): {len(near_misses)}\n")
        f.write(f"- Trap Pairs (Different institution, highly similar wording): {len(traps)}\n\n")

        f.write("## 1. True Overlaps (`related`)\n\n")
        f.write("| Case A | Case B | Institution | Planted Rationale |\n")
        f.write("|---|---|---|---|\n")
        for item in true_overlaps:
            f.write(f"| `{item['case_a']}` | `{item['case_b']}` | `{item['permanent_id']}` | {item['reason']} |\n")

        f.write("\n## 2. Near-Misses (`not_related` - Same Institution, Different Topic)\n\n")
        f.write("| Case A | Case B | Institution | Planted Rationale |\n")
        f.write("|---|---|---|---|\n")
        for item in near_misses:
            f.write(f"| `{item['case_a']}` | `{item['case_b']}` | `{item['permanent_id']}` | {item['reason']} |\n")

        f.write("\n## 3. Trap Pairs (`not_related` - Different Institutions, Similar Text)\n\n")
        f.write("| Case A | Case B | Institution A | Institution B | Planted Rationale |\n")
        f.write("|---|---|---|---|---|\n")
        for item in traps:
            f.write(f"| `{item['case_a']}` | `{item['case_b']}` | `{item['inst_a']}` | `{item['inst_b']}` | {item['reason']} |\n")

    print(f"[+] Wrote ground truth documentation to {planted_path}")

    # 4. data/labelled_pairs.csv
    labelled_path = DATA_DIR / "labelled_pairs.csv"
    with open(labelled_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["case_a", "case_b", "label", "split"])
        writer.writeheader()
        for p in labelled_pairs:
            writer.writerow({
                "case_a": p["case_a"],
                "case_b": p["case_b"],
                "label": p["label"],
                "split": p["split"],
            })
    print(f"[+] Wrote {len(labelled_pairs)} labelled pairs to {labelled_path}")


def main():
    print("[CaseBridge] Generating synthetic dataset...")
    institutions = generate_institutions()
    cases, true_overlaps, near_misses, traps = build_cases_and_ground_truth(institutions)
    labelled_pairs = generate_labelled_pairs(cases, true_overlaps, near_misses, traps)
    write_outputs(institutions, cases, true_overlaps, near_misses, traps, labelled_pairs)
    print("[CaseBridge] Generation completed successfully.")


if __name__ == "__main__":
    main()
