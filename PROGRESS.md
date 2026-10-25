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
