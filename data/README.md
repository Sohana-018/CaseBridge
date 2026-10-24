# CaseBridge Data Directory

All data contained in this directory and used throughout CaseBridge is **synthetic demo data**.
No real institution or complainant data is stored or processed.

## Contents

| Path | Purpose |
|---|---|
| `seed/` | Demo seed CSVs (5 institutions, 24 cases) exported from the demo DB |
| `labelled_pairs.csv` | Overlap evaluation labels — generated from hidden `issue_id`, not from engine rules |
| `eval/institutions.csv` | 45-institution evaluation corpus |
| `eval/cases.csv` | 360 evaluation cases with paraphrased descriptions |
| `eval/hidden_issues.csv` | **Ground truth:** `case_no` → `issue_id` / topic. Never loaded into the DB or API. |

## Rebuilding the evaluation data

```bash
python scripts/generate_issue_dataset.py   # writes eval/ + labelled_pairs.csv + casebridge_eval.db
python scripts/evaluate_overlap.py         # reports counts
```

Labels are `related` only when two cases share the same hidden `issue_id`.
Category, status, Bureau and text similarity are never used to assign a label.
See `docs/eval.md` for construction details and results.

`scripts/generate_labelled_pairs.py` is deprecated: it derived labels from the
same metadata rules as the engine, which made the old evaluation circular.
