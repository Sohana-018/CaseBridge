# CaseBridge Synthetic Data Directory

> [!IMPORTANT]
> **Synthetic Demo Data Notice**: All data contained in this directory and used throughout the CaseBridge application is **100% synthetic**. There are **no real people, institutions, complaints, regulatory findings, or official records** represented in any dataset.

---

## Directory Overview

- **`seed/`**:
  - `institutions.csv`: Synthetic profiles for 25 technical institutions across 5 geographical regions (North, South, East, West, Central). All institution names carry the `(demo)` suffix, and Permanent IDs follow the format `DEMO-XXXX`.
  - `cases.csv`: 200 synthetic complaint and monitoring cases across AICTE Bureaus and Cells (`RB`, `PGRC`, `RO`, `OC`). Every case record carries a synthetic officer name ending in `(demo)`, realistic case numbering (`PREFIX-YYYY-NNNNN`), and consistent lifecycle dates.
- **`planted_truth.md`**:
  - Human-audited ground truth table documenting the planted overlap scenarios:
    - **30 True Overlaps (`related`)**: Cross-bureau complaints concerning the same institution and identical issue, worded using distinct paraphrase variants (some sharing explicit file/letter reference codes).
    - **30 Near-Misses (`not_related`)**: Cross-bureau complaints concerning the same institution but entirely distinct operational domains.
    - **10 Trap Pairs (`not_related`)**: Textually near-identical boilerplate complaints originating from completely distinct institutions.
    - Disposed and historical cases (>365 days old).
- **`labelled_pairs.csv`**:
  - Evaluation ground truth containing 210 pair evaluations with strict 50/50 balanced `development` and `test` splits.
  - Labels (`related` or `not_related`) are derived exclusively from the planted ground truth, never from heuristic similarity scores.
