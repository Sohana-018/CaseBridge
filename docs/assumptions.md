# CaseBridge: System Assumptions, Operational Scope & Prototype Grounding

**Project:** CaseBridge (SIH26264)  
**Document Target:** `docs/assumptions.md`  
**Document Role:** Companion Grounding & Assumptions Specification  
**Authoritative Reference:** [`docs/00_CENTRAL_PRD.md`](00_CENTRAL_PRD.md)  
**Last Revised:** 2026-10-24  

---

> [!IMPORTANT]
> **Synthetic Data and Regulatory Notice:**  
> All data used throughout CaseBridge is **100% synthetic**. There are no real citizens, institutions, complaints, or official findings represented. This document records operational choices adopted for the demonstration prototype. It does **not** assert official AICTE policies, statutory deadlines, or legal mandates.

---

## 1. Document Purpose and Authority

1. **Role of this Document:**  
   This document is the companion to the authoritative master specification, [`docs/00_CENTRAL_PRD.md`](00_CENTRAL_PRD.md). Its purpose is to clearly distinguish:
   - What is assumed specifically for the hackathon demonstration prototype.
   - What behavior is implemented and verified in the current codebase.
   - What workflows are provisional proposals requiring validation with the problem owner.
   - What domain questions remain unresolved.
2. **Authority:**  
   [`docs/00_CENTRAL_PRD.md`](00_CENTRAL_PRD.md) is the sole authoritative specification for requirements, API contracts, data models, and team scope. In the event of any conflict, the Central PRD governs.
3. **Classification Tags:**  
   To maintain precision, statements in this document are tagged:
   - `[PRD REQUIREMENT]` — Confirmed requirement established in the Central PRD.
   - `[CODE-VERIFIED]` — Behavior implemented and verified in active repository code and tests.
   - `[PROTOTYPE ASSUMPTION]` — Operational choice adopted for the demonstration prototype.
   - `[PROPOSAL — NOT IMPLEMENTED]` — Proposed workflow or feature not yet built into backend logic.
   - `[UNRESOLVED]` — Open domain question requiring external AICTE clarification.

---

## 2. Prototype Scope and Regulatory Caveats

* **`[PRD REQUIREMENT]` Internal Coordination Only:**  
  CaseBridge is designed strictly as an internal monitoring, tracking, and coordination dashboard for authorized AICTE officials. It is **not** a public complaint-submission portal for students, parents, or institutions ([`docs/00_CENTRAL_PRD.md`](00_CENTRAL_PRD.md) §2).
* **`[PRD REQUIREMENT]` Synthetic Data Environment:**  
  No production AICTE credentials, live databases, citizen PII, or unauthorized integrations are used. The platform operates exclusively on reproducible synthetic datasets located in [`data/seed/`](../data/seed/).
* **`[PRD REQUIREMENT]` No Statutory AICTE Deadlines Asserted:**  
  Neither the AICTE Citizen's Charter nor statutory Gazette disposal limits are represented as hardcoded legal mandates. All overdue calculations and SLA alerts represent configurable demonstration parameters ("demo rules") ([`docs/00_CENTRAL_PRD.md`](00_CENTRAL_PRD.md) §2, §8 FR14).
* **`[PRD REQUIREMENT]` In-App Notifications Only:**  
  Alerts and reminders are restricted entirely to in-app dashboard views, status badges, and review queues. Out-of-band delivery channels (SMS gateways, WhatsApp APIs, external SMTP) are deliberately excluded ([`docs/00_CENTRAL_PRD.md`](00_CENTRAL_PRD.md) §2).

---

## 3. Confirmed Project Principles

