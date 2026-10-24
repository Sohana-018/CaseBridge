# CaseBridge: Central PRD (SIH26264)
**Integrated Dashboard for Monitoring and Tracking Institution-Related Complaint Cases Across AICTE Bureaus/Cells**
Version 1.0 · Written Fri 23 Oct 2026 · Owner: Adarsh (lead)
Everyone reads this file. Each member also has a personal PRD (01 to 06) with their own tasks.

**Deadlines:** feature freeze Mon 26 Oct 9 pm · project in finishing status Tue 27 Oct 6 pm · PPT submitted Wed 28 Oct before noon.

---

## 1. Summary
AICTE receives complaints about technical institutions. Different Bureaus/Cells (the Regulation Bureau RB, the Public Grievance Redressal Cell PGRC, others) handle them separately, so nobody can easily see that two teams are working on the same institution. This causes duplicated effort, parallel actions and slow disposal.

CaseBridge is an **internal monitoring and coordination dashboard** for authorised officials. It shows every institution-related case in one place, who owns it, its full history, deadlines, and **explainable, human-reviewed overlap alerts** when more than one Bureau/Cell is dealing with the same institution.

**One line:** one institution → one consolidated case view → clear ownership and history → explainable overlap alerts → coordinated action → measurable reports.

## 2. Goals and non-goals

**Goals**
1. Single-window view of all cases, by institution, Bureau/Cell, region, status.
2. Every case shows owner, status, last action, next action and due date.
3. Detect likely overlapping cases across Bureaus/Cells and show **why**.
4. Humans decide: link, mark duplicate, dismiss. No automatic merge or closure.
5. Dashboard, alerts and reports that agree with the case records.
6. A measured, honest evaluation of the matching on labelled synthetic data.

**Non-goals (do not build)**
- A complaint-submission portal for students or the public.
- Real AICTE data or systems integration. We use synthetic data only.
- Legal or regulatory decisions. The tool supports coordination only.
- Official SLA rules. Ours are configurable and labelled "demo rule".
- Email/SMS delivery. Alerts are in-app.

## 3. Users and roles

| Role | Can do | Cannot do |
|---|---|---|
| **Bureau Officer** | See own Bureau's cases in full; see summary of cross-Bureau cases for the same institution; update status/next action; review alerts for own cases | Edit another Bureau's case; change config |
| **Coordinator** | See all cases in full; review/link/dismiss overlaps; reassign or escalate | Change config or users |
| **Senior Management** | Read-only dashboard and reports | Edit anything |
| **Administrator** | Manage config, demo users, seed import; view audit log | Review overlaps as a decision-maker (keeps separation) |

Cross-Bureau summary visible to Officers: case number, Bureau, category, status, received date. Remarks and attachments stay hidden.
Auth is mock: pick a role at login, a token carries `role` and `bureau`. This is a demo; it is not real security.

## 4. Scope by priority

| Priority | Scope | Phases |
|---|---|---|
| **P0 Core** | Database, institution profile, case list/detail, status and owner, action history, search and filters, dashboard counts | 4-10 |
| **P1 Coordination** | Same-institution matching, explainable overlap queue, link/dismiss, alerts, transfers/escalations | 6, 11-14 |
| **P2 Reports and access** | Reports (Bureau, status, ageing, disposal), mock roles, audit log, data-quality list | 15-16 |
| **P3 Polish** | Region and institution reports, CSV export, sentence embeddings | only if time |

**Cut order if behind:** embeddings → CSV/PDF export → admin screen → region report → PostgreSQL.
**Never cut:** institution profile, case history, overlap queue with reasons, dashboard counts, precision/recall result.

## 5. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React (Vite) + React Router + TypeScript + Tailwind + Recharts | Internal logged-in dashboard; no SEO or server rendering needed; fast start |
| Backend | Python 3.11, FastAPI, Pydantic v2, SQLModel | Pydantic validates every input and output; async; auto docs at `/docs` |
| Database | SQLite (file `casebridge.db`) | Zero setup; same SQL as PostgreSQL |
| Matching | rule engine + rapidfuzz + scikit-learn TF-IDF | Explainable and fast; no GPU |
| Tests | pytest (backend), manual checklist (UI) | Time-appropriate |
| Deploy | Vercel or Netlify (frontend), Render (backend) | Free tiers |

