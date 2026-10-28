# Overlap Detection — Evaluation (Phase 12 Tuned Engine)

This document records the evaluation of the tuned CaseBridge overlap engine against independent, non-circular issue-based ground truth.

---

## 1. Ground Truth & Protocol

### 1.1 Ground Truth Construction
Built by `scripts/generate_issue_dataset.py` (seed `20261024`):
1. **Hidden `issue_id` values**: A single complaint scenario is shared only in `data/eval/hidden_issues.csv` (never in `cases` table or API).
2. **Cross-Bureau Cases**: Each multi-case issue is split across 2–3 different Bureaus with paraphrased descriptions.
3. **Hard Positives & Negatives**:
   - Same category, different issue $\rightarrow$ `not_related` (hard negative).
   - Different category, same issue $\rightarrow$ `related` (hard positive).
   - Deliberate low-overlap paraphrases with near-zero shared phrasing.
4. **Label assignment**: `related` $\iff$ both cases share `issue_id`. Category, bureau, and similarity are never used to assign labels.

### 1.2 Evaluation & Tuning Protocol (Honest Methodology & Disclosures)
- **Institution-Level Split**: 45 institutions are partitioned into 23 Development (504 pairs) and 22 Test (482 pairs) using fixed `seed=42`. Saved to `data/eval/institution_split.json`.
- **Exploratory Sweeps & Test Split Disclosure**: Exploratory threshold sweeps over all 986 pairs (including the test institutions) were run before the split was established. Therefore, the test split is **NOT strictly held out** in an untouched, pre-registered sense.
- **Confirmatory Result via Fresh-Seed Run (20261025)**: Because exploratory sweeps touched the full 986-pair dataset, the fresh-seed dataset (`data/eval_fresh/`, seed `20261025`) generated *after* thresholds were frozen serves as the true confirmatory result. Caveat: it uses the same generator logic and templated phrasing as the original set.
- **Deviation from Plan (Similarity Metric)**: Rapidfuzz token-set similarity was dropped from text similarity scoring. Text similarity uses TF-IDF cosine similarity exclusively. Rapidfuzz is retained only for reference code substring matching in `check_shared_reference`.
- **Recall Limitation & Missed Paraphrases**: 64 of 180 related pairs (35.6%) are missed (scoring Low) because they are zero-similarity or near-zero paraphrases beyond surface lexical overlap. Development recall of **0.533** only just meets the $\ge 0.50$ operational constraint.
- **Unsupervised TF-IDF Representation**: Vectorizer is fit once across all corpus descriptions with fixed settings: `TfidfVectorizer(ngram_range=(1, 2), stop_words="english", min_df=1)`. Fitting unsupervised TF-IDF across all descriptions is valid because it uses no ground-truth labels. The cache is automatically invalidated if the corpus changes.
- **Frozen Thresholds**:
  - $T_{high} = 0.16$ (with same/related category, or shared reference)
  - $T_{med} = 0.14$ (text similarity alone)
  - Category alone $\rightarrow$ Low.

---

## 2. Results — Tuned Engine vs Baseline

Positive prediction = Confidence band **Medium or High** (sim $\ge 0.14$).

### 2.1 Confusion Matrix & Performance Metrics (Exact Counts)

| Dataset / Split | Precision | Recall | F1 | TP | FP | FN | TN | Total Pairs |
|---|---|---|---|---|---|---|---|---|
| **Development Split (23 insts)** | **0.860** | **0.533** | **0.658** | **49** | **8** | **43** | **404** | 504 |
| **Test Split (22 insts)** | **0.893** | **0.761** | **0.822** | **67** | **8** | **21** | **386** | 482 |
| **All Scored Pairs (45 insts)** | **0.879** | **0.644** | **0.744** | **116** | **16** | **64** | **790** | 986 |
| *Previous Engine (All Pairs)* | *0.276* | *0.928* | *0.425* | *167* | *439* | *13* | *367* | 986 |
| *Baseline (flag all cross-bureau)* | *0.183* | *1.000* | *0.309* | *180* | *806* | *0* | *0* | 986 |

**Key Improvements:**
- False positives slashed from **439 down to 16** (a **96.4% reduction** in coordinator false alarm burden).
- Precision boosted from **0.276 to 0.879** overall (**+0.603** gain).
- Test set precision reached **0.893** with F1 **0.822**.

---

## 3. Band Distribution & Related Pairs per Band

### 3.1 All Scored Pairs (986 pairs)
| Band | Total Pairs in Band | Related Pairs (TP / FN) | Unrelated Pairs (FP / TN) | Precision in Band |
|---|---|---|---|---|
| **High** | 77 | 69 (TP) | 8 (FP) | **89.6%** |
| **Medium** | 55 | 47 (TP) | 8 (FP) | **85.5%** |
| **Low** | 805 | 64 (FN) | 741 (TN) | — |
| **Non-candidate** | 49 | 0 | 49 | — |

