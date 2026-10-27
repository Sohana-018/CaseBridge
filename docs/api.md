# CaseBridge API (v1)
Generated from the running app's OpenAPI (`/openapi.json`) on 27 Oct 2026. Interactive docs: `/docs`.

## Conventions
- Base path `/api/v1`. JSON only. Dates are ISO 8601 (`YYYY-MM-DD`).
- Auth: `Authorization: Bearer <token>`. Get a token from `POST /auth/login` (username + password).
  `POST /auth/mock-login` and `GET /auth/demo-accounts` exist **only when `ALLOW_DEMO_LOGIN=true`** and never issue the administrator role.
- Missing or invalid token returns **401**. A role without permission returns **403**, checked before the body is validated.
- Errors use one shape: `{"error": {"code": "NOT_FOUND", "message": "...", "details": {}}}`.
  Codes: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `VALIDATION_ERROR` (422).
- List responses: `{"items": [...], "total": n, "page": 1, "page_size": 20}`.
- Case events are append-only: `PUT`, `PATCH` and `DELETE` on an event return **405**.
- `overdue` is derived (`expected_disposal_date < today` and status not disposed), never stored.
- `received_date` in the future is rejected (422).
- Roles: `bureau_officer` (own Bureau full access; other Bureaus summary only), `coordinator`, `senior_management` (read-only), `administrator`. See `docs/assumptions.md` for the permission matrix.

## Endpoints

### Auth

**`GET /api/v1/auth/demo-accounts`**: Get pre-seeded demo accounts for one-click judging demo

**`POST /api/v1/auth/login`**: Real User Authentication with username & password

  Body `RealLoginRequest`:

| Field | Type | Required |
|---|---|---|
| `username` | string | yes |
| `password` | string | yes |

**`POST /api/v1/auth/mock-login`**: Mock Login endpoint returning demo JWT and user profile

  Body `LoginRequest`:

| Field | Type | Required |
|---|---|---|
| `role` | string | yes |
| `bureau` | string (optional) | no |
| `name` | string (optional) | no |

### Current user

**`GET /api/v1/me`**: Get current authenticated user profile

### Institutions

**`GET /api/v1/institutions`**: List institutions with search and region filtering

  Parameters: `query` (query), `region` (query), `page` (query), `page_size` (query)

**`GET /api/v1/institutions/{permanent_id}`**: Get institution profile with consolidated cases and open overlaps

  Parameters: `permanent_id` (path, required)

### Cases

**`GET /api/v1/cases`**: List cases with combinable search and filters

  Parameters: `query` (query), `search` (query), `institution` (query), `bureau` (query), `region` (query), `category` (query), `status` (query), `date_from` (query), `date_to` (query), `overdue` (query), `page` (query), `page_size` (query)

**`POST /api/v1/cases`**: Create a new case (case_no auto-generated)

  Body `CaseCreate`:

| Field | Type | Required |
|---|---|---|
| `permanent_id` | string | yes |
| `bureau` | enum: RB | PGRC | RO | OC | yes |
| `category` | enum: infrastructure | faculty | fee_refund | admission | approval | examination | other | yes |
| `description` | string | yes |
| `received_date` | string (date) | yes |
| `assigned_officer` | string (optional) | no |
| `next_action` | string (optional) | no |
| `expected_disposal_date` | string (date) (optional) | no |
| `priority` | enum: low | medium | high | no |

**`GET /api/v1/cases/{case_no}`**: Get case details by case number

  Parameters: `case_no` (path, required)

**`PATCH /api/v1/cases/{case_no}`**: Update editable case fields

  Parameters: `case_no` (path, required)

  Body `CasePatch`:

| Field | Type | Required |
|---|---|---|
| `next_action` | string (optional) | no |
| `expected_disposal_date` | string (date) (optional) | no |
| `assigned_officer` | string (optional) | no |
| `priority` | enum: low | medium | high (optional) | no |
| `received_date` | string (date) (optional) | no |

**`GET /api/v1/cases/{case_no}/events`**: Get case event timeline

  Parameters: `case_no` (path, required)

**`POST /api/v1/cases/{case_no}/events`**: Append a new event to a case

  Parameters: `case_no` (path, required)

  Body `EventCreate`:

| Field | Type | Required |
|---|---|---|
| `event_type` | enum: created | status_change | transfer | escalation | remark | link | review | yes |
| `to_status` | enum: pending | under_process | disposed | transferred | escalated (optional) | no |
| `to_bureau` | enum: RB | PGRC | RO | OC (optional) | no |
| `remarks` | string (optional) | no |
| `attachment_ref` | string (optional) | no |