Config: backend `.env` (never committed); frontend `VITE_API_URL`. **No hard-coded URLs.**

## 6. Repository layout
```
casebridge/
  backend/
    app/
      main.py            # FastAPI app, CORS, router includes
      db.py              # engine, session
      models.py          # SQLModel tables
      schemas.py         # Pydantic request/response models
      routers/           # institutions.py cases.py events.py overlaps.py alerts.py dashboard.py reports.py auth.py quality.py
      services/          # case_numbers.py overlap.py alerts.py reports.py quality.py
    tests/
    requirements.txt
  data/
    seed/                # institutions.csv cases.csv events.csv
    labelled_pairs.csv   # ground truth for evaluation
    README.md            # "all data is synthetic"
  scripts/               # generate_data.py import_csv.py evaluate_overlap.py
  frontend/
    src/ api/ components/ pages/ styles/ mock/
  docs/                  # assumptions.md eval.md api.md
  PROGRESS.md
```

## 7. Data model

**institutions:** `id`, `permanent_id` (unique, e.g. `DEMO-1042`), `name`, `address`, `region`, `state`, `type`
**cases:** `id`, `case_no` (unique), `institution_id`, `bureau`, `category`, `description`, `received_date`, `status`, `assigned_officer`, `last_action`, `last_action_date`, `next_action`, `expected_disposal_date`, `priority`, `created_at`
**case_events (append-only):** `id`, `case_id`, `ts`, `actor`, `bureau`, `event_type`, `from_bureau`, `to_bureau`, `from_status`, `to_status`, `remarks`, `attachment_ref`
**overlap_links:** `id`, `case_a_id`, `case_b_id` (stored with `case_a_id < case_b_id`), `confidence_band`, `reasons` (JSON list), `review_status`, `reviewed_by`, `reviewed_at`, `note`, `created_at`. Unique on the pair.
**alerts:** `id`, `type`, `case_id`, `link_id`, `message`, `priority`, `status`, `created_at`, `due_at`
**users:** `id`, `name`, `role`, `bureau`
**counters:** `key` (e.g. `RB-2026`), `value`
**config:** `key`, `value`

**Enumerations (assumptions; label as demo)**
- `bureau`: `RB`, `PGRC`, `RO` (Regional Office, demo), `OC` (Other Cell, demo)
- `status`: `pending`, `under_process`, `disposed`, `transferred`, `escalated`
- `event_type`: `created`, `status_change`, `transfer`, `escalation`, `remark`, `link`, `review`
- `category`: `infrastructure`, `faculty`, `fee_refund`, `admission`, `approval`, `examination`, `other`
- `region`: `North`, `South`, `East`, `West`, `Central`
- `review_status`: `open`, `related`, `duplicate`, `not_related`, `needs_review`
- `confidence_band`: `high`, `medium`, `low`
- `alert type`: `overlap`, `pending_reminder`, `escalation`, `sla_warning`, `sla_breach`

**Derived, never stored:** `overdue` = `expected_disposal_date < today` and `status != disposed`.

**Case numbers:** `{PREFIX}-{YYYY}-{00001}`; prefix map `RB→RB`, `PGRC→PG`, `RO→RO`, `OC→OC`. Generated by the backend inside the insert transaction from `counters`. Unique, never reused, never changed on transfer. Imported cases keep their own number.

**Demo scenario (must exist in seed data):** institution "Example Institute of Technology (demo)", `permanent_id` `DEMO-1042`. PGRC case `PG-2026-00104` (under_process) and RB case `RB-2026-00219` about a related issue. They are a true overlap and are used in the demo.

## 8. Functional requirements

**Institution and cases**
- FR1 Institution profile by Permanent ID with a consolidated list of its cases.
- FR2 Case record with all fields in section 7; case number auto-generated.
- FR3 Case detail shows owner, status, last/next action, due date, full event timeline.

**Workflow**
- FR4 Status change, transfer (Bureau to Bureau), escalation and remark each append an event with timestamp and actor; the case's `last_action` and `last_action_date` update.
- FR5 History is never edited or deleted.

