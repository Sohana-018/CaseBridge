# CaseBridge (SIH26264)

> **Integrated Internal Coordination & Case Tracking Prototype Across AICTE Bureaus and Cells**

CaseBridge is an internal monitoring and coordination dashboard prototype designed to give authorized administrative officials a consolidated, single-window view of institution-related complaint cases across separate operational bureaus. It tracks case ownership, enforces an append-only audit trail, and provides explainable, human-reviewed overlap alerts when multiple bureaus receive complaints concerning the same technical institution.

> [!IMPORTANT]
> **Synthetic Data & Prototype Notice:**  
> All data used throughout CaseBridge is **100% synthetic demo data**. There are **no real people, institutions, complaints, regulatory findings, or official records** represented in any dataset. CaseBridge is an independent demonstration prototype and has **no integration with real AICTE production systems or live databases**.
---

## 1. The Problem

AICTE receives grievance complaints and regulatory inquiries through multiple administrative channels. Different Bureaus and Cells—such as the Regulation Bureau (RB), the Public Grievance Redressal Cell (PGRC), Regional Offices (RO), and Other Cells (OC)—handle their workflows independently:

- **Siloed Inquiries**: Without a cross-bureau case registry, different teams can simultaneously investigate the same institution or underlying grievance without knowing parallel inquiries exist.
- **Duplicated Administrative Effort**: Multiple officers may independently demand records, conduct visits, or draft communications for the same underlying issue.
- **Delayed Case Resolution**: Fragmented awareness hinders timely escalation, cross-bureau transfers, and joint disposal of related matters.
- **Lack of Institutional History**: Cross-bureau complaint records for a single institution cannot be viewed in one chronological timeline.

CaseBridge addresses this with an integrated model: **One Institution $\rightarrow$ One Consolidated Case View $\rightarrow$ Clear Ownership & Append-Only History $\rightarrow$ Explainable Overlap Alerts $\rightarrow$ Coordinated Human Review**.

---

## 2. What CaseBridge Does

Only features that are fully implemented and verified in automated checks (`pytest`, `npm run build`, `npm run lint`) are listed below:

- **Single-Window Institutional Profiles**:
  - Technical institutions are identified and indexed by authoritative Permanent ID (e.g. `DEMO-1042`).
  - Searchable directory filtering by permanent ID, name, region, and state.
  - Consolidated institution profile showing all historical and active complaints across all bureaus in one view.
- **Deterministic Case Lifecycle & Append-Only History**:
  - Atomic case numbers generated sequentially via database counters (`PREFIX-YYYY-NNNNN`).
  - Strict append-only event trail (`case_events`): every status change, remark, transfer, and escalation is permanently recorded with actor and timestamp. Existing events cannot be mutated or deleted.
  - Future received dates (`received_date > current_date`) are validated and rejected with HTTP 422.
- **Explainable Overlap Detection Engine**:
  - Automatically identifies candidate case pairs concerning the same institution across different bureaus received within 365 days of each other.
  - Scores pairs into confidence bands (**High**, **Medium**, **Low**) using TF-IDF cosine similarity, shared reference code matching, category relationships, and date proximity.
  - Generates human-readable explanation tags (`same_permanent_id`, `same_category`, `related_category`, `shared_reference`, `text_similarity`, `date_proximity`).
- **Human-in-the-Loop Coordination Queue**:
  - The detection engine flags pairs; **it never automatically merges or closes cases**.
  - Authorized coordinators decide on flagged pairs: `duplicate`, `related`, `not_related`, or `needs_review`.
  - Recording a review decision appends a `review` event to both cases, preserving separate case numbers and independent ownership.
- **Manual-Verification Governance Queue**:
  - Dedicated queue identifying cases with missing or unresolvable institutional Permanent IDs for coordinator and administrator remediation.
- **Dynamic SLA Warnings & Inactivity Alerts**:
  - Overdue calculations derived at query time (`expected_disposal_date < current_date` for non-disposed cases).
  - Configurable alerts for impending SLA breach (e.g., due within 3 days) and pending reminder alerts for cases inactive >7 days.
- **Cross-Bureau Analytics & CSV Export**:
  - 7 breakdown reports: Bureau distribution, status distribution, category breakdown, regional workload, ageing buckets, disposal rate, and overlap review outcomes.
  - One-click CSV export endpoints (`GET /api/v1/reports/{kind}/csv`) verified for exact SQL sum parity.