### 3.2 Development Split (504 pairs)
- **High**: 33 pairs (TP=30, FP=3) — 90.9% precision
- **Medium**: 24 pairs (TP=19, FP=5) — 79.2% precision
- **Low**: 414 pairs (FN=43, TN=371)
- **Non-candidate**: 33 pairs
- **Related pairs by band**: High=30, Medium=19, Low/missed=43

### 3.3 Test Split (482 pairs)
- **High**: 44 pairs (TP=39, FP=5) — 88.6% precision
- **Medium**: 31 pairs (TP=28, FP=3) — 90.3% precision
- **Low**: 391 pairs (FN=21, TN=370)
- **Non-candidate**: 16 pairs
- **Related pairs by band**: High=39, Medium=28, Low/missed=21

---

## 4. Error Analysis

### 4.1 False Positives: 16 (Down from 439)
- **Same category, different issue**: **8** (reduced from 250 previously, because category alone now scores Low; only pairs with genuine text similarity $\ge 0.14$ are flagged).
- **Different category, text similarity**: **8** (unrelated complaints that coincidentally share vocabulary framing).

### 4.2 False Negatives: 64 Missed Pairs (35.6% of Ground-Truth Related Pairs)
- **Excluded by candidate filters**: **0** (no valid overlaps were filtered out by candidate rules).
- **Scored Low**: **64 of 180 related pairs are missed** due to zero-similarity paraphrases where cases share an underlying issue but have near-zero vocabulary overlap.
- **Constraint Margin**: Development set recall is **0.533**, which only just meets the $\ge 0.50$ minimum operational recall constraint.

---

## 5. Confirmatory Result — Fresh-Seed Stability Check (`data/eval_fresh/`)

A fresh confirmatory dataset was generated with seed `20261025` into `data/eval_fresh/` after thresholds were frozen to serve as the confirmatory evaluation, given that exploratory sweeps had previously touched all 986 pairs of the primary set.

> [!NOTE]
> **Methodology Caveat on Confirmatory Run**: While the fresh-seed (20261025) dataset confirms threshold stability across independently generated cases, it uses the same generator logic and templated wording as the primary set. It demonstrates parameter stability under the generator's distribution, not robustness against completely novel external natural language distributions.

### Fresh-Seed Results (1000 pairs, seed 20261025)
- **Development Split**: Precision = **0.911**, Recall = **0.783**, F1 = **0.842** (TP=72, FP=7, FN=20, TN=414)
- **Test Split (held-out)**: Precision = **0.929**, Recall = **0.739**, F1 = **0.823** (TP=65, FP=5, FN=23, TN=394)
- **All Pairs**: Precision = **0.919**, Recall = **0.761**, F1 = **0.833** (TP=137, FP=12, FN=43, TN=808)
- **Band Breakdown**: High TP=84, FP=6; Medium TP=53, FP=6; Low FN=43, TN=736.

The consistent precision (~88%–92%) across different random generations demonstrates that the chosen thresholds ($T_{high}=0.16, T_{med}=0.14$) are robust and stable.

---

## 6. Seed Dataset & Consistency Verification (555-Case Demo Seed)

The primary seeded demonstration dataset (`data/seed/cases.csv`, 25 institutions) contains **555 cases** and **2820 case events**, verified via `python scripts/metrics.py`:
1. **Central Demo Pair**: `PG-2026-00104 / RB-2026-00219` is flagged in band **HIGH** with explainable reasons:
   `['same_permanent_id', 'same_category', 'text_similarity 0.23', 'date_proximity 14 days']`.
2. **Deterministic Seed Distribution**: 555 cases across RB (154), PGRC (145), RO (133), and OC (123) with balanced statuses (166 under_process, 166 disposed, 111 pending, 56 transferred, 56 escalated).
3. **Idempotence**: Running rescans across the dataset produces **0 duplicate links** and preserves all existing review statuses.


---

## 7. How to Reproduce

From the repository root:

```bash
# 1. Print verification metrics and consistency report
python scripts/metrics.py

# 2. Run evaluation on primary evaluation corpus
python scripts/evaluate_overlap.py

# 3. Run fresh-seed stability check
python scripts/generate_issue_dataset.py --output-dir data/eval_fresh --db-path backend/casebridge_eval_fresh.db --labelled-path data/eval_fresh/labelled_pairs.csv --seed 20261025
python scripts/evaluate_overlap.py --db backend/casebridge_eval_fresh.db --labelled data/eval_fresh/labelled_pairs.csv --fresh-check

# 4. Seed demo database with scan execution
python scripts/import_csv.py
```

