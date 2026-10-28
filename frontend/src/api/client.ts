const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

const STORAGE_KEY_TOKEN = 'casebridge_token';
const STORAGE_KEY_USER = 'casebridge_user';

// Token storage synchronized with localStorage
let inMemoryToken: string | null = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_TOKEN) : null;
let currentUserProfile: UserPayload | null = null;
try {
  const cachedUser = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_USER) : null;
  if (cachedUser) {
    currentUserProfile = JSON.parse(cachedUser);
  }
} catch {
  // ignore json error
}
let loginPromise: Promise<string> | null = null;

export interface UserPayload {
  name: string;
  role: string;
  bureau?: string | null;
  username?: string | null;
}

export interface LoginResponse {
  token: string;
  user: UserPayload;
}

export interface DashboardSummary {
  total: number;
  pending: number;
  under_process: number;
  disposed: number;
  transferred: number;
  escalated: number;
  overdue: number;
  open_overlaps: number;
}

export interface BureauWorkload {
  bureau: string;
  total: number;
  open: number;
  overdue: number;
}

export interface AlertItem {
  id: number;
  type: string;
  case_id?: number | null;
  case_no?: string | null;
  link_id?: number | null;
  message: string;
  priority: string;
  status: string;
  created_at: string;
  due_at?: string | null;
}

export interface AlertListResponse {
  items: AlertItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface Institution {
  id: number;
  permanent_id: string;
  name: string;
  address?: string | null;
  region: string;
  state?: string | null;
  type?: string | null;
}

export interface InstitutionListResponse {
  items: Institution[];
  total: number;
  page: number;
  page_size: number;
}

export interface CaseItem {
  case_no: string;
  institution?: {
    permanent_id: string;
    name: string;
    region: string;
  };
  bureau: string;
  category: string;
  description?: string;
  received_date: string;
  status: string;
  assigned_officer?: string | null;
  last_action?: string | null;
  last_action_date?: string | null;
  next_action?: string | null;
  expected_disposal_date?: string | null;
  overdue?: boolean;
  priority?: string;
  complainant_name?: string | null;
  complainant_email?: string | null;
}

export interface CaseQueryParams {
  query?: string;
  search?: string;
  institution?: string;
  bureau?: string;
  region?: string;
  category?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  overdue?: boolean | string;
  page?: number;
  page_size?: number;
}

export interface CaseListResponse {
  items: CaseItem[];
  total: number;
  page: number;
  page_size: number;
}

export type ConfidenceBand = 'high' | 'medium' | 'low';

export type ReviewStatus =
  | 'open'
  | 'related'
  | 'duplicate'
  | 'not_related'
  | 'needs_review';

export type ReviewDecision =
  | 'related'
  | 'duplicate'
  | 'not_related'
  | 'needs_review';

export interface OverlapCaseMini {
  case_no: string;
  bureau: string;
  status: string;
}

export interface BureauWorkSummary {
  bureau: string;
  case_no: string;
  status: string;
  events_count: number;
  has_officer: boolean;
  assigned_officer?: string | null;
  days_active: number;
  work_score: number;
  stage_label: string;
  summary: string;
}

export interface BureauRecommendation {
  recommended_bureau: string;
  confidence_percentage: number;
  recommendation_reason: string;
  work_summary_a: BureauWorkSummary;
  work_summary_b: BureauWorkSummary;
}

export interface OverlapInstitutionMini {
  id?: number | null;
  permanent_id?: string | null;
  name?: string | null;
}

export interface OverlapItem {
  id: number;
  band: ConfidenceBand;
  review_status: ReviewStatus;
  reasons: string[];
  case_a: OverlapCaseMini;
  case_b: OverlapCaseMini;
  institution?: OverlapInstitutionMini | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  note?: string | null;
  likelihood_percentage?: number | null;
  recommendation?: BureauRecommendation | null;
}

export interface OverlapListResponse {
  items: OverlapItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface OverlapScanResponse {
  created: number;
}

export interface OverlapReviewPayload {
  decision: ReviewDecision;
  note?: string | null;
}

export interface OverlapQueryParams {
  review_status?: ReviewStatus | '';
  band?: ConfidenceBand | 'actionable' | 'all' | '';
  page?: number;
  page_size?: number;
}

export interface InstitutionDetail extends Institution {
  cases: CaseItem[];
  open_overlaps: OverlapItem[];
}

export interface CaseEvent {
  id: number;
  ts: string;
  actor: string;
  bureau: string;
  event_type: string;
  from_bureau?: string | null;
  to_bureau?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  remarks?: string | null;
  attachment_ref?: string | null;
}

const LOCAL_STORAGE_ROLE_KEY = 'casebridge_selected_role';

export interface RoleConfig {
  id: string;
  label: string;
  role: string;
  bureau?: string | null;
}

export const ROLE_OPTIONS: RoleConfig[] = [
  { id: 'coordinator', label: 'Coordinator', role: 'coordinator' },
  { id: 'bureau_officer:RB', label: 'Officer · RB', role: 'bureau_officer', bureau: 'RB' },
  { id: 'bureau_officer:PGRC', label: 'Officer · PGRC', role: 'bureau_officer', bureau: 'PGRC' },
  { id: 'bureau_officer:RO', label: 'Officer · RO (Regional)', role: 'bureau_officer', bureau: 'RO' },
  { id: 'bureau_officer:OC', label: 'Officer · OC', role: 'bureau_officer', bureau: 'OC' },
  { id: 'senior_management', label: 'Senior Mgmt / Competent Authority', role: 'senior_management' },
  { id: 'administrator', label: 'Administrator', role: 'administrator' },
];

export function getSelectedRoleId(): string {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_ROLE_KEY);
    if (saved && ROLE_OPTIONS.some((opt) => opt.id === saved)) {
      return saved;
    }
  } catch {
    // localStorage unavailable
  }
  return 'coordinator';
}