**Search and filters**
- FR6 Search by institution name, Permanent ID, case number.
- FR7 Filters: Bureau, region, category, status, date range, overdue. Combinable, clearable, with empty states.

**Overlap detection** (see section 9)
- FR8 Find open cases of the same institution in different Bureaus/Cells.
- FR9 Each flagged pair carries a confidence band and a reasons list.
- FR10 Overlap review queue: side-by-side cases; decide related, duplicate, not related, needs more review; add a note; link or dismiss.
- FR11 A review decision writes events on **both** cases. Both keep their own IDs and histories.
- FR12 Missing or conflicting institution IDs go to a manual-verification list, never guessed.

**Alerts**
- FR13 Alerts: overlap, pending reminder (no action for N days), escalation, SLA warning (due within N days), SLA breach.
- FR14 Rules come from `config` (defaults: `pending_days=7`, `sla_warn_days=3`), labelled "demo rule".

**Dashboard and reports**
- FR15 Dashboard: total, pending, under process, disposed, transferred, escalated, overdue; Bureau workload; recent alerts.
- FR16 Reports: by Bureau, by status, by region, by institution, ageing buckets (0-7, 8-30, 31-90, 90+ days), disposal rate, overlap review outcomes.
- FR17 Every number comes from the same case table as the list. Totals must match.

**Access and audit**
- FR18 Role-based visibility per section 3.
- FR19 Audit log of sensitive actions (reviews, reassignments, config changes, imports).
- FR20 Data-quality list: missing IDs, conflicting institution details, impossible dates (received after last action), cases without an owner.

## 9. Overlap detection design
1. **Resolve institution** by exact Permanent ID. If missing or inconsistent, add to the manual-verification list.
2. **Candidate pairs:** open cases, same institution, different Bureaus/Cells, received within 365 days of each other.
3. **Signals (each becomes a reason string):**
   - `same_permanent_id`
   - `same_category` or `related_category`
   - `shared_reference` (a letter or case number found in both descriptions)
   - `text_similarity` (TF-IDF cosine and rapidfuzz token-set ratio)
   - `date_proximity` (within 90 days)
4. **Band rules (initial; tune on the development split only):**
   - **High:** shared reference, or same category and similarity ≥ 0.50
   - **Medium:** same category, or similarity ≥ 0.30
   - **Low:** same institution and different Bureau only
5. **Output:** `{case_a, case_b, band, reasons[], review_status: "open"}`. No opaque score shown to users.
6. **Never** auto-merge, auto-close or change a case outcome.

**Evaluation protocol**
- `data/labelled_pairs.csv`: at least 200 pairs, columns `case_a, case_b, label` (related / not_related), including hard cases. Built by Shreeshanth, not by the person writing the rules.
- Split 50/50 into **development** and **test**. Tune thresholds on development only.
- Report on test: precision, recall, F1 at "flagged at Medium or above".
- **Baseline:** "same institution, different Bureau" (every such pair flagged). Show the precision gain over it.
- Say plainly in every slide and doc: synthetic labelled data.