- **Role-Based Permissions & Data Protection**:
  - Four backend roles: `bureau_officer`, `coordinator`, `senior_management`, and `administrator`.
  - Bureau officers view full details for their own bureau's cases, while cross-bureau cases for the same institution show masked summaries (internal remarks and attachments suppressed).
  - Senior management is strictly read-only.
- **Administrative Governance Console**:
  - Manage user accounts (activate/deactivate, password resets), edit live system parameters (SLA warning thresholds), view data quality metrics, and inspect system audit logs.

---

## 3. User Interface Overview

The CaseBridge dashboard interface consists of:
- **Overview Dashboard**: High-level KPIs, bureau workload distribution charts (Recharts), and real-time SLA/inactivity alert feed.
- **Institution Profile**: Single-window view of all historical and active cross-bureau complaints concerning an institution, indexed by Permanent ID (`DEMO-XXXX`).
- **Case Detail & Timeline**: Chronological, append-only event trail showing every action, note, transfer, and escalation.
- **Coordination Review Queue**: Side-by-side comparison of candidate overlap pairs with confidence band chips and explainable reasoning tags.
- **Reports & Analytics**: Aggregated cross-bureau metrics across 7 breakdown dimensions with instant CSV export.
- **Admin Console**: Live governance dashboard for user management, system parameters, and audit logging.

---

## 4. Deployment & Demonstration Links

- **Frontend Application (Vercel)**: *Will be attached upon deployment*
- **Backend API & Swagger Docs (Render)**: *Will be attached upon deployment*
- **Demonstration Walkthrough Video**: *Will be attached upon recording*

---

## 5. Evaluation Summary & Honest Disclosures

The overlap detection engine was evaluated against independent, non-circular ground truth built from hidden issue scenarios (`data/eval/hidden_issues.csv`) where cases share an underlying issue split across bureaus with paraphrased descriptions. The summary below is copied directly from [`docs/eval.md`](docs/eval.md):

### 5.1 Methodology Disclosures & Caveats
1. **100% Synthetic Data**: All evaluation cases and pairs were generated synthetically. No live or historical AICTE complaints were used.
2. **Exploratory Sweeps Disclosure**: Exploratory threshold sweeps over all 986 pairs were conducted before fixing the institution split; therefore, the primary test split is **not strictly held out** in an untouched, pre-registered sense.
3. **Confirmatory Fresh-Seed Run (Seed `20261025`)**: A completely fresh synthetic dataset (`data/eval_fresh/`, 1,000 pairs) was generated *after* thresholds were frozen to confirm parameter stability. *Caveat:* it uses the same generator logic and templated phrasing as the primary set.
4. **Metric Choice**: Text similarity uses unsupervised TF-IDF cosine similarity exclusively. Rapidfuzz token-set similarity was dropped from text scoring and is retained solely for reference code matching (`check_shared_reference`).
5. **Missed Paraphrases & Recall Bound**: 64 of 180 related pairs (35.6%) are missed (scored Low) because they are zero-similarity or near-zero paraphrases beyond surface lexical overlap. Development recall of **0.533** only just meets the $\ge 0.50$ minimum operational constraint.
6. **Frozen Operational Thresholds**: High band $T_{high} = 0.16$ (with same/related category or shared reference); Medium band $T_{med} = 0.14$ (text similarity alone); Category match alone $\rightarrow$ Low.

### 5.2 Performance Metrics (Exact Counts from `docs/eval.md`)
*Positive prediction = Flagged in Medium or High confidence band (similarity $\ge 0.14$)*

| Dataset / Split | Precision | Recall | F1 | TP | FP | FN | TN | Total Pairs |
|---|---|---|---|---|---|---|---|---|
| **Development Split (23 insts)** | **0.860** | **0.533** | **0.658** | **49** | **8** | **43** | **404** | 504 |
| **Test Split (22 insts)** | **0.893** | **0.761** | **0.822** | **67** | **8** | **21** | **386** | 482 |
| **All Scored Pairs (45 insts)** | **0.879** | **0.644** | **0.744** | **116** | **16** | **64** | **790** | 986 |
| *Previous Engine (All Pairs)* | *0.276* | *0.928* | *0.425* | *167* | *439* | *13* | *367* | 986 |
| *Naive Baseline (Flag all cross-bureau)* | *0.183* | *1.000* | *0.309* | *180* | *806* | *0* | *0* | 986 |