export function setSelectedRoleId(roleId: string): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_ROLE_KEY, roleId);
  } catch {
    // ignore storage issues
  }
}

/**
 * Perform login for a demo role on demand when ALLOW_DEMO_LOGIN is enabled.
 * Uses localStorage if role is not explicitly provided, defaulting to coordinator.
 */
export async function autoLogin(role?: string, bureau?: string | null): Promise<LoginResponse> {
  let targetRole = role;
  let targetBureau = bureau;

  if (!targetRole) {
    const roleId = getSelectedRoleId();
    const matched = ROLE_OPTIONS.find((opt) => opt.id === roleId) || ROLE_OPTIONS[0];
    targetRole = matched.role;
    targetBureau = matched.bureau;
  }

  if (
    inMemoryToken &&
    currentUserProfile &&
    currentUserProfile.role === targetRole &&
    (currentUserProfile.bureau || null) === (targetBureau || null)
  ) {
    return { token: inMemoryToken, user: currentUserProfile };
  }

  if (loginPromise) {
    await loginPromise;
    if (
      inMemoryToken &&
      currentUserProfile &&
      currentUserProfile.role === targetRole &&
      (currentUserProfile.bureau || null) === (targetBureau || null)
    ) {
      return { token: inMemoryToken, user: currentUserProfile };
    }
  }

  loginPromise = (async () => {
    const bodyPayload: Record<string, string> = { role: targetRole! };
    if (targetBureau) {
      bodyPayload.bureau = targetBureau;
    }

    const res = await rawRequest<LoginResponse>('/api/v1/auth/mock-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    inMemoryToken = res.token;
    currentUserProfile = res.user;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_TOKEN, res.token);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(res.user));
    }
    return res.token;
  })();

  try {
    await loginPromise;
    return { token: inMemoryToken!, user: currentUserProfile! };
  } finally {
    loginPromise = null;
  }
}

/**
 * Switch role: stores selection in localStorage, clears current token, and logs in.
 */
export async function switchRole(roleId: string): Promise<LoginResponse> {
  const target = ROLE_OPTIONS.find((opt) => opt.id === roleId);
  if (!target) {
    throw new Error(`Unknown role option: ${roleId}`);
  }

  setSelectedRoleId(target.id);
  inMemoryToken = null;
  currentUserProfile = null;

  return await autoLogin(target.role, target.bureau);
}

export async function loginWithCredentials(username: string, password: string): Promise<LoginResponse> {
  const res = await rawRequest<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  inMemoryToken = res.token;
  currentUserProfile = res.user;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_TOKEN, res.token);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(res.user));
  }
  return res;
}