## 10. API contract (v1)
Base path `/api/v1`. JSON only. Dates ISO 8601. Auth header: `Authorization: Bearer <token>`.
Error format: `{"error": {"code": "NOT_FOUND", "message": "Case not found", "details": {}}}`. Codes: `VALIDATION_ERROR` (422), `NOT_FOUND` (404), `FORBIDDEN` (403), `CONFLICT` (409).
List responses: `{"items": [...], "total": 123, "page": 1, "page_size": 20}`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/mock-login` | body `{role, bureau?}` → `{token, user}` |
| GET | `/me` | current user |
| GET | `/institutions` | `query`, `region`, `page` |
| GET | `/institutions/{permanent_id}` | profile + case list + open overlaps |
| GET | `/cases` | `query`, `institution`, `bureau`, `region`, `category`, `status`, `date_from`, `date_to`, `overdue`, `page`, `page_size` |
| POST | `/cases` | create (backend generates `case_no`) |
| GET | `/cases/{case_no}` | detail |
| PATCH | `/cases/{case_no}` | update `next_action`, `expected_disposal_date`, `assigned_officer`, `priority` |
| GET | `/cases/{case_no}/events` | timeline, oldest first |
| POST | `/cases/{case_no}/events` | body `{event_type, to_status?, to_bureau?, remarks?}` |
| GET | `/overlaps` | `review_status`, `band`, `page` |
| GET | `/overlaps/{id}` | pair detail with both cases |
| POST | `/overlaps/scan` | rerun detection → `{created: n}` |
| POST | `/overlaps/{id}/review` | body `{decision, note}` |
| GET | `/alerts` | `type`, `status`, `case_no` |
| POST | `/alerts/{id}/ack` | acknowledge |
| GET | `/dashboard/summary` | KPI counts |
| GET | `/dashboard/workload` | per-Bureau counts |
| GET | `/reports/{kind}` | `kind` = `bureau`, `status`, `region`, `institution`, `ageing`, `disposal`, `overlap_outcomes` |
| GET | `/quality/issues` | data-quality list |
| GET / PUT | `/config` | demo rules (admin) |
| GET | `/audit` | audit log (admin) |

**Case object**
```json
{
  "case_no": "PG-2026-00104",
  "institution": {"permanent_id": "DEMO-1042", "name": "Example Institute of Technology (demo)", "region": "South"},
  "bureau": "PGRC",
  "category": "faculty",
  "description": "Complaint about unqualified faculty in the mechanical department.",
  "received_date": "2026-09-12",
  "status": "under_process",
  "assigned_officer": "A. Rao (demo)",
  "last_action": "Notice sent to institution",
  "last_action_date": "2026-10-02",
  "next_action": "Await institution reply",
  "expected_disposal_date": "2026-11-15",
  "overdue": false,
  "priority": "medium"
}
```
**Event object**
```json
{"id": 41, "ts": "2026-10-02T10:30:00", "actor": "A. Rao (demo)", "bureau": "PGRC",
 "event_type": "remark", "from_bureau": null, "to_bureau": null,
 "from_status": null, "to_status": null, "remarks": "Notice sent to institution", "attachment_ref": null}
```
**Overlap object**
```json
{"id": 7, "band": "high", "review_status": "open",
 "reasons": ["same_permanent_id", "same_category", "text_similarity 0.62", "date_proximity 14 days"],
 "case_a": {"case_no": "PG-2026-00104", "bureau": "PGRC", "status": "under_process"},
 "case_b": {"case_no": "RB-2026-00219", "bureau": "RB", "status": "pending"},
 "reviewed_by": null, "reviewed_at": null, "note": null}
```
**Alert object**
```json
{"id": 12, "type": "overlap", "case_no": "RB-2026-00219", "link_id": 7,
 "message": "Potential overlapping cases. Coordination required", "priority": "high",
 "status": "open", "created_at": "2026-10-23T09:00:00", "due_at": null}
```
**Dashboard summary**
```json
{"total": 300, "pending": 80, "under_process": 120, "disposed": 60, "transferred": 15,
 "escalated": 25, "overdue": 34, "open_overlaps": 11}
