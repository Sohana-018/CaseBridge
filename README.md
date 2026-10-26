# CaseBridge (SIH26264)

> **Integrated Dashboard for Monitoring and Tracking Institution-Related Complaint Cases Across AICTE Bureaus/Cells**

CaseBridge provides internal monitoring and coordination for authorised AICTE officials. It offers a single-window view of all institution complaint cases, tracks ownership and history, and flags cross-Bureau overlaps with explainable reasoning.

---

## Repository Structure

```
casebridge/
  backend/
    app/
      main.py            # FastAPI app, CORS, router includes
      routers/           # API endpoints (institutions, cases, overlaps, etc.)
      services/          # Core matching, alerts, reports
    tests/               # Backend tests (pytest)
    .env                 # Backend runtime environment configuration
    .env.example         # Example environment template
    requirements.txt     # Python dependencies
  data/
    seed/                # Baseline seed CSVs
    README.md            # Data directory documentation
  scripts/               # Maintenance and evaluation scripts
  frontend/
    src/
      api/               # API client
      components/        # Shared UI components
      pages/             # Page views
      styles/            # Global styles and Tailwind configuration
    .env                 # Frontend runtime environment configuration
    .env.example         # Example environment template
  docs/
    00_CENTRAL_PRD.md    # Master product requirements document
  PROGRESS.md            # Verified phase-by-phase delivery status
  README.md              # Project documentation and run guide
```

---

## Prerequisites

- **Python**: 3.11+ (Python 3.13 supported)
- **Node.js**: v18+ (Node v24 supported)
- **npm**: v9+

---

## Quick Start: Running Both Apps

### 1. Backend Setup & Run

Open a terminal in the root directory:

```bash
# Navigate to backend directory
cd backend

# Create virtual environment (if not already created)
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# Windows (Command Prompt):
.\.venv\Scripts\activate.bat
# Linux / macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env from template (if needed)
# copy .env.example .env

# Run FastAPI development server (using python run.py or uvicorn with --reload-dir app to avoid watching .venv)
python run.py

# Or directly with uvicorn:
# uvicorn app.main:app --reload --reload-dir app --port 8000
```

The backend API will be available at:
- **API Base:** `http://localhost:8000`
- **Health Check:** `http://localhost:8000/api/v1/health`
- **Interactive Swagger Docs:** `http://localhost:8000/docs`

To run backend tests:
```bash
pytest
```

---

### 2. Frontend Setup & Run

Open a second terminal in the root directory:

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies (if not already installed)
npm install

# Create .env from template (if needed)
# copy .env.example .env

# Start Vite development server
npm run dev
```

The frontend will start at:
- **Web App:** `http://localhost:5173`

---

## Environment Configuration

No hard-coded URLs are used in this project:

- **Backend (`backend/.env`):**
  - `CORS_ORIGINS`: Comma-separated list of allowed frontend origins (default: `http://localhost:5173,http://127.0.0.1:5173`).
- **Frontend (`frontend/.env`):**
  - `VITE_API_URL`: URL to backend API without trailing slash (default: `http://localhost:8000`).