/**
 * Lightweight health check helper to verify backend connectivity.
 * Probes /api/v1/health with fallback to /health and IPv4 localhost.
 */
export async function checkServerHealth(timeoutMs = 3500): Promise<boolean> {
  const urls = [
    `${API_BASE_URL}/api/v1/health`,
    `${API_BASE_URL}/health`,
  ];
  if (API_BASE_URL.includes('localhost:8000')) {
    urls.push(
      `${API_BASE_URL.replace('localhost:8000', '127.0.0.1:8000')}/api/v1/health`,
      `${API_BASE_URL.replace('localhost:8000', '127.0.0.1:8000')}/health`
    );
  }

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(id);
      if (res.ok) {
        return true;
      }
    } catch {
      // Try next fallback URL
    }
  }
  return false;
}

export function logout(): void {
  inMemoryToken = null;
  currentUserProfile = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
  }
}

export function getToken(): string | null {
  if (!inMemoryToken && typeof window !== 'undefined') {
    inMemoryToken = localStorage.getItem(STORAGE_KEY_TOKEN);
  }
  return inMemoryToken;
}

export function getCurrentUser(): UserPayload | null {
  if (!currentUserProfile && typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_USER);
      if (cached) {
        currentUserProfile = JSON.parse(cached);
      }
    } catch {
      // ignore json error
    }
  }
  return currentUserProfile;
}

/**
 * Underlying request helper with URL resolution and IPv6/IPv4 fallback for local dev.
 */
async function rawRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const primaryUrl = `${API_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(primaryUrl, { ...options, headers });
    if (!res.ok) {
      if (res.status === 401) {
        logout();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        throw new Error('Authentication session expired or invalid. Please sign in.');
      }

      let errorMsg = `Request failed with HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (typeof errJson?.error?.message === 'string') {
          errorMsg = errJson.error.message;
          if (Array.isArray(errJson?.error?.details) && errJson.error.details.length > 0) {
            const detailMsgs = errJson.error.details
              .map((d: any) => (typeof d === 'string' ? d : d.msg || JSON.stringify(d)))
              .join('; ');
            errorMsg = `${errorMsg}: ${detailMsgs}`;
          }
        } else if (typeof errJson?.error === 'string') {
          errorMsg = errJson.error;
        } else if (typeof errJson?.message === 'string') {
          errorMsg = errJson.message;
        } else if (errJson?.detail) {
          errorMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch {
        // use default error message
      }
      throw new Error(errorMsg);
    }
    return await res.json();
  } catch (err: unknown) {
    // Attempt IPv4 fallback only if connection/network failed
    if (err instanceof TypeError && primaryUrl.includes('localhost:8000')) {
      try {
        const fallbackUrl = primaryUrl.replace('localhost:8000', '127.0.0.1:8000');
        const fallbackRes = await fetch(fallbackUrl, { ...options, headers });
        if (fallbackRes.ok) {
          return await fallbackRes.json();
        }
        if (fallbackRes.status === 401) {
          logout();
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          throw new Error('Authentication session expired or invalid. Please sign in.');
        }
        let fbErrorMsg = `Request failed with HTTP ${fallbackRes.status}`;
        try {
          const errJson = await fallbackRes.json();
          if (typeof errJson?.error?.message === 'string') {
            fbErrorMsg = errJson.error.message;
          } else if (typeof errJson?.error === 'string') {
            fbErrorMsg = errJson.error;
          } else if (typeof errJson?.message === 'string') {
            fbErrorMsg = errJson.message;
          } else if (errJson?.detail) {
            fbErrorMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
          }
        } catch {
          // ignore
        }
        throw new Error(fbErrorMsg);
      } catch (fbErr) {
        throw fbErr;
      }
    }
    throw err;
  }
}

/**
 * Authenticated API request helper.
 * Injects Bearer token from localStorage or in-memory session.
 */
export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const authHeaders: Record<string, string> = {
    'Authorization': token ? `Bearer ${token}` : '',
    ...(options.headers as Record<string, string> || {}),
  };

  return await rawRequest<T>(endpoint, { ...options, headers: authHeaders });
}

// ============================================================================
// Endpoint wrappers
// ============================================================================

