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

## Not yet verified
- Phase 11 & 12: overlap detection engine and /overlaps endpoints (in progress)
- Integration with the frontend
- Deployment

