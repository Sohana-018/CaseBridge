# Progress

## Verified
- Phase 0: repo, backend and frontend run (screenshots)
- Database and models: pytest passes
- Phase 6: case events endpoints, append-only history (pytest, /docs check)
- Phase 14: alerts (pytest, /docs check)
- Phase 15: dashboard summary and reports (pytest; totals checked on seed data)
- Phase 16: mock login and roles (pytest: 42 passed)
- Phase 4: seed_demo.py run — 5 institutions, 24 cases seeded; data/seed/institutions.csv, cases.csv, events.csv exported; data/labelled_pairs.csv generated (280 pairs: 11 related, 269 not_related)
- Phase 5: POST /cases (auto case_no from counters), PATCH /cases/{case_no} (next_action, expected_disposal_date, assigned_officer, priority); 69 pytest passed
- Phase 7 (Frontend Core Pages & Integration):
  - In-memory auto-login on app start (`POST /api/v1/auth/mock-login` with `{"role": "coordinator"}`), sending `Authorization: Bearer <token>` on every request.
  - Overview page: 7 dynamic KPI cards from `GET /api/v1/dashboard/summary` (total, pending, under process, disposed, transferred, escalated, overdue), Recharts Bureau workload chart from `GET /api/v1/dashboard/workload`, and 5 most recent open alerts from `GET /api/v1/alerts`.
  - Institutions directory: Search box calling `GET /api/v1/institutions`, linking to `/institutions/:permanent_id`.
  - Institution detail page: Profile from `GET /api/v1/institutions/{permanent_id}` and consolidated case list with status chips linking to case details.
  - Case detail page (`/cases/:case_no`): Case metadata from `GET /api/v1/cases/{case_no}` plus chronological event timeline from `GET /api/v1/cases/{case_no}/events` (oldest first, with who, when, event type, and remarks).
  - Cohesive government dashboard visual design (deep navy/blue primary, unified status chip and KPI palette, white cards with subtle borders, zebra/hover table rows).
  - Loading, empty, and error states across all pages; Navbar links to Overview and Institutions with active highlights; Footer displaying "Synthetic demo data".
  - Frontend production build (`npm run build`) and lint (`npm run lint`) pass with 0 errors.

## Not yet verified
- Phase 11 & 12: overlap detection engine and /overlaps endpoints (in progress)
- Deployment