```

## 11. Screens
1. **Overview dashboard:** KPI cards, status chart, Bureau workload, overdue list, recent alerts.
2. **Institution directory and profile:** search list; profile header; all linked cases; open overlaps.
3. **Case list and detail:** filters, case metadata, owner, next action, timeline, transfer/escalate/remark actions.
4. **Overlap review queue:** pair list; side-by-side cases; reasons; decision buttons; note box.
5. **Reports:** tabs for Bureau, status, ageing, disposal, overlap outcomes.
6. **Admin and audit:** config, import, audit log, data-quality list.
Footer on every screen: "Synthetic demo data".

## 12. Non-functional requirements
- List and dashboard calls respond in under 1 second on the seeded data (target; measure it).
- Every input validated by Pydantic; clear error messages.
- No hard-coded secrets or URLs; `.env` is not committed.
- Basic accessibility: contrast, keyboard navigation for the main flows, labels on controls.
- Empty, loading and error states on every screen.

## 13. Success metrics (all measured, none promised)
- Planted overlaps found: X of Y on the test set.
- Precision and recall at Medium or above vs baseline.
- Dashboard totals equal list totals on 10 spot checks.
- Demo finishes in 3 minutes, three clean runs in a row.

## 14. Assumptions to verify with the problem owner
Statuses; SLA definitions; authoritative institution ID and how missing IDs are handled; how RB, PGRC and others distinguish duplicate from related; roles and document permissions; notification channel; existing systems and data access. **All of ours are labelled "assumption".**

## 15. Risks

| Risk | Mitigation | Owner |
|---|---|---|
| Matching seen as "just keyword search" | Show reasons and measured precision gain over baseline | Adarsh |
| Data blocks everyone | Seeded DB tonight; Rohitha reviews it | Shreeshanth |
| Frontend waits on backend | Mock JSON from the contract on day one | Adarsh, Satya |
| Late integration | Full flow run every day from Sunday | Sohana |
| Overclaiming | Only measured numbers; everything else "target" | Priya |
| Demo failure | Recorded backup video; rehearsal x3 | Priya |
| Free tiers sleep or fail | Warm the backend before the demo; local fallback | Sohana |

## 16. Working rules
1. One phase at a time; short plan, lead "ok", then code.
2. **Verify, don't trust.** Evidence is a screenshot, a query result or test output.
3. One branch per person (`feat/<name>-<topic>`); pull request reviewed by Adarsh; merge to `main`.
4. Commit after each verified step. Never commit `.env`, `node_modules`, `__pycache__`, `*.db`.
5. UI shows resolved fields (institution name from the institution), never raw placeholder values.
6. One source of counts: the case table.
7. Daily sync, 15 minutes: done, doing, blocked.
8. `PROGRESS.md` lists verified vs unverified items after each phase.

## 17. Definition of done (every phase)
- [ ] Acceptance checks in the owner's PRD pass, with evidence attached
- [ ] Reviewed by Adarsh and merged
- [ ] No hard-coded secrets or URLs
- [ ] `PROGRESS.md` updated
- [ ] No placeholder or raw values on screen

## 18. Phases and schedule
Phases 0-18 as listed in `CASEBRIDGE_TEAM_PLAN.md`. Day-by-day ownership:

| Day | Adarsh | Rohitha | Sohana | Shreeshanth | Satya | Priya |
|---|---|---|---|---|---|---|
| **Fri 23** | Repo, schema, contract, mock JSON (0, 2) | Assumptions (1); CRUD scaffold (5) | Backend scaffold; events endpoints (6) | Generator + seeded DB (4) | Wireframes + design system (8) | PPT outline; slides 1-2 |
| **Sat 24** | Overlap stage 1, start stage 2 (11, 12) | CRUD + profile endpoint (5) | Workflow, alert logic (6, 14) | Labelled pairs; search/filters (7) | Shell + dashboard (9); queue layout (13) | Slides 3-6 draft; case list/detail (10) |
| **Sun 25** | Similarity + eval numbers (12) | References; data/CRUD fixes | Reports (15); mock roles (16) | Data-quality checks; tests | Overlap queue UI (13) | Institution profile (10); alerts/reports UI; PPT v2 |
| **Mon 26** | Integration; end-to-end | Bug fixes | Integration; regression start | Bug triage, retests | Polish; states | PPT v3 with screenshots + eval; demo script. **Freeze 9 pm** |
| **Tue 27** | Regression x3 on clean clone | Bug fixes; docs | Deploy | Final checklist | Demo video | PPT final review; rehearse. **Finishing status 6 pm** |
| **Wed 28** | Support | Support | Support | Support | Support | **Submit PPT before noon.** No code changes |

## 19. Demo script (3 minutes)
1. Open Example Institute (DEMO-1042): profile with its PGRC and RB cases.
2. Dashboard: pending and overdue counts, Bureau workload.
3. Overlap queue: why `PG-2026-00104` and `RB-2026-00219` were flagged (reasons shown).
4. As Coordinator: mark **related**, link them, no merge or close.
5. Add a coordination note; show the timestamped history on both cases.
6. Back to the report: updated counts and ageing.

## 20. Glossary
RB: Regulation Bureau. PGRC: Public Grievance Redressal Cell. SLA: service-level timeline. FS: not used. Overlap: two cases about the same institution in different Bureaus/Cells that may need coordination. Related is not the same as duplicate.
