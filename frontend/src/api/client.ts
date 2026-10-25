const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

// In-memory token storage (PRD Section 3 / User Prompt #1)
let inMemoryToken: string | null = null;
let currentUserProfile: UserPayload | null = null;
let loginPromise: Promise<string> | null = null;

export interface UserPayload {
  name: string;
  role: string;
  bureau?: string | null;
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

export interface OverlapItem {
  id: number;
  band: ConfidenceBand;
  review_status: ReviewStatus;
  reasons: string[];
  case_a: OverlapCaseMini;
  case_b: OverlapCaseMini;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  note?: string | null;
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
  band?: ConfidenceBand | '';
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

/**
 * Perform auto-login on app start or demand.
 * Obtains demo coordinator JWT token and keeps it in memory.
 */
export async function autoLogin(role: string = 'coordinator'): Promise<LoginResponse> {
  if (inMemoryToken && currentUserProfile) {
    return { token: inMemoryToken, user: currentUserProfile };
  }

  if (loginPromise) {
    await loginPromise;
    return { token: inMemoryToken!, user: currentUserProfile! };
  }

  loginPromise = (async () => {
    const res = await rawRequest<LoginResponse>('/api/v1/auth/mock-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role }),
    });

    inMemoryToken = res.token;
    currentUserProfile = res.user;
    return res.token;
  })();

  try {
    await loginPromise;
    return { token: inMemoryToken!, user: currentUserProfile! };
  } finally {
    loginPromise = null;
  }
}

export function getCurrentUser(): UserPayload | null {
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
      let errorMsg = `Request failed with HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.error?.message) {
          errorMsg = errJson.error.message;
        }
      } catch {
        // use default error message
      }
      throw new Error(errorMsg);
    }
    return await res.json();
  } catch (err: unknown) {
    // Attempt IPv4 fallback if localhost connection failed
    if (primaryUrl.includes('localhost:8000')) {
      try {
        const fallbackUrl = primaryUrl.replace('localhost:8000', '127.0.0.1:8000');
        const fallbackRes = await fetch(fallbackUrl, { ...options, headers });
        if (fallbackRes.ok) {
          return await fallbackRes.json();
        }
      } catch {
        // Fall through to original error
      }
    }
    throw err;
  }
}

/**
 * Authenticated API request helper.
 * Automatically injects Bearer token in memory.
 */
export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (!inMemoryToken) {
    await autoLogin();
  }

  const authHeaders: Record<string, string> = {
    'Authorization': `Bearer ${inMemoryToken}`,
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    return await rawRequest<T>(endpoint, { ...options, headers: authHeaders });
  } catch (err: any) {
    // If token expired or forbidden, attempt one re-login and retry
    if (err.message && err.message.toLowerCase().includes('token')) {
      inMemoryToken = null;
      await autoLogin();
      authHeaders['Authorization'] = `Bearer ${inMemoryToken}`;
      return await rawRequest<T>(endpoint, { ...options, headers: authHeaders });
    }
    throw err;
  }
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

export async function getCaseDetail(caseNo: string): Promise<CaseItem> {
  return apiFetch<CaseItem>(`/api/v1/cases/${encodeURIComponent(caseNo)}`);
}

export async function getCaseEvents(caseNo: string): Promise<CaseEvent[]> {
  return apiFetch<CaseEvent[]>(`/api/v1/cases/${encodeURIComponent(caseNo)}/events`);
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

