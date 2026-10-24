"""Generate data/labelled_pairs.csv for overlap evaluation (Phase 4 / Shreeshanth).

Columns: case_a, case_b, label  (related / not_related)
- case_a < case_b (lexicographic, matching OverlapLink convention)
- At least 200 pairs total
- Includes "hard cases": same institution, different bureau, but NOT related
  (e.g. one disposed, or completely different categories far in time)
- Labels follow PRD Section 9 definition:
    related = same institution, different bureau, non-disposed, plausibly linked
    not_related = different institution, OR same institution but clearly unrelated scope

All data is synthetic demo data.
"""

import csv
import sys
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

# ── Seed case catalogue ────────────────────────────────────────────────────────
# Sourced from scripts/seed_demo.py. Each entry: (case_no, permanent_id, bureau, category, status)
CASES = [
    # DEMO-1042  Example Institute of Technology
    ("PG-2026-00104", "DEMO-1042", "PGRC", "faculty",         "under_process"),
    ("RB-2026-00219", "DEMO-1042", "RB",   "faculty",         "pending"),
    ("OC-2026-00308", "DEMO-1042", "OC",   "other",           "pending"),
    ("RO-2026-00316", "DEMO-1042", "RO",   "faculty",         "pending"),
    ("PG-2026-00321", "DEMO-1042", "PGRC", "infrastructure",  "under_process"),

    # DEMO-1055  National Polytechnic College
    ("RB-2026-00301", "DEMO-1055", "RB",   "infrastructure",  "under_process"),
    ("RO-2026-00305", "DEMO-1055", "RO",   "faculty",         "pending"),
    ("RB-2026-00310", "DEMO-1055", "RB",   "faculty",         "disposed"),
    ("PG-2026-00313", "DEMO-1055", "RB",   "approval",        "transferred"),
    ("RB-2026-00318", "DEMO-1055", "RB",   "approval",        "under_process"),

    # DEMO-1078  Western Institute of Management
    ("PG-2026-00302", "DEMO-1078", "PGRC", "fee_refund",      "pending"),
    ("RB-2026-00307", "DEMO-1078", "RB",   "approval",        "under_process"),
    ("RO-2026-00309", "DEMO-1078", "RO",   "infrastructure",  "under_process"),
    ("OC-2026-00315", "DEMO-1078", "OC",   "other",           "under_process"),
    ("RO-2026-00320", "DEMO-1078", "RO",   "admission",       "under_process"),

    # DEMO-1090  Eastern Academy of Pharmaceutical Sciences
    ("RO-2026-00303", "DEMO-1090", "RO",   "approval",        "under_process"),
    ("PG-2026-00311", "DEMO-1090", "PGRC", "fee_refund",      "disposed"),
    ("RB-2026-00314", "DEMO-1090", "RB",   "infrastructure",  "escalated"),
    ("OC-2026-00319", "DEMO-1090", "OC",   "examination",     "pending"),

    # DEMO-1102  Central College of Technology
    ("OC-2026-00304", "DEMO-1102", "OC",   "admission",       "under_process"),
    ("PG-2026-00306", "DEMO-1102", "PGRC", "examination",     "under_process"),
    ("RO-2026-00312", "DEMO-1102", "RO",   "admission",       "disposed"),
    ("PG-2026-00317", "DEMO-1102", "PGRC", "fee_refund",      "under_process"),
    ("RB-2026-00322", "DEMO-1102", "RB",   "faculty",         "pending"),
]

# ── Related-category pairs (PRD Section 9: "related_category" signal) ──────────
RELATED_CATEGORIES = {
    frozenset(["infrastructure", "approval"]),
    frozenset(["faculty", "other"]),
    frozenset(["admission", "examination"]),
    frozenset(["fee_refund", "admission"]),
}

def categories_related(c1: str, c2: str) -> bool:
    return c1 == c2 or frozenset([c1, c2]) in RELATED_CATEGORIES


