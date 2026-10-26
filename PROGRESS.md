# Progress

## Verified
- Phase 0: repo, backend and frontend run (screenshots)
- Database and models: pytest passes
- Phase 6: case events endpoints, append-only history (pytest, /docs check)
- Phase 14: alerts (pytest, /docs check)
- Phase 15: dashboard summary and reports (pytest; totals checked on seed data)
- Phase 16: mock login and roles (pytest: 42 passed)
- Phase 4 : seed_demo.py run — 5 institutions, 24 cases seeded; data/seed/institutions.csv, cases.csv, events.csv exported; data/labelled_pairs.csv generated (280 pairs: 11 related, 269 not_related)
- Phase 5 : POST /cases (auto case_no from counters), PATCH /cases/{case_no} (next_action, expected_disposal_date, assigned_officer, priority); 69 pytest passed
- Phase 7 (Frontend Core Pages & Integration):
  - In-memory auto-login on app start (`POST /api/v1/auth/mock-login` with `{"role": "coordinator"}`), sending `Authorization: Bearer <token>` on every request.
  - Overview page: 7 dynamic KPI cards from `GET /api/v1/dashboard/summary` (total, pending, under process, disposed, transferred, escalated, overdue), Recharts Bureau workload chart from `GET /api/v1/dashboard/workload`, and 5 most recent open alerts from `GET /api/v1/alerts`.
  - Institutions directory: Search box calling `GET /api/v1/institutions`, linking to `/institutions/:permanent_id`.
  - Institution detail page: Profile from `GET /api/v1/institutions/{permanent_id}` and consolidated case list with status chips linking to case details.
  - Case detail page (`/cases/:case_no`): Case metadata from `GET /api/v1/cases/{case_no}` plus chronological event timeline from `GET /api/v1/cases/{case_no}/events` (oldest first, with who, when, event type, and remarks).
  - Cohesive government dashboard visual design (deep navy/blue primary, unified status chip and KPI palette, white cards with subtle borders, zebra/hover table rows).
  - Loading, empty, and error states across all pages; Navbar links to Overview and Institutions with active highlights; Footer displaying "Synthetic demo data".
  - Frontend production build (`npm run build`) and lint (`npm run lint`) pass with 0 errors.

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
- Tuned Overlap Engine (`backend/app/services/overlap.py`):
  - Category alone -> Low; Medium requires a text similarity signal.
  - TF-IDF vectorizer fit once on all descriptions, cached and invalidated on corpus changes.
  - Deviation from original plan: RapidFuzz token-set similarity was dropped (text similarity uses TF-IDF cosine only; RapidFuzz retained solely for reference code matching in `check_shared_reference`).
  - Bands: High (shared reference OR sim >= 0.16 + same/related category), Medium (sim >= 0.14), Low (same institution + different Bureau).
  - Fixed vectorizer: `ngram_range=(1, 2), stop_words="english", min_df=1`.
- Methodology Disclosures & Measured results:
  - Exploratory threshold sweeps over all 986 pairs (including test split) were run before the split was established; therefore, the test split is **NOT strictly held out**.
  - Development (504 pairs): **P=0.860, R=0.533, F1=0.658** (TP=49, FP=8, FN=43, TN=404). Dev recall of 0.533 only just satisfies the $\ge 0.50$ operational constraint.
  - Test split (482 pairs): **P=0.893, R=0.761, F1=0.822** (TP=67, FP=8, FN=21, TN=386).
  - All pairs (986 pairs): **P=0.879, R=0.644, F1=0.744** (TP=116, FP=16, FN=64, TN=790).
  - Missed pairs: **64 of 180 related pairs** (35.6%) are missed (scored Low) as zero-similarity paraphrases where cases share an underlying issue with no lexical overlap.
  - False positives slashed from **439 down to 16** (a 96.4% reduction).
  - Baseline: P=0.183, R=1.000, F1=0.309 (TP=180, FP=806).