export interface HealthResponse {
  status: string;
}

export async function getHealthStatus(): Promise<HealthResponse> {
  return rawRequest<HealthResponse>('/api/v1/health');
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>('/api/v1/dashboard/summary');
}

export async function getDashboardWorkload(): Promise<BureauWorkload[]> {
  return apiFetch<BureauWorkload[]>('/api/v1/dashboard/workload');
}

export async function getRecentAlerts(pageSize: number = 5): Promise<AlertListResponse> {
  return apiFetch<AlertListResponse>(`/api/v1/alerts?status=open&page=1&page_size=${pageSize}`);
}

export async function getInstitutions(query?: string, page: number = 1, pageSize: number = 20): Promise<InstitutionListResponse> {
  const params = new URLSearchParams();
  if (query && query.trim()) {
    params.set('query', query.trim());
  }
  params.set('page', page.toString());
  params.set('page_size', pageSize.toString());

  return apiFetch<InstitutionListResponse>(`/api/v1/institutions?${params.toString()}`);
}

export async function getInstitutionDetail(permanentId: string): Promise<InstitutionDetail> {
  return apiFetch<InstitutionDetail>(`/api/v1/institutions/${encodeURIComponent(permanentId)}`);
}

export async function getCases(params?: CaseQueryParams): Promise<CaseListResponse> {
  const searchParams = new URLSearchParams();
  const searchVal = params?.query || params?.search;
  if (searchVal && searchVal.trim()) {
    searchParams.set('search', searchVal.trim());
  }
  if (params?.institution && params.institution.trim()) {
    searchParams.set('institution', params.institution.trim());
  }
  if (params?.bureau && params.bureau.trim()) {
    searchParams.set('bureau', params.bureau.trim());
  }
  if (params?.region && params.region.trim()) {
    searchParams.set('region', params.region.trim());
  }
  if (params?.category && params.category.trim()) {
    searchParams.set('category', params.category.trim());
  }
  if (params?.status && params.status.trim()) {
    searchParams.set('status', params.status.trim());
  }
  if (params?.date_from && params.date_from.trim()) {
    searchParams.set('date_from', params.date_from.trim());
  }
  if (params?.date_to && params.date_to.trim()) {
    searchParams.set('date_to', params.date_to.trim());
  }
  if (params?.overdue !== undefined && params.overdue !== '' && params.overdue !== null) {
    searchParams.set('overdue', String(params.overdue));
  }
  if (params?.page) {
    searchParams.set('page', params.page.toString());
  }
  if (params?.page_size) {
    searchParams.set('page_size', params.page_size.toString());
  }

  const qs = searchParams.toString();
  return apiFetch<CaseListResponse>(`/api/v1/cases${qs ? `?${qs}` : ''}`);
}

export async function getCaseDetail(caseNo: string): Promise<CaseItem> {
  return apiFetch<CaseItem>(`/api/v1/cases/${encodeURIComponent(caseNo)}`);
}

export async function getCaseEvents(caseNo: string): Promise<CaseEvent[]> {
  return apiFetch<CaseEvent[]>(`/api/v1/cases/${encodeURIComponent(caseNo)}/events`);
}

export interface CaseCreatePayload {
  permanent_id: string;
  bureau: string;
  category: string;
  description: string;
  received_date: string;
  assigned_officer?: string | null;
  next_action?: string | null;
  expected_disposal_date?: string | null;
  priority?: string;
  complainant_name?: string | null;
  complainant_email?: string | null;
}

export async function createCase(payload: CaseCreatePayload): Promise<CaseItem> {
  return apiFetch<CaseItem>('/api/v1/cases', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function getOverlaps(params?: OverlapQueryParams): Promise<OverlapListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.review_status) {
    searchParams.set('review_status', params.review_status);
  }
  if (params?.band) {
    searchParams.set('band', params.band);
  }
  if (params?.page) {
    searchParams.set('page', params.page.toString());
  }
  if (params?.page_size) {
    searchParams.set('page_size', params.page_size.toString());
  }

  const qs = searchParams.toString();
  return apiFetch<OverlapListResponse>(`/api/v1/overlaps${qs ? `?${qs}` : ''}`);
}