* **`[PRD REQUIREMENT]` `[CODE-VERIFIED]` Authoritative Institutional Identity:**  
  Approved technical institutions are identified and indexed by their authoritative AICTE **Permanent ID** (e.g., `DEMO-1042`). Cases link to institutions strictly via verified Permanent ID resolution ([`backend/app/models.py`](../backend/app/models.py#L105)).
* **`[PRD REQUIREMENT]` `[CODE-VERIFIED]` Human Decision Requirement (Safety Guardrail):**  
  Related cases concerning the same institution are **never automatically merged, closed, or disposed of** based on algorithmic matching scores ([`docs/00_CENTRAL_PRD.md`](00_CENTRAL_PRD.md) §2, §9.6). Authorized human officials make all linking, transfer, and disposal decisions. When flagged pairs are reviewed as `related` or `duplicate`:
  - Both cases remain open, active, and independent.
  - Each case retains its distinct case number, assigned officer, bureau jurisdiction, and history.
* **`[PRD REQUIREMENT]` `[CODE-VERIFIED]` Immutable Append-Only Audit Trail:**  
  Every status change, inter-bureau transfer, escalation, officer remark, and overlap review appends a new record to [`case_events`](../backend/app/models.py#L140-L156). Existing events cannot be overwritten, modified, or deleted; direct mutation requests are rejected with HTTP 405 Method Not Allowed ([`backend/app/routers/events.py`](../backend/app/routers/events.py#L65-L75)).
* **`[PRD REQUIREMENT]` `[CODE-VERIFIED]` Single Source of Truth for Metrics:**  
  All dashboard KPI counts, workload distributions, reports, and ageing buckets are computed directly from primary database tables ([`backend/app/routers/dashboard.py`](../backend/app/routers/dashboard.py), [`backend/app/services/reports.py`](../backend/app/services/reports.py)), guaranteeing that summary metrics match case list totals ([`docs/00_CENTRAL_PRD.md`](00_CENTRAL_PRD.md) §8 FR17).

---

## 4. Prototype Assumptions and Demo Conventions

### 4.1 Administrative Units (Bureaus and Cells)
* **`[PROTOTYPE ASSUMPTION]` `[CODE-VERIFIED]` Four Operational Units:**  
  To demonstrate multi-bureau workflows, the system defines four units in [`Bureau`](../backend/app/models.py#L14-L19):
  - `RB` — Regulation Bureau *(Verified real AICTE bureau)*.
  - `PGRC` — Public Grievance Redressal Cell *(Verified real AICTE cell)*.
  - `RO` — Regional Office *(Demonstration mock unit for regional jurisdiction)*.
  - `OC` — Other Cell *(Demonstration mock unit for cross-cell coordination)*.

### 4.2 Categorization and Regional Segmentation
* **`[PROTOTYPE ASSUMPTION]` `[CODE-VERIFIED]` Seven Complaint Categories:**  
  [`CaseCategory`](../backend/app/models.py#L39-L47) defines: `infrastructure`, `faculty`, `fee_refund`, `admission`, `approval`, `examination`, `other`.
* **`[PROTOTYPE ASSUMPTION]` `[CODE-VERIFIED]` Five Geographic Zones:**  
  [`Region`](../backend/app/models.py#L49-L55) defines: `North`, `South`, `East`, `West`, `Central`.

### 4.3 Case Numbering Scheme
* **`[PROTOTYPE ASSUMPTION]` `[CODE-VERIFIED]` Deterministic Case Numbers:**  
  New cases receive atomic numbers formatted as `{PREFIX}-{YYYY}-{SEQUENCE:05d}` generated via the `counters` table ([`backend/app/routers/cases.py`](../backend/app/routers/cases.py#L208-L229)). Prefix mappings: `RB` $\rightarrow$ `RB`, `PGRC` $\rightarrow$ `PG`, `RO` $\rightarrow$ `RO`, `OC` $\rightarrow$ `OC`. Case numbers are permanent and remain unchanged even if a case is transferred to another bureau.

### 4.4 Baseline Demonstration Scenario (Verified in Seed Data)
* **`[PROTOTYPE ASSUMPTION]` `[CODE-VERIFIED]` Seed Demo Overlap Pair:**  
  Per [`docs/00_CENTRAL_PRD.md`](00_CENTRAL_PRD.md) §7 and verified in [`data/seed/cases.csv`](../data/seed/cases.csv) and [`scripts/seed_demo.py`](../scripts/seed_demo.py#L106-L135):
  - **Institution:** *Example Institute of Technology (demo)* (`permanent_id`: `DEMO-1042`, region: `South`, state: `Karnataka`).
  - **Case A (`PG-2026-00104`):** Bureau: `PGRC`, Category: `faculty`, Status: `under_process`, Officer: `A. Rao (demo)`, Last Action: `Notice sent to institution` (2026-10-02), Next Action: `Await institution reply`, Expected Disposal: `2026-11-15`, Priority: `medium`.
  - **Case B (`RB-2026-00219`):** Bureau: `RB`, Category: `faculty`, Status: `pending`, Officer: `P. Sharma (demo)`, Last Action: `Inspection inquiry initiated` (2026-10-23), Next Action: `Review compliance documents`, Expected Disposal: `2026-10-26`, Priority: `high`.
  - **Planted Overlap:** Planted in [`data/planted_truth.md`](../data/planted_truth.md) (line 17) and [`data/labelled_pairs.csv`](../data/labelled_pairs.csv) (line 2) as a true overlap (`related`, `development` split) concerning faculty cadre ratio.

### 4.5 Evaluation Dataset Ground Truth
* **`[PROTOTYPE ASSUMPTION]` `[CODE-VERIFIED]` Labelled Evaluation Pairs:**  
  - [`data/labelled_pairs.csv`](../data/labelled_pairs.csv) contains **211 lines** total (1 header row + **210 pair evaluations**: 30 related, 180 not_related).
  - Pairs are partitioned into a balanced 50/50 split: 105 development pairs and 105 test pairs.
  - Detection thresholds are tuned on `development` only; precision, recall, and F1 are evaluated on `test` against the naive baseline ("same institution, different bureau").
  - *(Note: An initial exploratory generator run documented in `PROGRESS.md` produced 280 pairs; the committed, authoritative evaluation ground truth in the repository is the 210-pair dataset).*

---

## 5. Current Implementation Notes (Interpreting Assumptions)

### 5.1 Mock Authentication & Role Model
* **`[CODE-VERIFIED]` Four Backend Roles:**  
  The system enforces four distinct roles defined in [`UserRole`](../backend/app/models.py#L85-L89):
  1. `bureau_officer` — Operational officer handling cases within their assigned bureau.
  2. `coordinator` — Cross-bureau supervisor overseeing overlap reviews and reassignments.
  3. `senior_management` — Executive leadership monitoring high-level KPIs and reports.
  4. `administrator` — System administrator managing configuration, imports, and audit logs.
* **`[CODE-VERIFIED]` Mock Login API Contract:**  
  Endpoint `POST /api/v1/auth/mock-login` ([`backend/app/routers/auth.py`](../backend/app/routers/auth.py#L90-L145)) accepts:
  ```json
  {
    "role": "bureau_officer",
    "bureau": "RB",
    "name": "RB Officer (demo)"
  }
  ```
  Returns a signed JWT bearer token carrying `{sub, role, bureau, name}`. Role `bureau_officer` strictly requires a valid `bureau` (`RB`, `PGRC`, `RO`, `OC`).
* **`[PROTOTYPE ASSUMPTION]` Five UI Login Presets:**  
  To simplify evaluation and live presentations, the frontend UI provides five quick-login personas that map directly to the four backend roles:
  1. **PGRC Officer** $\rightarrow$ `role`: `bureau_officer`, `bureau`: `PGRC`, `name`: `"PGRC Officer (demo)"`
  2. **RB Officer** $\rightarrow$ `role`: `bureau_officer`, `bureau`: `RB`, `name`: `"RB Officer (demo)"`
  3. **Coordinator** $\rightarrow$ `role`: `coordinator`, `bureau`: `null`, `name`: `"Demo Coordinator"`
  4. **Senior Management** $\rightarrow$ `role`: `senior_management`, `bureau`: `null`, `name`: `"Senior Management (demo)"`
  5. **Administrator** $\rightarrow$ `role`: `administrator`, `bureau`: `null`, `name`: `"Demo Administrator"`

### 5.2 Role-Based Permissions Summary
* **`[CODE-VERIFIED]` Verified Code Permissions:**  
  Access control logic ([`backend/app/permissions.py`](../backend/app/permissions.py), [`backend/app/routers/cases.py`](../backend/app/routers/cases.py)) enforces the following:

| Capability / Action | Bureau Officer | Coordinator | Senior Management | Administrator |
|---|:---:|:---:|:---:|:---:|
| **View Own Bureau Cases (Full)** | ✅ Yes | ✅ Yes | ✅ Yes (Read-Only) | ✅ Yes |
| **View Other Bureau Cases (Same Inst.)** | 👁️ Summary-Only* | ✅ Yes | ✅ Yes (Read-Only) | ✅ Yes |
| **Create Cases in Own Bureau** | ✅ Yes | ✅ Yes | ❌ Forbidden (403) | ✅ Yes |
| **Patch Case Fields (`next_action`, `priority`, etc.)** | ✅ (Own Bureau) | ✅ Yes | ❌ Forbidden (403) | ✅ Yes |
| **Post Case Events (Status change, remark)** | ✅ (Own Bureau) | ✅ Yes | ❌ Forbidden (403) | ❌ Forbidden (403) |
| **Transfer / Escalate Across Bureaus** | ❌ (Own Bureau only) | ✅ Yes | ❌ Forbidden (403) | ❌ Forbidden (403) |
| **Acknowledge & Refresh Alerts** | ✅ Yes | ✅ Yes | ❌ Forbidden (403) | ✅ Yes |
| **Review & Link/Dismiss Overlaps** | 👁️ Read-Only | ✅ Authorized | ❌ Read-Only | ❌ Read-Only (Separation) |

> *\*Masked Cross-Bureau Summary for Bureau Officers:* When viewing cases of another bureau, an officer receives only `case_no`, `bureau`, `category`, `status`, and `received_date`. Sensitive internal inquiry descriptions, officer notes, and remarks remain suppressed ([`backend/app/routers/cases.py`](../backend/app/routers/cases.py#L146-L155)).

### 5.3 Institution Pre-Registration Requirement
* **`[CODE-VERIFIED]` Directory Requirement:**  
  In [`backend/app/models.py`](../backend/app/models.py#L118), `institution_id` on the `Case` model is a non-null foreign key. When creating a case (`POST /api/v1/cases`), the backend resolves `permanent_id` against the `institutions` table; if the institution does not already exist, the request returns HTTP 404 Not Found ([`backend/app/routers/cases.py`](../backend/app/routers/cases.py#L198-L206)). Institutions must be pre-seeded or registered prior to case registration.

### 5.4 Dynamic Overdue & Alert Rules
* **`[CODE-VERIFIED]` Derived Overdue State:**  
  Overdue status is never stored statically in the database. It is derived on query execution:
  $$\text{overdue} \iff (\text{expected\_disposal\_date} < \text{current\_date}) \land (\text{status} \neq \text{'disposed'})$$
* **`[CODE-VERIFIED]` Database Config Parameters:**  
  The `config` table stores two adjustable integer parameters used by [`refresh_alerts`](../backend/app/services/alerts.py#L110-L111):
  - `pending_days` (default: `"7"`): Triggers a `pending_reminder` alert (Priority: `LOW`) for **any non-disposed case** whose `last_action_date` is older than `pending_days`. *(Applies across all open cases, not restricted to unassigned pending cases).*
  - `sla_warn_days` (default: `"3"`): Triggers an `sla_warning` alert (Priority: `MEDIUM`) when `0 <= (expected_disposal_date - current_date) <= sla_warn_days`.
* **`[CODE-VERIFIED]` SLA Breach Rule:**  
  Triggers an `sla_breach` alert (Priority: `HIGH`) when `current_date > expected_disposal_date` and status is not `disposed`. *(Evaluated dynamically in code; not a row in the `config` table).*
* **`[CODE-VERIFIED]` Overlap Search Window:**  
  Candidate overlap pairs are restricted to cases received within 365 calendar days of each other. *(Evaluated as a rule query condition; not a row in the `config` table).*

---

## 6. Unresolved Domain Questions (Pending AICTE Clarification)

The following operational questions require official confirmation from the problem owner (AICTE):

1. **`[UNRESOLVED]` Statutory Citizen's Charter Disposal Windows:**  
   Does AICTE mandate fixed statutory disposal timelines (e.g., 30 days for public grievances, 60 days for regulatory inspections) across specific bureaus, or do timelines vary by regional standing committee?
2. **`[UNRESOLVED]` Official AICTE Complaint Classification:**  
   What is the Council's standardized grievance classification tree, and how are multi-part complaints (e.g., faculty salary non-payment combined with unapproved intake) officially routed?
3. **`[UNRESOLVED]` Duplicate Closure Legal Authority:**  
   Can a Bureau Officer unilaterally close a case because another bureau is handling the same matter, or is formal concurrence from a Joint Secretary or Central Grievance Committee required?
4. **`[UNRESOLVED]` Multi-Campus Society Permanent IDs:**  
   How does AICTE structure Permanent IDs when a single parent society or trust operates multiple polytechnic, pharmacy, and engineering colleges across different regional jurisdictions?
5. **`[UNRESOLVED]` Upstream Portal Ingestion Schemas:**  
   Are institutional grievances ingested from central platforms (e.g., CPGRAMS, Prime Minister's Portal, State Technical Education portals), and what standardized export schemas or webhooks are supported?

---

## 7. Proposed Behaviors (Not Yet Implemented in Code)

The following items are design proposals formulated for Phase 15–16; they are **not currently enforced in the backend codebase**:

* **`[PROPOSAL — NOT IMPLEMENTED]` Strict State Machine Transition Enforcement:**  
  A proposed state machine where `pending` transitions only to `under_process` or `transferred`, `transferred` transitions only to `under_process`, and `disposed` is terminal.  
  *Current Code Reality:* [`backend/app/services/events.py`](../backend/app/services/events.py#L53-L62) accepts any valid `to_status` enum when recording a `status_change` event. The strict transition graph remains an operational proposal.
* **`[PROPOSAL — NOT IMPLEMENTED]` Data Quality Quarantine Queue & Overlap Suspension:**  
  Quarantining imported intake records with missing or conflicting Permanent IDs under `GET /api/v1/quality/issues` and automatically suspending overlap detection on those records until administrative resolution.  
  *Current Code Reality:* The `/quality/issues` endpoint is scheduled for Phase 16. Currently, records missing an existing Permanent ID fail with HTTP 404 at the database foreign-key layer.
* **`[PROPOSAL — NOT IMPLEMENTED]` Chronological Anomaly Exclusion:**  
  Excluding cases with impossible dates (e.g., `received_date > today`) from dashboard SLA compliance scores.  
  *Current Code Reality:* Alerts and reports currently process all active cases without chronological anomaly filtering.

---

## 8. References to Central PRD and Project Files

For detailed technical specifications, refer to the authoritative project documents:

* **Master Requirements & Contracts:** [`docs/00_CENTRAL_PRD.md`](00_CENTRAL_PRD.md)
  - §2 Goals and Non-Goals
  - §3 Users and Roles Matrix
  - §7 Core Data Models & Enums
  - §8 Functional Requirements (FR1–FR20)
  - §9 Overlap Detection Heuristics & Evaluation Protocol
  - §10 API Contract (`/api/v1`)
  - §15 Operational Risks & Built-in Mitigations
* **Repository Run Guide & Setup:** [`README.md`](../README.md)
* **Delivery Status Tracker:** [`PROGRESS.md`](../PROGRESS.md)
* **Synthetic Data Declarations:** [`data/README.md`](../data/README.md)
* **Planted Ground Truth Registry:** [`data/planted_truth.md`](../data/planted_truth.md)
* **Evaluation Ground Truth Dataset:** [`data/labelled_pairs.csv`](../data/labelled_pairs.csv)
