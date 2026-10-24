#!/usr/bin/env python3
"""DEPRECATED - this generator produced circular labels.

It derived `related` / `not_related` from the same category/status rules that
`backend/app/services/overlap.py` uses, so the labels could be predicted from
metadata alone and the descriptions were never tested.

Use the issue-based generator instead:

    python scripts/generate_issue_dataset.py

Ground truth now comes only from hidden `issue_id` values in
`data/eval/hidden_issues.csv`.
"""

import sys

if __name__ == "__main__":
    print(__doc__.strip())
    sys.exit(1)