def label_pair(a: tuple, b: tuple) -> str:
    """
    Apply PRD Section 9 labelling logic:
      - related: same institution, different bureau, neither disposed,
                 AND (same/related category OR same institution alone counts as low signal)
      - not_related: different institutions, or at least one disposed,
                     or same bureau (can't overlap with yourself)
    Hard cases included:
      - same institution + different bureau + disposed → not_related
      - same institution + same bureau → not_related (intra-bureau, no coordination needed)
      - same institution + different bureau + completely unrelated categories → not_related
    """
    _, inst_a, bureau_a, cat_a, status_a = a
    _, inst_b, bureau_b, cat_b, status_b = b

    if inst_a != inst_b:
        return "not_related"

    # Same institution below this point
    if bureau_a == bureau_b:
        return "not_related"  # intra-bureau — hard case

    if status_a == "disposed" or status_b == "disposed":
        return "not_related"  # hard case: disposed pair

    # Same institution, different bureau, both non-disposed
    # Strong overlap signal if categories are same or related
    if categories_related(cat_a, cat_b):
        return "related"

    # Completely unrelated categories — weak signal, label not_related
    # e.g. "fee_refund" vs "infrastructure" — hard case
    return "not_related"


def ordered(a: tuple, b: tuple):
    """Return the pair with lexicographically smaller case_no first."""
    if a[0] < b[0]:
        return a, b
    return b, a


def generate_pairs() -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str]] = set()

    # All combinations from the 24 seed cases
    for a, b in combinations(CASES, 2):
        a, b = ordered(a, b)
        key = (a[0], b[0])
        if key in seen:
            continue
        seen.add(key)
        rows.append((a[0], b[0], label_pair(a, b)))

    # ── Synthetic expansion to reach 200+ pairs ────────────────────────────────
    # We add extra synthetic case numbers that mirror the seed institutions
    # but with institution identifiers shifted (DEMO-2xxx series) to create
    # cross-institution not_related pairs at scale. These are clearly labelled
    # synthetic demo pairs that do NOT need to exist in the DB —
    # they are used only in the evaluation dataset (as explicitly allowed by PRD).
    SYNTH_CASES = []
    institutions = ["DEMO-1042", "DEMO-1055", "DEMO-1078", "DEMO-1090", "DEMO-1102"]
    bureaus = ["RB", "PGRC", "RO", "OC"]
    cats = ["faculty", "infrastructure", "fee_refund", "admission", "approval", "examination", "other"]
    statuses_active = ["pending", "under_process", "escalated", "transferred"]

    idx = 400
    for i, pid in enumerate(institutions):
        for j, bur in enumerate(bureaus):
            for k, cat in enumerate(cats):
                prefix_map = {"RB": "RB", "PGRC": "PG", "RO": "RO", "OC": "OC"}
                case_no = f"{prefix_map[bur]}-2026-{idx:05d}"
                status = statuses_active[(i + j + k) % len(statuses_active)]
                SYNTH_CASES.append((case_no, pid, bur, cat, status))
                idx += 1

    for a, b in combinations(SYNTH_CASES, 2):
        if len(rows) >= 280:
            break
        a, b = ordered(a, b)
        key = (a[0], b[0])
        if key in seen:
            continue
        seen.add(key)
        rows.append((a[0], b[0], label_pair(a, b)))

    return rows


def main() -> None:
    pairs = generate_pairs()
    total = len(pairs)
    related_count = sum(1 for _, _, lbl in pairs if lbl == "related")
    not_related_count = total - related_count

    out_path = DATA_DIR / "labelled_pairs.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["case_a", "case_b", "label"])
        writer.writerows(pairs)

    print(f"[+] Written {total} pairs -> {out_path}")
    print(f"    related:     {related_count}")
    print(f"    not_related: {not_related_count}")
    print(f"    (All synthetic demo data — not real AICTE records)")


if __name__ == "__main__":
    main()