export async function getOverlapDetail(id: number): Promise<OverlapItem> {
  return apiFetch<OverlapItem>(`/api/v1/overlaps/${id}`);
}

export async function scanOverlaps(): Promise<OverlapScanResponse> {
  return apiFetch<OverlapScanResponse>('/api/v1/overlaps/scan', {
    method: 'POST',
  });
}

export async function submitOverlapReview(
  id: number,
  payload: OverlapReviewPayload
): Promise<OverlapItem> {
  return apiFetch<OverlapItem>(`/api/v1/overlaps/${id}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export interface ReportItem {
  label: string;
  count: number;
  bucket?: string;
  permanent_id?: string;
  name?: string;
}

export interface ReportData {
  kind: string;
  items: ReportItem[];
  total: number;
  disposed?: number;
  disposal_rate?: number;
}

export interface PeriodicSummary {
  total_cases: number;
  disposed_cases: number;
  open_cases: number;
  disposal_rate: number;
}

export interface PeriodicStatusItem {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

export interface PeriodicCategoryItem {
  category: string;
  label: string;
  count: number;
  percentage: number;
}

export interface PeriodicInstitutionItem {
  institution_id?: number | null;
  permanent_id: string;
  name: string;
  label: string;
  count: number;
  percentage: number;
}

export interface PeriodicResolutionStats {
  total_cases: number;
  resolved_cases: number;
  open_cases: number;
  has_resolved_cases?: boolean;
  avg_days: number;
  median_days: number;
  min_days: number;
  max_days: number;
  within_sla_count: number;
  sla_compliance_rate: number;
  sla_compliance_display?: string;
  cohort_basis?: string;
}

export interface PeriodicReportData {
  period: 'daily' | 'monthly' | 'quarterly' | 'custom';
  period_label: string;
  start_date: string;
  end_date: string;
  total_cases: number;
  summary: PeriodicSummary;
  by_status: PeriodicStatusItem[];
  by_category: PeriodicCategoryItem[];
  by_institution: PeriodicInstitutionItem[];
  resolution_stats: PeriodicResolutionStats;
}

export interface PeriodicReportParams {
  period: 'daily' | 'monthly' | 'quarterly' | 'custom';
  date?: string;
  year?: number;
  month?: number;
  quarter?: number;
  start_date?: string;
  end_date?: string;
}

export async function getReport(kind: string): Promise<ReportData> {
  return apiFetch<ReportData>(`/api/v1/reports/${encodeURIComponent(kind)}`);
}

export async function getPeriodicReport(params: PeriodicReportParams): Promise<PeriodicReportData> {
  const query = new URLSearchParams();
  query.set('period', params.period);
  if (params.date) query.set('date', params.date);
  if (params.year) query.set('year', String(params.year));
  if (params.month) query.set('month', String(params.month));
  if (params.quarter) query.set('quarter', String(params.quarter));
  if (params.start_date) query.set('start_date', params.start_date);
  if (params.end_date) query.set('end_date', params.end_date);

  return apiFetch<PeriodicReportData>(`/api/v1/reports/periodic?${query.toString()}`);
}

export async function downloadReportCsv(kind: string): Promise<void> {
  const token = inMemoryToken || (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_TOKEN) : null);
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = `${API_BASE_URL}/api/v1/reports/${encodeURIComponent(kind)}/csv`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to export CSV: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `casebridge_report_${kind}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

export async function downloadPeriodicReportCsv(params: PeriodicReportParams): Promise<void> {
  const token = inMemoryToken || (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_TOKEN) : null);
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const query = new URLSearchParams();
  query.set('period', params.period);
  if (params.date) query.set('date', params.date);
  if (params.year) query.set('year', String(params.year));
  if (params.month) query.set('month', String(params.month));
  if (params.quarter) query.set('quarter', String(params.quarter));
  if (params.start_date) query.set('start_date', params.start_date);
  if (params.end_date) query.set('end_date', params.end_date);

  const url = `${API_BASE_URL}/api/v1/reports/periodic/csv?${query.toString()}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to export CSV: HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  const contentDisp = res.headers.get('content-disposition');
  let filename = `casebridge_periodic_report_${params.period}.csv`;
  if (contentDisp) {
    const match = contentDisp.match(/filename="?([^"]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

export interface PostEventPayload {
  event_type: 'status_change' | 'transfer' | 'escalation' | 'remark';
  to_status?: string | null;
  to_bureau?: string | null;
  remarks?: string | null;
  attachment_ref?: string | null;
}

export interface PatchCasePayload {
  next_action?: string | null;
  expected_disposal_date?: string | null;
  assigned_officer?: string | null;
  priority?: 'low' | 'medium' | 'high' | null;
}

export async function postCaseEvent(caseNo: string, payload: PostEventPayload): Promise<CaseEvent> {
  return apiFetch<CaseEvent>(`/api/v1/cases/${encodeURIComponent(caseNo)}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function patchCase(caseNo: string, payload: PatchCasePayload): Promise<CaseItem> {
  return apiFetch<CaseItem>(`/api/v1/cases/${encodeURIComponent(caseNo)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

// User Directory & Admin Types and Endpoints

export interface DemoAccount {
  username: string;
  name: string;
  role: string;
  bureau?: string | null;
  badge: string;
  password_hint: string;
}

export interface AdminUser {
  id: number;
  username?: string | null;
  name: string;
  role: string;
  bureau?: string | null;
  email?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CreateAdminUserPayload {
  username: string;
  name: string;
  role: string;
  bureau?: string | null;
  email?: string | null;
  password: string;
}

export interface AdminConfigItem {
  key: string;
  value: string;
}

export interface AdminAuditLog {
  id: number;
  case_id: number;
  case_no?: string | null;
  ts: string;
  actor: string;
  bureau: string;
  event_type: string;
  from_bureau?: string | null;
  to_bureau?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  remarks?: string | null;
}

export interface SystemHealthSummary {
  total_users: number;
  total_cases: number;
  total_institutions: number;
  total_overlaps: number;
  open_overlaps: number;
  open_alerts: number;
  unassigned_cases: number;
  cases_missing_deadline: number;
  overdue_cases: number;
  manual_verification_count?: number;
  db_status: string;
}

export interface ManualVerificationItem {
  id: string;
  case_no?: string | null;
  case_id?: number | null;
  institution_id?: number | null;
  institution_name: string;
  permanent_id?: string | null;
  issue_type: string;
  reason: string;
  bureau?: string | null;
  received_date?: string | null;
  status?: string | null;
}

export interface ManualVerificationResponse {
  total: number;
  items: ManualVerificationItem[];
}

export async function getManualVerificationQueue(): Promise<ManualVerificationResponse> {
  return apiFetch<ManualVerificationResponse>('/api/v1/overlaps/manual-verification');
}

export async function getDemoAccounts(): Promise<DemoAccount[]> {
  return rawRequest<DemoAccount[]>('/api/v1/auth/demo-accounts');
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  return apiFetch<AdminUser[]>('/api/v1/admin/users');
}

export async function createAdminUser(payload: CreateAdminUserPayload): Promise<AdminUser> {
  return apiFetch<AdminUser>('/api/v1/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function toggleAdminUserStatus(userId: number, isActive: boolean): Promise<AdminUser> {
  return apiFetch<AdminUser>(`/api/v1/admin/users/${userId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ is_active: isActive }),
  });
}

export async function resetAdminUserPassword(userId: number, newPassword: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/v1/admin/users/${userId}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ new_password: newPassword }),
  });
}

export async function getAdminConfig(): Promise<AdminConfigItem[]> {
  return apiFetch<AdminConfigItem[]>('/api/v1/admin/config');
}

export async function updateAdminConfig(configs: Record<string, string>): Promise<{ message: string; updated: number }> {
  return apiFetch<{ message: string; updated: number }>('/api/v1/admin/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ configs }),
  });
}

export async function getAdminAuditLogs(limit: number = 100): Promise<AdminAuditLog[]> {
  return apiFetch<AdminAuditLog[]>(`/api/v1/admin/audit-logs?limit=${limit}`);
}

export async function getAdminHealthSummary(): Promise<SystemHealthSummary> {
  return apiFetch<SystemHealthSummary>('/api/v1/admin/health-summary');
}

export async function triggerAdminOverlapScan(): Promise<{ message: string; created: number }> {
  return apiFetch<{ message: string; created: number }>('/api/v1/admin/scan-overlaps', {
    method: 'POST',
  });
}



