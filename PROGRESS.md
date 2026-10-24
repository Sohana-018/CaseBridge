# CaseBridge: Project Progress Tracker

Track of verified delivery by phase for CaseBridge (SIH26264).

---

## Phase 0: Project Scaffolding & Initial Verification

**Status: COMPLETED**  
**Date:** 2026-10-24

### Completed & Verified Items

- [x] **Repository layout created according to PRD Section 6:**
  - `backend/` (with `app/`, `routers/`, `services/`, `tests/`)
  - `frontend/` (with `src/`, `api/`, `components/`, `pages/`, `styles/`, `mock/`)
  - `data/` (with `seed/`, `README.md` noting synthetic demo data)
  - `docs/` (retained `00_CENTRAL_PRD.md`)
  - `scripts/` (scaffolded directory for evaluation and data generation)
- [x] **Backend Implementation:**
  - FastAPI application in `backend/app/main.py`.
  - GET `/api/v1/health` returning `{"status": "ok"}`.
  - CORS origins parsed dynamically from `backend/.env`.
  - Templates `backend/.env.example` and `backend/.env` created.
  - Dependencies pinned in `backend/requirements.txt`.
  - Automated test in `backend/tests/test_health.py` passing via `pytest`.
  - Live endpoint verified via `curl` returning `{"status":"ok"}` on `http://127.0.0.1:8000/api/v1/health`.
- [x] **Frontend Implementation:**
  - React 19 + Vite + TypeScript + Tailwind CSS configured in `frontend/`.
  - One page (`HomePage.tsx`) calling `/api/v1/health` using `VITE_API_URL` from `frontend/.env`.
  - Displays `"API status: ok"` with dynamic status indicator and live refresh.
  - Added `frontend/.env.example` and `frontend/.env`.
  - Footer displays required notice: `"Synthetic demo data"`.
  - Production build verified (`tsc -b && vite build` passing cleanly).
- [x] **Configuration & Documentation:**
  - Root `.gitignore` configured to exclude `.env`, `node_modules`, `__pycache__`, `*.db`, `.venv`.
  - `README.md` detailing architecture, prerequisites, environment variables, and execution steps.
  - Zero hard-coded URLs across backend and frontend code.
  - Git repository intact without any unrequested commits or pushes.

### Verification Evidence

1. **Pytest Run:**
   ```
   tests\test_health.py . [100%]
   1 passed in 0.50s
   ```
2. **Backend Health Check Curl:**
   ```
   curl http://127.0.0.1:8000/api/v1/health
   -> {"status":"ok"}
   ```
3. **Frontend Build:**
   ```
   tsc -b && vite build
   -> built in 579ms (0 errors)
   ```

---

## Upcoming Phases (Per PRD Section 18)

- **Phase 1:** Core Assumptions & Schema Validation
- **Phase 2:** Database Engine & SQLModel Tables (`db.py`, `models.py`)
- **Phase 3:** Synthetic Data Generation (`scripts/generate_data.py`, seed CSVs)
- **Phase 4:** Core CRUD Endpoints (`/institutions`, `/cases`)
- **Phase 5:** Event History & Timeline (`/cases/{case_no}/events`)
- **Phase 6:** Overlap Detection Engine (Stage 1 & Stage 2 matching rules)
- **Phase 7:** Overlap Review Queue & Alert Engine
- **Phase 8:** Dashboard KPIs & Bureau Workload Endpoints
- **Phase 9:** Reports, Mock Roles, and Quality Checks
- **Phase 10:** Integration, Rehearsal & Verification
