"""Invariants for the issue-based evaluation ground truth (Phase 12).

These tests do not touch the database or the detection engine. They guard the
property that matters: labels must come only from hidden issue_id values, and
the corpus must contain the promised hard cases.
"""

import csv
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"


def read_csv(path: Path):
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def load():
    institutions = read_csv(DATA / "eval" / "institutions.csv")
    cases = read_csv(DATA / "eval" / "cases.csv")
    hidden = read_csv(DATA / "eval" / "hidden_issues.csv")
    pairs = read_csv(DATA / "labelled_pairs.csv")
    return institutions, cases, hidden, pairs


def test_corpus_size_targets():
    institutions, cases, hidden, pairs = load()
    assert len(institutions) >= 40
    assert len(cases) >= 300
    assert len(hidden) == len(cases)
    related = sum(1 for row in pairs if row["label"] == "related")
    assert related >= 25


def test_every_label_is_derived_only_from_issue_id():
    _, _, hidden, pairs = load()
    issue_of = {row["case_no"]: row["issue_id"] for row in hidden}
    assert len(issue_of) == len(hidden)  # one hidden issue per case

    for pair in pairs:
        expected = (
            "related"
            if issue_of[pair["case_a"]] == issue_of[pair["case_b"]]
            else "not_related"
        )
        assert pair["label"] == expected, pair


def test_pairs_are_same_institution_and_cross_bureau():
    _, cases, _, pairs = load()
    info = {row["case_no"]: row for row in cases}
    for pair in pairs:
        a = info[pair["case_a"]]
        b = info[pair["case_b"]]
        assert a["institution_id"] == b["institution_id"], pair
        assert a["bureau"] != b["bureau"], pair


def test_hard_cases_are_present():
    _, cases, hidden, pairs = load()
    info = {row["case_no"]: row for row in cases}
    issue_of = {row["case_no"]: row["issue_id"] for row in hidden}

    same_category_negative = 0
    different_category_positive = 0
    for pair in pairs:
        a = info[pair["case_a"]]
        b = info[pair["case_b"]]
        same_issue = issue_of[pair["case_a"]] == issue_of[pair["case_b"]]
        same_category = a["category"] == b["category"]

        if same_issue and not same_category:
            different_category_positive += 1
        if not same_issue and same_category:
            same_category_negative += 1

    assert different_category_positive >= 10
    assert same_category_negative >= 10


def test_multi_case_issues_are_cross_bureau():
    _, cases, hidden, _ = load()
    info = {row["case_no"]: row for row in cases}
    by_issue = defaultdict(list)
    for row in hidden:
        by_issue[row["issue_id"]].append(row["case_no"])

    multi = [cases_for_issue for cases_for_issue in by_issue.values() if len(cases_for_issue) > 1]
    assert len(multi) >= 25
    for case_numbers in multi:
        bureaus = {info[case_no]["bureau"] for case_no in case_numbers}
        assert len(bureaus) == len(case_numbers)
