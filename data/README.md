# CaseBridge Operational Data Directory

Case records, institution directories, and case history profiles utilized for CaseBridge grievance monitoring and overlap engine evaluation.

---

## Directory Overview

- **`seed/`**:
  - `institutions.csv`: Profiles for 25 technical institutions across 5 geographical regions (North, South, East, West, Central).
  - `cases.csv`: 555 operational complaint and monitoring cases across AICTE Bureaus and Cells (`RB`, `PGRC`, `RO`, `OC`), verified via `python scripts/metrics.py`.
  - `events.csv`: Case event logs representing chronological lifecycle history (2820 events).
- **`planted_truth.md`**:
  - Human-audited ground truth table documenting the planted overlap scenarios:
    - **30 True Overlaps (`related`)**: Cross-bureau complaints concerning the same institution and identical issue, worded using distinct paraphrase variants (some sharing explicit file/letter reference codes).
    - **30 Near-Misses (`not_related`)**: Cross-bureau complaints concerning the same institution but entirely distinct operational domains.
    - **10 Trap Pairs (`not_related`)**: Textually near-identical boilerplate complaints originating from completely distinct institutions.
    - Disposed and historical cases (>365 days old).
- **`eval/`**:
  - `institutions.csv`: 45-institution evaluation corpus.
  - `cases.csv`: 360 evaluation cases with paraphrased descriptions.
  - `hidden_issues.csv`: **Ground truth:** `case_no` → `issue_id` / topic. Never loaded into the DB or API.
- **`labelled_pairs.csv`**:
  - Overlap evaluation labels (986 pairs, all same-institution/cross-Bureau) generated from hidden `issue_id` for Phase 12 non-circular benchmark.
  - Labels are `related` only when two cases share the same hidden `issue_id`. Category, status, Bureau and text similarity are never used to assign a label.

---

## Verification & Dataset Consistency

Run the repository consistency reporter:
```bash
python scripts/metrics.py
```

### Rebuilding Datasets

#### 1. Seed & Planted Demo Dataset
```bash
python scripts/generate_data.py
```

#### 2. Evaluation Ground Truth Corpus (Phase 12)
```bash
python scripts/generate_issue_dataset.py   # writes eval/ + labelled_pairs.csv + casebridge_eval.db
python scripts/evaluate_overlap.py         # reports precision, recall, and F1 benchmarks
```
See `docs/eval.md` for construction details and benchmark results.
