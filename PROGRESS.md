# Progress

## Verified
- Phase 0: repo, backend and frontend run (screenshots)
- Database and models: pytest passes
- Phase 6: case events endpoints, append-only history (pytest, /docs check)
- Phase 14: alerts (pytest, /docs check)
- Phase 15: dashboard summary and reports (pytest; totals checked on seed data)
- Phase 16: mock login and roles (pytest: 42 passed)
- Phase 4 (Shreeshanth): seed_demo.py run — 5 institutions, 24 cases seeded; data/seed/institutions.csv, cases.csv, events.csv exported; data/labelled_pairs.csv generated (280 pairs: 11 related, 269 not_related)
- Phase 5 (Rohitha): POST /cases (auto case_no from counters), PATCH /cases/{case_no} (next_action, expected_disposal_date, assigned_officer, priority); 69 pytest passed

## Verified — Phase 11 (overlap detection engine)
- `backend/app/services/overlap.py`: candidate filter (same institution, both
  open, different Bureau, received within 365 days), explainable reasons
  (`same_permanent_id`, `same_category` / `related_category`,
  `shared_reference`, `text_similarity`, `date_proximity`), band rules from
  PRD Section 9.4, and no auto-merge/auto-close.
- `POST /api/v1/overlaps/scan` replays detection; existing pairs (including
  reviewed ones) are never overwritten.
- Scan on the seeded DB: **29 pairs — 1 high, 10 medium, 18 low**; 11 overlap
  alerts created for Medium/High only. Demo pair `PG-2026-00104` /
  `RB-2026-00219` is High with reasons
  `same_permanent_id`, `same_category`, `text_similarity 0.63`,
  `date_proximity 14 days`.
- `GET /api/v1/overlaps`, `GET /api/v1/overlaps/{id}` and
  `POST /api/v1/overlaps/{id}/review` implemented. Review decisions
  (related / duplicate / not_related / needs_review) append a `review` event to
  **both** cases and never merge or close them.
- Institution profile (`GET /institutions/{permanent_id}`) now returns its open
  overlaps instead of an empty list.
- Overlap tests: `tests/test_overlaps.py` (11 tests) — bands/reasons, idempotent
  scan, hard-case exclusions (disposed, same Bureau, other institution), alerts,
  review events on both cases, role permissions, profile wiring.
- Full backend suite: **80 passed**.

## Verified — Phase 12 (similarity + evaluation, rebuilt ground truth)
- The previous labelled pairs were **circular**: `label_pair()` applied the same
  category/status rules as the engine and ignored descriptions. They have been
  replaced.
- `scripts/generate_issue_dataset.py` now builds the corpus from hidden
  `issue_id` values: **45 institutions, 360 cases, 225 hidden issues (90
  multi-case), 40 low-overlap paraphrases**. `data/eval/hidden_issues.csv` is
  the only place `issue_id` appears; labels use nothing else.
- `data/labelled_pairs.csv` (986 pairs, all same-institution/cross-Bureau):
  **180 related, 806 not_related**. Hard cases: **63** same-issue/different-
  category positives and **267** same-category/different-issue negatives.
- Evaluation uses the engine unchanged (no tuning) on a stratified 493/493
  dev/test split:
  - all pairs: **P=0.276, R=0.928, F1=0.425** (TP=167, FP=439, FN=13, TN=367)
  - held-out test: **P=0.273, R=0.944, F1=0.424** (TP=85, FP=226, FN=5, TN=177)
  - baseline: P=0.183, R=1.000, F1=0.309 (TP=180, FP=806)
  - precision gain over baseline **+0.093**, recall cost **−0.072**
- Error counts: 250/439 false positives are same-category/different-issue
  (the old circular signal); 189/439 are text-only; all 13 misses are
  low-overlap paraphrases scored Low (none filtered by candidate rules).
- `docs/eval.md` records construction, counts, results and limitations.
- Engine (`services/overlap.py`) intentionally unchanged for this measurement.

## Not yet verified
- Integration with the frontend
- Deployment