- **False Positive Reduction**: Coordinator false alarms dropped from **439 down to 16** (a **96.4% reduction**).
- **Confirmatory Fresh-Seed Dataset (`data/eval_fresh/`, seed `20261025`)**:
  - Dev Split: Precision = **0.911**, Recall = **0.783**, F1 = **0.842** (TP=72, FP=7, FN=20, TN=414)
  - Test Split: Precision = **0.929**, Recall = **0.739**, F1 = **0.823** (TP=65, FP=5, FN=23, TN=394)
  - All Pairs: Precision = **0.919**, Recall = **0.761**, F1 = **0.833** (TP=137, FP=12, FN=43, TN=808)
- **200-Case Demo Seed Scan (`data/seed/cases.csv`)**:
  - Evaluated 535 candidate pairs: **30 High**, **45 Medium**, **460 Low**.
  - Demo pair `PG-2026-00104 / RB-2026-00219` flagged as **High** with reasons `['same_permanent_id', 'same_category', 'text_similarity 0.23', 'date_proximity 14 days']`.
  - Rescan is strictly idempotent (**0 duplicate links**).

---

## 6. How to Run Locally

### 6.1 Prerequisites
- **Python**: 3.11+ (Python 3.13 tested)
- **Node.js**: v18+ (Node v20+ tested)
- **npm**: v9+

### 6.2 Backend Setup (Run from `backend/` Directory)
```bash
# 1. Navigate to backend directory
cd backend

# 2. Create and activate a Python virtual environment
python -m venv .venv
# On Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# On Linux / macOS:
source .venv/bin/activate

# 3. Install backend dependencies
pip install -r requirements.txt

# 4. Create environment configuration
copy .env.example .env     # On Windows
# cp .env.example .env     # On Linux / macOS

# 5. Start development server
uvicorn app.main:app --reload --port 8000
```

The backend starts at `http://127.0.0.1:8000`. Interactive OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

### 6.3 Backend Environment Settings (`backend/.env`)
- `ENV`: Set to `dev` for local development (allows dev fallback secret) or `prod` (requires explicit `JWT_SECRET`).
- `JWT_SECRET`: Random 64-character string for signing JWT tokens.
- `ALLOW_DEMO_LOGIN`: Set to `true` to enable the quick demo login endpoint (`/auth/mock-login`) and demo credentials listing (`/auth/demo-accounts`). Default is `false`.
- `AUTO_SEED`: When set to `true`, the server automatically seeds demo cases into the database on startup if the `cases` table is empty. Default is `false`.
- `CORS_ORIGINS`: Comma-separated list of allowed frontend origins (e.g. `http://localhost:5173,http://127.0.0.1:5173`).

### 6.4 Loading the Demo Data
You can populate the database with synthetic demo data in either of two ways:

1. **Automatic Startup Seeding**: Set `AUTO_SEED=true` in `backend/.env` before launching the server.
2. **Manual Command Line Seeding** (run from repository root):
   ```bash
   python scripts/seed_demo.py
   python scripts/import_csv.py
   ```

### 6.5 Frontend Setup (Run from `frontend/` Directory)
Open a separate terminal window:
```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

The frontend application starts at `http://localhost:5173`.

---

## 7. Demo Accounts & Authentication Note

> [!CAUTION]
> **Prototype-Level Authentication:**  
> The authentication system uses JWT bearer tokens for role simulation and persona switching. It is intended strictly for demonstration and hackathon evaluation, **not as enterprise-grade identity management**. In production, this would be replaced with official government Single Sign-On (e.g., Parichay / MeriPehchaan) or enterprise IAM.

When `ALLOW_DEMO_LOGIN=true`, you can use the Quick Demo Login buttons on `/login` or enter credentials manually:

| Username | Password | Role | Bureau Jurisdiction | Operational Scope |
|---|---|---|---|---|
| `coordinator` | `coord123` | `coordinator` | All Bureaus | Full case visibility; decides on overlap review queue; reassigns/escalates |
| `officer_rb` | `officer123` | `bureau_officer` | `RB` (Regulation Bureau) | Full details for RB cases; masked summaries for other bureaus; posts events |
| `officer_pgrc` | `officer123` | `bureau_officer` | `PGRC` (Grievance Cell) | Full details for PGRC cases; masked summaries for other bureaus; posts events |
| `officer_ro` | `officer123` | `bureau_officer` | `RO` (Regional Office) | Full details for RO cases; masked summaries for other bureaus; posts events |
| `management` | `mgmt123` | `senior_management` | All Bureaus | Executive read-only visibility for KPI summaries, analytics, and reports |
| `admin` | `admin123` | `administrator` | System | User management, live SLA configuration, data quality checks, audit trail |