**`PUT /api/v1/cases/{case_no}/events/{event_id}`**: Disallowed Event Mutation

**`DELETE /api/v1/cases/{case_no}/events/{event_id}`**: Disallowed Event Mutation

**`PATCH /api/v1/cases/{case_no}/events/{event_id}`**: Disallowed Event Mutation

### Overlaps

**`GET /api/v1/overlaps`**: List flagged overlapping case pairs

  Parameters: `review_status` (query), `band` (query), `page` (query), `page_size` (query)

**`GET /api/v1/overlaps/manual-verification`**: List cases and institutions requiring manual verification (missing or conflicting permanent_id)
  
_Access: coordinator, administrator_

**`POST /api/v1/overlaps/scan`**: Re-run overlap detection
  
_Access: coordinator, administrator_

**`GET /api/v1/overlaps/{link_id}`**: Get one overlap pair with both cases

  Parameters: `link_id` (path, required)

**`POST /api/v1/overlaps/{link_id}/review`**: Record a review decision on an overlap pair
  
_Access: coordinator only_

  Parameters: `link_id` (path, required)

  Body `OverlapReviewRequest`:

| Field | Type | Required |
|---|---|---|
| `decision` | enum: open | related | duplicate | not_related | needs_review | yes |
| `note` | string (optional) | no |

### Alerts

**`GET /api/v1/alerts`**: List alerts with filters

  Parameters: `type` (query), `status` (query), `case_no` (query), `page` (query), `page_size` (query)

**`POST /api/v1/alerts/refresh`**: Trigger alert rules evaluation

**`POST /api/v1/alerts/{id}/ack`**: Acknowledge an alert

  Parameters: `id` (path, required)

### Dashboard

**`GET /api/v1/dashboard/summary`**: Dashboard KPI Summary Counts

**`GET /api/v1/dashboard/workload`**: Bureau Workload Distribution

### Reports

**`GET /api/v1/reports/{kind}`**: Get Consolidated Report by Kind

  Parameters: `kind` (path, required)

**`GET /api/v1/reports/{kind}/csv`**: Export Consolidated Report as CSV

  Parameters: `kind` (path, required)

### Admin

**`GET /api/v1/admin/audit-logs`**: View chronological audit logs
  
_Access: administrator only_

  Parameters: `limit` (query)

**`GET /api/v1/admin/config`**: Get all system configuration items
  
_Access: administrator only_

**`PUT /api/v1/admin/config`**: Update system configuration items
  
_Access: administrator only_

  Body `UpdateConfigRequest`:

| Field | Type | Required |
|---|---|---|
| `configs` | object | yes |

**`GET /api/v1/admin/health-summary`**: Get system health and data quality metrics
  
_Access: administrator only_

**`POST /api/v1/admin/scan-overlaps`**: Trigger full overlap scan
  
_Access: administrator only_

**`GET /api/v1/admin/users`**: List all system users
  
_Access: administrator only_

**`POST /api/v1/admin/users`**: Create a new user
  
_Access: administrator only_

  Body `CreateUserRequest`:

| Field | Type | Required |
|---|---|---|
| `username` | string | yes |
| `name` | string | yes |
| `role` | string | yes |
| `bureau` | string (optional) | no |
| `email` | string (optional) | no |
| `password` | string | yes |

**`POST /api/v1/admin/users/{user_id}/reset-password`**: Reset password for a user
  
_Access: administrator only_

  Parameters: `user_id` (path, required)

  Body `ResetPasswordRequest`:

| Field | Type | Required |
|---|---|---|
| `new_password` | string | yes |

**`PATCH /api/v1/admin/users/{user_id}/status`**: Toggle user active status
  
_Access: administrator only_

  Parameters: `user_id` (path, required)

  Body `UpdateUserStatusRequest`:

| Field | Type | Required |
|---|---|---|
| `is_active` | boolean | yes |

### Health

**`GET /api/v1/health`**: Health Check

## Data shapes
Full response schemas are in `/docs`. Main objects: `CaseRead`, `EventRead`, `OverlapRead` (with `band`, `reasons[]`, `review_status`), `AlertRead`, `InstitutionDetailRead`.

Dashboard summary: `{"total", "pending", "under_process", "disposed", "transferred", "escalated", "overdue", "open_overlaps"}`.
`open_overlaps` counts only open **High** and **Medium** pairs.

## Overlap bands
High: shared reference, or text similarity at or above the High threshold with same/related category. Medium: text similarity at or above the Medium threshold. Low: same institution, different Bureau only. Thresholds are in `backend/app/services/overlap.py` and were tuned on synthetic data; see `docs/eval.md`.
