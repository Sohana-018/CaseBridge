#!/usr/bin/env python3
"""CaseBridge Metrics & Consistency Reporter.

Reads actual sources directly and prints real current counts:
- Backend test suite counts (via AST inspection of test functions)
- Seed dataset counts (cases, institutions, events, and status distributions)
- Overlap evaluation benchmarks (Precision, Recall, F1 across Dev, Test, and All splits)

Usage:
    python scripts/metrics.py
"""

from __future__ import annotations

import ast
import csv
import glob
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(BACKEND))


def count_tests() -> dict:
    """Count total test functions across backend/tests."""
    test_files = sorted(glob.glob(str(BACKEND / "tests" / "test_*.py")))
    file_counts = {}
    total = 0
    for file_path in test_files:
        p = Path(file_path)
        with open(p, "r", encoding="utf-8") as f:
            tree = ast.parse(f.read(), filename=str(p))
        tests = [
            n.name
            for n in ast.walk(tree)
            if isinstance(n, ast.FunctionDef) and n.name.startswith("test_")
        ]
        file_counts[p.name] = len(tests)
        total += len(tests)
    return {"total": total, "files": file_counts}


def count_seed_data() -> dict:
    """Read seed CSV files and count records by status and bureau."""
    cases_file = ROOT / "data" / "seed" / "cases.csv"
    insts_file = ROOT / "data" / "seed" / "institutions.csv"
    events_file = ROOT / "data" / "seed" / "events.csv"

    cases_count = 0
    status_counts: dict[str, int] = {}
    bureau_counts: dict[str, int] = {}
    if cases_file.exists():
        with open(cases_file, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                cases_count += 1
                st = row.get("status", "unknown")
                status_counts[st] = status_counts.get(st, 0) + 1
                bur = row.get("bureau", "unknown")
                bureau_counts[bur] = bureau_counts.get(bur, 0) + 1

    insts_count = 0
    if insts_file.exists():
        with open(insts_file, newline="", encoding="utf-8") as f:
            insts_count = sum(1 for _ in csv.DictReader(f))

    events_count = 0
    if events_file.exists():
        with open(events_file, newline="", encoding="utf-8") as f:
            events_count = sum(1 for _ in csv.DictReader(f))

    return {
        "cases": cases_count,
        "institutions": insts_count,
        "events": events_count,
        "status_counts": status_counts,
        "bureau_counts": bureau_counts,
    }


def compute_eval_metrics() -> dict:
    """Evaluate overlap detection engine against labelled pairs ground truth."""
    from scripts.evaluate_overlap import (
        DEFAULT_DB,
        DEFAULT_LABELLED,
        DEFAULT_SPLIT_FILE,
        build_rows,
        confusion,
        get_institution_split,
        load_cases,
        load_pairs,
        prf,
    )
    from app.services.overlap import get_or_fit_vectorizer

    if not DEFAULT_DB.exists() or not DEFAULT_LABELLED.exists():
        return {"error": "Missing evaluation database or labelled pairs"}

    cases = load_cases(DEFAULT_DB)
    labelled = load_pairs(DEFAULT_LABELLED)

    descriptions = [c.description or "" for c in cases.values()]
    vectorizer = get_or_fit_vectorizer(descriptions, force_refit=True)

    rows, skipped = build_rows(labelled, cases, vectorizer=vectorizer)
    dev_insts, test_insts = get_institution_split(cases, split_file=DEFAULT_SPLIT_FILE)

    dev_rows = [r for r in rows if r.institution_id in dev_insts]
    test_rows = [r for r in rows if r.institution_id in test_insts]

    def split_stat(row_subset, name, n_insts):
        c = confusion(row_subset)
        p, r, f = prf(c["tp"], c["fp"], c["fn"])
        return {
            "split": name,
            "institutions": n_insts,
            "pairs": len(row_subset),
            "precision": round(p, 3),
            "recall": round(r, 3),
            "f1": round(f, 3),
            "tp": c["tp"],
            "fp": c["fp"],
            "fn": c["fn"],
            "tn": c["tn"],
        }

    dev_stat = split_stat(dev_rows, "Development", len(dev_insts))
    test_stat = split_stat(test_rows, "Test (held-out)", len(test_insts))
    all_stat = split_stat(rows, "All Scored Pairs", len(dev_insts) + len(test_insts))

    base_c = confusion(rows, predicate=lambda r: r.baseline_positive)
    bp, br, bf = prf(base_c["tp"], base_c["fp"], base_c["fn"])
    base_stat = {
        "split": "Naive Baseline",
        "institutions": len(dev_insts) + len(test_insts),
        "pairs": len(rows),
        "precision": round(bp, 3),
        "recall": round(br, 3),
        "f1": round(bf, 3),
        "tp": base_c["tp"],
        "fp": base_c["fp"],
        "fn": base_c["fn"],
        "tn": base_c["tn"],
    }

    return {
        "cases_in_eval_db": len(cases),
        "total_scored_pairs": len(rows),
        "development": dev_stat,
        "test": test_stat,
        "all": all_stat,
        "baseline": base_stat,
    }


def main():
    print("=" * 80)
    print("CaseBridge Metrics & Consistency Report")
    print("=" * 80)

    # 1. Test Suite
    test_data = count_tests()
    print(f"\n1. BACKEND TEST SUITE: {test_data['total']} TESTS")
    print("-" * 50)
    for fname, count in test_data["files"].items():
        print(f"  {fname.ljust(26)} : {count:3d} tests")
    print(f"  {'-' * 33}")
    print(f"  {'TOTAL COLLECTED':26} : {test_data['total']:3d} tests")

    # 2. Seed Data
    seed_data = count_seed_data()
    print(f"\n2. SEED DATASET COUNTS")
    print("-" * 50)
    print(f"  Institutions (permanent IDs) : {seed_data['institutions']:5d}")
    print(f"  Seeded Cases (total)         : {seed_data['cases']:5d}")
    print(f"  Initial & Milestone Events   : {seed_data['events']:5d}")
    print("  Status Breakdown:")
    for st, c in sorted(seed_data["status_counts"].items()):
        print(f"    - {st.ljust(18)} : {c:4d}")
    print("  Bureau Breakdown:")
    for bur, c in sorted(seed_data["bureau_counts"].items()):
        print(f"    - {bur.ljust(18)} : {c:4d}")

    # 3. Overlap Evaluation Metrics
    eval_data = compute_eval_metrics()
    print(f"\n3. OVERLAP DETECTION BENCHMARK METRICS")
    print("-" * 80)
    header = f"{'Evaluation Split':<24} {'P':>7} {'R':>7} {'F1':>7} {'TP':>5} {'FP':>5} {'FN':>5} {'TN':>5} {'Pairs':>6}"
    print(header)
    print("-" * 80)
    for key in ("development", "test", "all", "baseline"):
        s = eval_data[key]
        print(
            f"{s['split']:<24} {s['precision']:7.3f} {s['recall']:7.3f} {s['f1']:7.3f} "
            f"{s['tp']:5d} {s['fp']:5d} {s['fn']:5d} {s['tn']:5d} {s['pairs']:6d}"
        )
    print("=" * 80)


if __name__ == "__main__":
    main()