- Confirmatory Result via Fresh-Seed Check (`data/eval_fresh/`, seed `20261025`):
  - Generated *after* thresholds were frozen; serves as the true confirmatory run, with the caveat that it uses the same generator logic and templates as the primary corpus.
  - Dev: P=0.911, R=0.783, F1=0.842 (TP=72, FP=7, FN=20, TN=414)
  - Test: P=0.929, R=0.739, F1=0.823 (TP=65, FP=5, FN=23, TN=394)
  - All: P=0.919, R=0.761, F1=0.833 (TP=137, FP=12, FN=43, TN=808)
  - Confirms threshold stability across random generation seeds without modifying `data/eval/`.
- 200-Case Demo Seed verification:
  - Central demo pair `PG-2026-00104 / RB-2026-00219` flagged as **HIGH** with explainable reasons.
  - Medium count drops from 210 down to **56** (well below 210).
  - Rescan generates **0 duplicate links**.
  - Planted true pairs found at Medium or above; near-misses score Low.
- `docs/eval.md` updated with full protocol, exact counts, and disclosure.
- Ground truth file `data/planted_truth.md` preserved without modification.

## Verified — Phase 13 & 15 (Frontend Overlap Queue & Reports UI)
- PR #12 merged:
  - `/overlaps` review queue UI with side-by-side comparison, explainable reason chips, and human review actions (duplicate / related / not_related / needs_review).
  - `/reports` dashboard with Bureau, status, region, ageing, disposal rate, and overlap outcomes with Recharts charts and data breakdown.
  - `/cases` directory with search and combinable filters.

## Verified — Phase 16 (Real Auth & Admin Console)
- **Database & Security**:
  - `User` table migrated with `username`, `hashed_password` (bcrypt), `email`, `is_active`, and `created_at`.
  - Default system accounts initialized:
    - `admin` (`admin123`) — System Administrator
    - `coordinator` (`coord123`) — Central Grievance Coordinator
    - `officer_rb` (`officer123`) — Regulation Bureau Officer
    - `officer_pgrc` (`officer123`) — PGRC Bureau Officer
    - `management` (`mgmt123`) — Senior Management
- **Backend Endpoints (`/api/v1/auth` & `/api/v1/admin`)**:
  - `POST /api/v1/auth/login` (real bcrypt credential verification returning signed JWT token).
  - `GET /api/v1/auth/demo-accounts` (quick-access persona profiles for fast demo/evaluation).
  - `GET /api/v1/admin/users` & `POST /api/v1/admin/users` (user directory and role management).
  - `PATCH /api/v1/admin/users/{id}/status` (activate / deactivate user accounts).
  - `POST /api/v1/admin/users/{id}/reset-password` (administrative password reset).
  - `GET /api/v1/admin/config` & `PUT /api/v1/admin/config` (live system config editor: SLA warn days, breach horizon, etc.).
  - `GET /api/v1/admin/audit-logs` (chronological audit log of sensitive events).
  - `GET /api/v1/admin/health-summary` (data quality checks: unassigned cases, missing disposal dates, overdue cases).
  - `POST /api/v1/admin/scan-overlaps` (admin overlap detection engine trigger).
  - Protected with role-based permission checks (`administrator` required for admin endpoints).
- **Frontend Pages & Features**:
  - `LoginPage.tsx` (`/login`): Clean government-style login portal with username/password inputs and 1-click Quick Demo login pills for all 5 roles.
  - `AdminPage.tsx` (`/admin`): 4-tab governance console (Health & Governance, User Management, System Configuration, and Audit Trail).
  - `Navbar.tsx`: Displays logged-in user name, role badge, Admin nav link (only for administrators), and Logout / Switch User controls.
- **Verification**:
  - Full backend test suite: **102 passed** (`pytest`).
  - Frontend production build (`npm run build`): **0 errors**.

## Not yet verified / Upcoming
- Final deployment configuration (Phase 18)
- Demo video recording & rehearse (Phase 18)
