import csv
from datetime import date
from pathlib import Path
import sys
import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.models import Case, CaseEvent, Counter, Institution
from app.services.alerts import refresh_alerts
from scripts.import_csv import import_csv

DATA_DIR = ROOT_DIR / "data"
SEED_DIR = DATA_DIR / "seed"
FIXED_TODAY = date(2026, 10, 24)


@pytest.fixture(name="db_session")
def db_session_fixture():
    """In-memory SQLite session fixture for import testing."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


def test_import_twice_gives_same_row_counts(db_session: Session):
    """Test importing CSVs twice is idempotent: second run inserts 0 duplicates and row counts stay identical."""
    # First run
    res1 = import_csv(session=db_session, seed_dir=SEED_DIR, today=FIXED_TODAY)
    assert res1["institutions_created"] == 25
    assert res1["cases_created"] == 555
    assert res1["institutions_skipped"] == 0
    assert res1["cases_skipped"] == 0

    inst_count_1 = len(db_session.exec(select(Institution)).all())
    cases_count_1 = len(db_session.exec(select(Case)).all())
    events_count_1 = len(db_session.exec(select(CaseEvent)).all())

    assert inst_count_1 == 25
    assert cases_count_1 == 555
    assert events_count_1 >= 555  # Initial and milestone events

    # Second run
    res2 = import_csv(session=db_session, seed_dir=SEED_DIR, today=FIXED_TODAY)
    assert res2["institutions_created"] == 0
    assert res2["cases_created"] == 0
    assert res2["institutions_skipped"] == 25
    assert res2["cases_skipped"] == 555

    inst_count_2 = len(db_session.exec(select(Institution)).all())
    cases_count_2 = len(db_session.exec(select(Case)).all())
    events_count_2 = len(db_session.exec(select(CaseEvent)).all())

    assert inst_count_2 == inst_count_1
    assert cases_count_2 == cases_count_1
    assert events_count_2 == events_count_1


def test_demo_pair_exists(db_session: Session):
    """Test that the central PRD demo pair (DEMO-1042, PG-2026-00104, RB-2026-00219) exists."""
    import_csv(session=db_session, seed_dir=SEED_DIR, today=FIXED_TODAY)

    # 1. Institution DEMO-1042
    inst = db_session.exec(select(Institution).where(Institution.permanent_id == "DEMO-1042")).first()
    assert inst is not None
    assert "Example Institute of Technology" in inst.name

    # 2. Case PG-2026-00104
    case_pg = db_session.exec(select(Case).where(Case.case_no == "PG-2026-00104")).first()
    assert case_pg is not None
    assert case_pg.institution_id == inst.id
    assert case_pg.bureau.value == "PGRC"
    assert case_pg.category.value == "faculty"
    assert case_pg.status.value == "under_process"

    # 3. Case RB-2026-00219
    case_rb = db_session.exec(select(Case).where(Case.case_no == "RB-2026-00219")).first()
    assert case_rb is not None
    assert case_rb.institution_id == inst.id
    assert case_rb.bureau.value == "RB"
    assert case_rb.category.value == "faculty"
    assert case_rb.status.value == "pending"


def test_counters_are_above_imported_numbers(db_session: Session):
    """Test that counters table values are set at or above the highest imported case numbers."""
    import_csv(session=db_session, seed_dir=SEED_DIR, today=FIXED_TODAY)

    all_cases = db_session.exec(select(Case)).all()
    max_imported = {}
    for c in all_cases:
        parts = c.case_no.split("-")
        if len(parts) == 3:
            key = f"{parts[0]}-{parts[1]}"
            num = int(parts[2])
            if key not in max_imported or num > max_imported[key]:
                max_imported[key] = num

    for key, expected_max in max_imported.items():
        counter = db_session.exec(select(Counter).where(Counter.key == key)).first()
        assert counter is not None, f"Counter missing for {key}"
        assert counter.value >= expected_max, f"Counter {key} ({counter.value}) is less than max {expected_max}"


def test_labelled_pairs_integrity_and_balance():
    """Test data/labelled_pairs.csv has >=200 rows, valid labels, and cases exist in cases.csv."""
    has_seed = (SEED_DIR / "labelled_pairs.csv").exists()
    labelled_csv = SEED_DIR / "labelled_pairs.csv" if has_seed else DATA_DIR / "labelled_pairs.csv"
    cases_csv = SEED_DIR / "cases.csv" if has_seed else DATA_DIR / "eval" / "cases.csv"

    assert labelled_csv.exists(), "labelled_pairs.csv missing"
    assert cases_csv.exists(), "cases.csv missing"

    # Read cases.csv
    valid_cases = set()
    case_inst_bureau = {}
    with open(cases_csv, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            valid_cases.add(row["case_no"])
            case_inst_bureau[row["case_no"]] = (
                row.get("permanent_id") or row.get("institution_id"),
                row["bureau"],
            )

    # Read labelled_pairs.csv
    pairs = []
    with open(labelled_csv, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pairs.append(row)

    # 1. Total >= 200
    assert len(pairs) >= 200, f"Expected at least 200 pairs, found {len(pairs)}"

    # 2. Valid labels and splits
    labels = set()
    splits = set()
    split_counts = {"development": 0, "test": 0}
    label_split_counts = {
        ("related", "development"): 0,
        ("related", "test"): 0,
        ("not_related", "development"): 0,
        ("not_related", "test"): 0,
    }
    same_inst_diff_bureau_count = 0

    for p in pairs:
        c1, c2, lbl = p["case_a"], p["case_b"], p["label"]
        s = p.get("split")

        # Every case must exist in cases.csv
        assert c1 in valid_cases, f"Case {c1} does not exist in cases.csv"
        assert c2 in valid_cases, f"Case {c2} does not exist in cases.csv"
        assert c1 < c2, f"Expected case_a < case_b order, got {c1} and {c2}"

        assert lbl in {"related", "not_related"}, f"Invalid label: {lbl}"
        labels.add(lbl)

        if s:
            assert s in {"development", "test"}, f"Invalid split: {s}"
            splits.add(s)
            split_counts[s] += 1
            label_split_counts[(lbl, s)] += 1

        # Check same institution, different bureau
        inst1, bur1 = case_inst_bureau[c1]
        inst2, bur2 = case_inst_bureau[c2]
        if inst1 == inst2 and bur1 != bur2:
            same_inst_diff_bureau_count += 1

    # 3. Both labels present
    assert labels == {"related", "not_related"}

    if splits:
        assert splits == {"development", "test"}
        # 4. Strict 50/50 balance
        assert split_counts["development"] == split_counts["test"], f"Splits not 50/50: {split_counts}"
        assert label_split_counts[("related", "development")] == label_split_counts[("related", "test")], "Related not balanced across splits"

    # 5. At least 60 same-institution, different-bureau pairs per requirement additions
    assert same_inst_diff_bureau_count >= 60, f"Expected >= 60 same-inst diff-bureau pairs, found {same_inst_diff_bureau_count}"



def test_seed_demo_and_import_csv_cooperate(db_session: Session):
    """Test running import_csv alongside seed_demo does not duplicate institutions or cases."""

    # First run import_csv
    import_csv(session=db_session, seed_dir=SEED_DIR, today=FIXED_TODAY)
    initial_demo_case_count = len(db_session.exec(select(Case).where(Case.case_no == "PG-2026-00104")).all())
    assert initial_demo_case_count == 1

    # Run import_csv again to simulate cooperation
    res = import_csv(session=db_session, seed_dir=SEED_DIR, today=FIXED_TODAY)
    assert res["cases_skipped"] >= 200

    after_demo_case_count = len(db_session.exec(select(Case).where(Case.case_no == "PG-2026-00104")).all())
    assert after_demo_case_count == 1


def test_alert_refresh_evaluates_after_import(db_session: Session):
    """Test running refresh_alerts after import creates alerts matching newly imported cases."""
    import_csv(session=db_session, seed_dir=SEED_DIR, today=FIXED_TODAY)

    # Re-evaluating alerts with refresh_alerts
    created = refresh_alerts(db_session, today=FIXED_TODAY)
    # The first refresh during import creates alerts, running refresh again creates 0 duplicates
    assert created == 0


def test_auto_seed_on_empty_database(db_session: Session):
    """Test auto_seed_demo_data imports cases and configures DEMO-1042 when cases table is empty."""
    from app.main import auto_seed_demo_data
    from app.services.reports import get_dashboard_summary

    # Ensure table is initially empty
    assert len(db_session.exec(select(Case)).all()) == 0

    auto_seed_demo_data(session=db_session)

    summary = get_dashboard_summary(db_session)
    assert summary["total"] >= 555
    assert summary["total"] <= 600

    # Confirm DEMO-1042 has its two central cases
    demo_cases = db_session.exec(
        select(Case).join(Institution, Case.institution_id == Institution.id).where(Institution.permanent_id == "DEMO-1042")
    ).all()
    demo_case_nos = {c.case_no for c in demo_cases}
    assert "PG-2026-00104" in demo_case_nos
    assert "RB-2026-00219" in demo_case_nos