---

## 8. Assumptions & Limitations

A complete analysis of project assumptions is documented in [`docs/assumptions.md`](docs/assumptions.md):

1. **Synthetic Data Boundary**: All data is synthetic. No live institutional databases, citizen identities, or real grievances are connected.
2. **Internal Tooling Only**: CaseBridge is an internal coordination desk for council officers; it is **not** a public complaint-filing portal.
3. **No Statutory Mandates**: Disposal targets and SLA warnings are configurable demonstration parameters, not legally binding statutory deadlines.
4. **Pre-Registration Requirement**: Institutions must exist in the directory before cases can be filed against them (`permanent_id` foreign key constraint).
5. **In-App Notifications**: Alerts and reminders exist within the application interface; no external SMS or email gateways are integrated.
6. **Lexical Matching Boundary**: The overlap engine relies on TF-IDF cosine similarity and explicit reference patterns. It misses paraphrased complaints that share an underlying issue with zero surface vocabulary overlap (35.6% false negative rate).
7. **No Auto-Closure**: AI/heuristic scores never close, merge, or alter case statuses automatically; all decisions require human intervention.

---

## 9. Project Structure

```
casebridge/
  backend/
    app/
      main.py            # FastAPI entry point, lifespan, auto-seed hook, CORS
      db.py              # SQLite engine, sessions, schema creation
      models.py          # SQLModel tables (Case, Institution, CaseEvent, OverlapLink, User)
      schemas.py         # Pydantic validation schemas and response contracts
      permissions.py     # Role-based visibility and access control guards
      auth_utils.py      # JWT token creation and bcrypt password verification
      routers/           # Modular API endpoints:
        admin.py         # User management, config editor, audit trail
        alerts.py        # Active alert queries and dismissals
        auth.py          # Real login, demo mock login, persona profiles
        cases.py         # Case creation, search, patch, and detail views
        dashboard.py     # Summary KPIs and bureau workload distribution
        events.py        # Append-only case timeline events
        institutions.py  # Institution directory and profile views
        overlaps.py      # Overlap detection queue, reviews, manual verification
        reports.py       # Aggregate analytics and CSV export
      services/          # Domain business logic:
        alerts.py        # Rule-based SLA and inactivity evaluation
        overlap.py       # Candidate filtering, TF-IDF vectorization, band ranking
        reports.py       # KPI derivation and CSV formatting
    tests/               # Backend automated test suite (114 pytest tests)
    requirements.txt     # Python dependencies
<<<<<<< Updated upstream
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
=======
    .env.example         # Template configuration for backend
  frontend/
    src/
      api/               # Typed fetch client with Bearer token injection
      components/        # UI components (Badges, Modals, ProtectedRoute, Navbar)
      pages/             # Page views (Overview, Cases, Overlaps, Reports, Admin, Login)
      App.tsx            # Route registration and layout shell
    package.json         # React 19, Vite, Tailwind CSS, Recharts
    vercel.json          # SPA client rewrite rules for Vercel deployment
  data/
    seed/                # Synthetic baseline seed CSVs (institutions, cases, events)
    eval/                # Ground-truth evaluation corpus with hidden issue IDs
    eval_fresh/          # Confirmatory evaluation dataset (seed 20261025)
    planted_truth.md     # Audited ground-truth overlap pairs
    README.md            # Synthetic data notice
  scripts/               # Maintenance, CSV import, and benchmark evaluation scripts
  docs/                  # Specifications and reference documentation
  render.yaml            # Render deployment blueprint
>>>>>>> Stashed changes
  PROGRESS.md            # Verified phase-by-phase delivery status
  README.md              # Project documentation and run guide
```

---

## 10. Documentation Index

For full architectural, algorithmic, and operational specifications, consult the documents in [`docs/`](docs/):

- [`docs/00_CENTRAL_PRD.md`](docs/00_CENTRAL_PRD.md): Authoritative Master Product Requirements Document (PRD).
- [`docs/eval.md`](docs/eval.md): Complete evaluation protocol, ground truth construction, benchmark tables, and disclosures.
- [`docs/assumptions.md`](docs/assumptions.md): System assumptions, prototype boundaries, and domain questions.
- [`docs/deployment.md`](docs/deployment.md): Production deployment guide, environment variables, Render and Vercel architecture.
- [`PROGRESS.md`](PROGRESS.md): Verified delivery milestones, test passes, and code review item tracking.
