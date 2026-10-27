import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  getOverlaps,
  scanOverlaps,
  submitOverlapReview,
  getCaseDetail,
  getCurrentUser,
  getManualVerificationQueue,
  type UserPayload,
  type OverlapItem,
  type OverlapListResponse,
  type CaseItem,
  type ManualVerificationItem,
  type ConfidenceBand,
  type ReviewStatus,
  type ReviewDecision,
} from '../api/client';
import {
  ConfidenceBandBadge,
  ReviewStatusBadge,
  BureauBadge,
  StatusChip,
  PriorityChip,
  OverdueBadge,
  RestrictedBadge,
} from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import { formatCategory } from '../utils/formatters';
import { useToast } from '../components/Toast';
import {
  RefreshCw,
  Scan,
  AlertTriangle,
  Calendar,
  User,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Lock,
  Clock,
  Sparkles,
  FileText,
  Link2,
  Copy,
  XCircle,
  HelpCircle,
  ShieldAlert,
  ArrowRight,
  Search,
  Building2,
  ArrowRightLeft,
  Check,
} from 'lucide-react';

// ============================================================================
// Helper: Highlight bracketed reference codes like [Ref: EMERG/TECH/2026-02]
// ============================================================================
function renderHighlightedText(text?: string) {
  if (!text) {
    return <span className="text-slate-400 italic">No description provided</span>;
  }

  // Regex to match bracketed references like [Ref: ...] or [EMERG/...]
  const regex = /(\[[^\]]+\])/g;
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('[') && part.endsWith(']')) {
          return (
            <mark
              key={i}
              className="bg-amber-100 text-amber-900 font-mono text-[11px] px-1.5 py-0.5 rounded font-semibold border border-amber-300 not-italic inline-block my-0.5 shadow-2xs"
            >
              {part}
            </mark>
          );
        }
        return part;
      })}
    </>
  );
}

// ============================================================================
// Helper: Extract metrics and match signals from item & case details
// ============================================================================
function getPairMetrics(
  item: OverlapItem,
  caseA?: CaseItem,
  caseB?: CaseItem
) {
  let similarityPercent: number | null = null;
  let daysApart: number | null = null;
  let hasSamePID = false;
  let hasSameCategory = false;
  let hasSharedRef = false;

  (item.reasons || []).forEach((r) => {
    if (r.startsWith('text_similarity')) {
      const val = parseFloat(r.split(' ')[1] || '0');
      similarityPercent = Math.round(val * 100);
    } else if (r.startsWith('date_proximity')) {
      daysApart = parseInt(r.split(' ')[1] || '0', 10);
    } else if (r === 'same_permanent_id') {
      hasSamePID = true;
    } else if (r === 'same_category') {
      hasSameCategory = true;
    } else if (r === 'shared_reference') {
      hasSharedRef = true;
    }
  });

  // Calculate days apart if not provided in signal
  if (daysApart === null && caseA?.received_date && caseB?.received_date) {
    try {
      const d1 = new Date(caseA.received_date).getTime();
      const d2 = new Date(caseB.received_date).getTime();
      daysApart = Math.round(Math.abs(d1 - d2) / (1000 * 60 * 60 * 24));
    } catch {
      // ignore
    }
  }

  const pid =
    caseA?.institution?.permanent_id ||
    caseB?.institution?.permanent_id ||
    null;

  const instName =
    caseA?.institution?.name ||
    caseB?.institution?.name ||
    null;

  return {
    similarityPercent,
    daysApart,
    hasSamePID,
    hasSameCategory,
    hasSharedRef,
    pid,
    instName,
  };
}

export const OverlapQueuePage: React.FC = () => {
  const { showToast } = useToast();
  const [overlaps, setOverlaps] = useState<OverlapItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(15);
  const [selectedStatus, setSelectedStatus] = useState<ReviewStatus | ''>('open');
  const [selectedBand, setSelectedBand] = useState<ConfidenceBand | ''>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Active pair selection for split-screen detail workspace
  const [activePairId, setActivePairId] = useState<number | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tab view: 'triage' (Split workspace) vs 'governance' (Manual Verification)
  const [viewMode, setViewMode] = useState<'triage' | 'governance'>('triage');

  // Scan state
  const [scanning, setScanning] = useState<boolean>(false);

  // Review interaction state: map of overlapId -> { note: string, submitting: boolean, error: string | null }
  const [reviewForms, setReviewForms] = useState<
    Record<number, { note: string; submitting: boolean; error: string | null }>
  >({});

  // Case details cache
  const [caseDetails, setCaseDetails] = useState<Record<string, CaseItem>>({});
  const [caseLoading, setCaseLoading] = useState<Record<string, boolean>>({});
  const [caseErrors, setCaseErrors] = useState<Record<string, string>>({});
  const ongoingFetches = useRef<Set<string>>(new Set());

  const [currentUser, setCurrentUser] = useState<UserPayload | null>(() => getCurrentUser());
  const isCoordinator = currentUser?.role === 'coordinator';
  const canScan = currentUser?.role === 'coordinator' || currentUser?.role === 'administrator';

  // Manual verification items
  const [manualItems, setManualItems] = useState<ManualVerificationItem[]>([]);
  const [manualLoading, setManualLoading] = useState<boolean>(false);

  const isOfficerOtherBureau = (bureau: string) =>
    currentUser?.role === 'bureau_officer' &&
    Boolean(currentUser?.bureau && bureau && currentUser.bureau.toUpperCase() !== bureau.toUpperCase());

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  const fetchQueue = useCallback(async (isRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res: OverlapListResponse = await getOverlaps({
        review_status: selectedStatus || undefined,
        band: selectedBand || undefined,
        page,
        page_size: pageSize,
      });
      const items = res.items || [];
      setOverlaps(items);
      setTotal(res.total || 0);

      // Default active selection to first unresolved item or first item
      if (items.length > 0) {
        const firstOpen = items.find((o) => o.review_status === 'open');
        setActivePairId(firstOpen ? firstOpen.id : items[0].id);
      } else {
        setActivePairId(null);
      }

      if (isRefresh) {
        showToast('Overlap queue refreshed', 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch overlap pairs';
      setError(msg);
      if (isRefresh) {
        showToast('Failed to refresh overlap queue', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, selectedBand, page, pageSize, showToast]);

  const fetchManualQueue = useCallback(async () => {
    if (!canScan) return;
    setManualLoading(true);
    try {
      const res = await getManualVerificationQueue();
      setManualItems(res.items || []);
    } catch {
      // ignore
    } finally {
      setManualLoading(false);
    }
  }, [canScan]);

  useEffect(() => {
    fetchQueue();
    fetchManualQueue();
  }, [fetchQueue, fetchManualQueue]);

  // Fetch case details for items in queue
  useEffect(() => {
    if (overlaps.length === 0) return;

    const caseNosToFetch = new Set<string>();
    overlaps.forEach((item) => {
      if (
        item.case_a?.case_no &&
        !caseDetails[item.case_a.case_no] &&
        !ongoingFetches.current.has(item.case_a.case_no)
      ) {
        caseNosToFetch.add(item.case_a.case_no);
      }
      if (
        item.case_b?.case_no &&
        !caseDetails[item.case_b.case_no] &&
        !ongoingFetches.current.has(item.case_b.case_no)
      ) {
        caseNosToFetch.add(item.case_b.case_no);
      }
    });

    if (caseNosToFetch.size === 0) return;

    caseNosToFetch.forEach((cn) => ongoingFetches.current.add(cn));
    setCaseLoading((prev) => {
      const next = { ...prev };
      caseNosToFetch.forEach((cn) => {
        next[cn] = true;
      });
      return next;
    });

    caseNosToFetch.forEach(async (cn) => {
      try {
        const detail = await getCaseDetail(cn);
        setCaseDetails((prev) => ({ ...prev, [cn]: detail }));
      } catch (err: unknown) {
        setCaseErrors((prev) => ({
          ...prev,
          [cn]: err instanceof Error ? err.message : 'Error loading case',
        }));
      } finally {
        ongoingFetches.current.delete(cn);
        setCaseLoading((prev) => ({ ...prev, [cn]: false }));
      }
    });
  }, [overlaps, caseDetails]);

  const retryCaseFetch = async (caseNo: string) => {
    setCaseLoading((prev) => ({ ...prev, [caseNo]: true }));
    setCaseErrors((prev) => {
      const next = { ...prev };
      delete next[caseNo];
      return next;
    });
    try {
      const detail = await getCaseDetail(caseNo);
      setCaseDetails((prev) => ({ ...prev, [caseNo]: detail }));
    } catch (err: unknown) {
      setCaseErrors((prev) => ({
        ...prev,
        [caseNo]: err instanceof Error ? err.message : 'Failed to reload case',
      }));
    } finally {
      setCaseLoading((prev) => ({ ...prev, [caseNo]: false }));
    }
  };

  const handleScan = async () => {
    if (scanning || !canScan) return;
    setScanning(true);
    try {
      const res = await scanOverlaps();
      showToast(
        `Overlap scan complete: ${res.created ?? 0} candidate pairs discovered`,
        'success'
      );
      fetchQueue(false);
      fetchManualQueue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to complete overlap detection scan';
      showToast(msg, 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleNoteChange = (overlapId: number, note: string) => {
    setReviewForms((prev) => ({
      ...prev,
      [overlapId]: {
        ...(prev[overlapId] || { submitting: false, error: null }),
        note,
      },
    }));
  };

  // Review submission with Auto-Advance UX
  const handleReviewSubmit = async (overlapId: number, decision: ReviewDecision) => {
    if (!isCoordinator) return;
    const currentForm = reviewForms[overlapId] || { note: '', submitting: false, error: null };
    const noteToSend = currentForm.note || '';

    setReviewForms((prev) => ({
      ...prev,
      [overlapId]: { ...currentForm, submitting: true, error: null },
    }));

    try {
      const persistedOverlap = await submitOverlapReview(overlapId, {
        decision,
        note: noteToSend.trim() || undefined,
      });

      setOverlaps((prev) =>
        prev.map((item) => (item.id === overlapId ? persistedOverlap : item))
      );

      const decisionLabels: Record<ReviewDecision, string> = {
        related: 'Marked as Related',
        duplicate: 'Marked as Duplicate',
        not_related: 'Marked as Not Related',
        needs_review: 'Marked as Needs More Review',
      };

      showToast(
        `Pair #${overlapId}: ${decisionLabels[decision]} by ${persistedOverlap.reviewed_by || 'Coordinator'}`,
        'success'
      );

      setReviewForms((prev) => ({
        ...prev,
        [overlapId]: {
          note: persistedOverlap.note || '',
          submitting: false,
          error: null,
        },
      }));

      // AUTO-ADVANCE UX: Automatically advance to the next unresolved pair in the queue
      const nextUnresolved = overlaps.find(
        (o) => o.id !== overlapId && o.review_status === 'open'
      );
      if (nextUnresolved) {
        setActivePairId(nextUnresolved.id);
      } else {
        // If all unresolved are done on this page, pick next in order
        const currentIndex = overlaps.findIndex((o) => o.id === overlapId);
        const nextIndex = (currentIndex + 1) % overlaps.length;
        if (overlaps[nextIndex]) {
          setActivePairId(overlaps[nextIndex].id);
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to submit review decision.';
      setReviewForms((prev) => ({
        ...prev,
        [overlapId]: {
          ...currentForm,
          submitting: false,
          error: errMsg,
        },
      }));
    }
  };

  // Filter queue by search term (ID, PID, College, Case number, Bureau)
  const filteredOverlaps = useMemo(() => {
    if (!searchTerm.trim()) return overlaps;
    const term = searchTerm.toLowerCase().trim();

    return overlaps.filter((item) => {
      const idMatch = `pair #${item.id}`.includes(term) || `${item.id}` === term;
      const caseAMatch = item.case_a.case_no.toLowerCase().includes(term);
      const caseBMatch = item.case_b.case_no.toLowerCase().includes(term);
      const bureauMatch = `${item.case_a.bureau} ${item.case_b.bureau}`.toLowerCase().includes(term);

      const caseADetail = caseDetails[item.case_a.case_no];
      const caseBDetail = caseDetails[item.case_b.case_no];
      const instNameMatch =
        caseADetail?.institution?.name?.toLowerCase().includes(term) ||
        caseBDetail?.institution?.name?.toLowerCase().includes(term);
      const pidMatch =
        caseADetail?.institution?.permanent_id?.toLowerCase().includes(term) ||
        caseBDetail?.institution?.permanent_id?.toLowerCase().includes(term);

      return idMatch || caseAMatch || caseBMatch || bureauMatch || instNameMatch || pidMatch;
    });
  }, [overlaps, searchTerm, caseDetails]);

  // Active selected item
  const activeItem = useMemo(() => {
    if (!activePairId) return filteredOverlaps[0] || null;
    return filteredOverlaps.find((o) => o.id === activePairId) || filteredOverlaps[0] || null;
  }, [activePairId, filteredOverlaps]);

  const activeCaseADetail = activeItem ? caseDetails[activeItem.case_a.case_no] : undefined;
  const activeCaseBDetail = activeItem ? caseDetails[activeItem.case_b.case_no] : undefined;

  const activePairMetrics = useMemo(() => {
    if (!activeItem) return null;
    return getPairMetrics(activeItem, activeCaseADetail, activeCaseBDetail);
  }, [activeItem, activeCaseADetail, activeCaseBDetail]);

  const sameCategory = Boolean(
    activeCaseADetail?.category &&
    activeCaseBDetail?.category &&
    activeCaseADetail.category.toLowerCase() === activeCaseBDetail.category.toLowerCase()
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="cb-page-container !py-2 flex flex-col h-[calc(100vh-140px)] min-h-[640px] space-y-3">
      {/* Top Header & Tab Switcher Bar */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Overlap Review Queue
            </h1>
            <span className="text-xs text-slate-500 font-semibold num-tabular">
              ({total} flagged pairs)
            </span>
          </div>

          {/* Mode Switcher */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('triage')}
              className={`px-3 py-1 rounded-md transition ${
                viewMode === 'triage'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Triage Workspace
            </button>
            {canScan && (
              <button
                type="button"
                onClick={() => setViewMode('governance')}
                className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 ${
                  viewMode === 'governance'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>PID Governance</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold num-tabular">
                  {manualItems.length}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            id="scan-overlaps-btn"
            onClick={handleScan}
            disabled={scanning || !canScan}
            title={
              canScan
                ? 'Run overlap detection engine across open cases'
                : 'Only Coordinators and Administrators can trigger an overlap scan'
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1E3A8A] text-white hover:bg-[#172554] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition shadow-xs cursor-pointer"
          >
            <Scan className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{scanning ? 'Scanning...' : 'Scan Overlaps'}</span>
          </button>

          <button
            type="button"
            id="refresh-queue-btn"
            onClick={() => fetchQueue(true)}
            disabled={loading}
            aria-label="Refresh overlap queue"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </section>

      {/* VIEW MODE 1: MASTER-DETAIL SPLIT-SCREEN TRIAGE WORKSPACE */}
      {viewMode === 'triage' && (
        <div className="flex-1 flex flex-col min-h-0 space-y-3">
          {/* 1. TOP FILTER BAR (Compact) */}
          <section
            aria-labelledby="filters-heading"
            className="cb-card px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs shrink-0"
          >
            <h2 id="filters-heading" className="sr-only">Queue Filters</h2>

            <div className="flex flex-wrap items-center gap-3">
              {/* Review Status Filter */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="filter-review-status"
                  className="font-semibold text-slate-600 whitespace-nowrap"
                >
                  Status:
                </label>
                <select
                  id="filter-review-status"
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value as ReviewStatus | '');
                    setPage(1);
                  }}
                  className="h-8 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-2.5 text-xs font-medium cursor-pointer focus:bg-white"
                >
                  <option value="open">Open Review (Default)</option>
                  <option value="related">Marked as Related</option>
                  <option value="duplicate">Marked as Duplicate</option>
                  <option value="not_related">Not Related</option>
                  <option value="needs_review">Needs More Review</option>
                  <option value="">All Review Statuses</option>
                </select>
              </div>

              {/* Confidence Band Filter */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="filter-confidence-band"
                  className="font-semibold text-slate-600 whitespace-nowrap"
                >
                  Confidence:
                </label>
                <select
                  id="filter-confidence-band"
                  value={selectedBand}
                  onChange={(e) => {
                    setSelectedBand(e.target.value as ConfidenceBand | '');
                    setPage(1);
                  }}
                  className="h-8 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-2.5 text-xs font-medium cursor-pointer focus:bg-white"
                >
                  <option value="">All Bands (High → Low)</option>
                  <option value="high">High Confidence Only</option>
                  <option value="medium">Medium Confidence Only</option>
                  <option value="low">Low Confidence Only</option>
                </select>
              </div>
            </div>

            {/* Quick Search & Count */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter by ID, PID, or college..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <span className="text-xs text-slate-500 num-tabular font-medium whitespace-nowrap">
                Showing {filteredOverlaps.length} of {total} flagged pairs
              </span>
            </div>
          </section>

          {/* Loading & Error States */}
          {loading && <LoadingState message="Loading candidate overlap pairs..." />}

          {!loading && error && (
            <ErrorState
              title="Could not load Overlap Queue"
              message={error}
              onRetry={() => fetchQueue(true)}
            />
          )}

          {/* Empty State */}
          {!loading && !error && filteredOverlaps.length === 0 && (
            <EmptyState
              title={selectedStatus || searchTerm ? 'No overlap pairs match your filters' : 'Overlap queue is clear'}
              message={
                selectedStatus || selectedBand || searchTerm
                  ? 'No candidate pairs match the active search or filter criteria. Try resetting filters.'
                  : 'There are currently no recorded overlap pairs in the system. Run an overlap detection scan to discover potential cross-bureau overlaps.'
              }
              action={
                <div className="flex items-center gap-2 mt-2">
                  {(selectedStatus !== 'open' || selectedBand || searchTerm) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStatus('open');
                        setSelectedBand('');
                        setSearchTerm('');
                        setPage(1);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                      <span>Reset to Open Queue</span>
                    </button>
                  )}
                </div>
              }
            />
          )}

          {/* 2 & 3. MASTER-DETAIL SPLIT-SCREEN WORKSPACE */}
          {!loading && !error && filteredOverlaps.length > 0 && activeItem && (
            <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 overflow-hidden">
              {/* 2. LEFT PANE - QUEUE LIST (Scrollable Master) */}
              <aside
                aria-label="Overlap Queue List"
                className="w-full lg:w-[360px] xl:w-[380px] shrink-0 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
              >
                {/* List Header */}
                <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs shrink-0">
                  <span className="font-bold text-slate-800">
                    Candidate Queue ({filteredOverlaps.length})
                  </span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span>Pg {page}/{totalPages}</span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                        title="Previous page"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                        title="Next page"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Queue Cards List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {filteredOverlaps.map((item) => {
                    const isActive = item.id === activeItem.id;
                    const isReviewed = item.review_status !== 'open';
                    const caseADetail = caseDetails[item.case_a.case_no];
                    const caseBDetail = caseDetails[item.case_b.case_no];
                    const metrics = getPairMetrics(item, caseADetail, caseBDetail);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActivePairId(item.id)}
                        className={`w-full text-left p-3 rounded-lg border transition cursor-pointer flex flex-col gap-2 ${
                          isActive
                            ? 'border-blue-600 bg-blue-50/60 shadow-xs ring-1 ring-blue-500/20'
                            : 'border-slate-200 bg-white hover:bg-slate-50/80 hover:border-slate-300'
                        }`}
                      >
                        {/* Top row: Pair #ID, Confidence Pill, Resolved Checkmark */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] font-bold text-white bg-slate-900 px-1.5 py-0.5 rounded shadow-2xs">
                              Pair #{item.id}
                            </span>
                            {item.band === 'high' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-300">
                                High Confidence
                              </span>
                            )}
                            {item.band === 'medium' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                                Medium
                              </span>
                            )}
                            {item.band === 'low' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                Low
                              </span>
                            )}
                          </div>

                          {isReviewed && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>{item.review_status.replace('_', ' ')}</span>
                            </span>
                          )}
                        </div>

                        {/* Middle row: Shared Institution Name / Permanent ID */}
                        <div className="text-xs">
                          <div className="flex items-center gap-1 text-slate-900 font-semibold truncate">
                            <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="truncate">
                              {metrics.instName || (
                                <span className="text-slate-400 italic">Canonical Institution</span>
                              )}
                            </span>
                          </div>
                          {metrics.pid && (
                            <span className="text-[11px] font-mono text-slate-500 block mt-0.5 truncate">
                              PID: {metrics.pid}
                            </span>
                          )}
                        </div>

                        {/* Bottom row: Bureau-to-Bureau, Similarity %, Days delta */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 text-[11px]">
                          <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {item.case_a.bureau} ↔ {item.case_b.bureau}
                          </span>

                          <div className="flex items-center gap-2 text-slate-500 font-medium">
                            {metrics.similarityPercent !== null && (
                              <span className="text-blue-700 font-semibold">
                                {metrics.similarityPercent}% match
                              </span>
                            )}
                            {metrics.daysApart !== null && (
                              <span>
                                {metrics.daysApart === 0 ? 'same day' : `${metrics.daysApart}d apart`}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              {/* 3. RIGHT PANE - ACTIVE COMPARISON WORKSPACE (Detail View) */}
              <main
                aria-label="Active Case Comparison Workspace"
                className="flex-1 flex flex-col justify-between bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs min-w-0"
              >
                {/* 3A. HEADER */}
                <div className="border-b border-slate-200 shrink-0">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-white bg-slate-900 px-2 py-0.5 rounded shadow-2xs">
                        Pair #{activeItem.id}
                      </span>
                      <h2 className="font-bold text-sm sm:text-base text-slate-900">
                        Potential Cross-Bureau Overlap
                      </h2>
                      <ConfidenceBandBadge band={activeItem.band} />
                      <ReviewStatusBadge status={activeItem.review_status} />
                    </div>

                    {activeItem.reviewed_at && (
                      <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          Reviewed {new Date(activeItem.reviewed_at).toLocaleDateString()} by{' '}
                          <strong className="text-slate-800 font-semibold">
                            {activeItem.reviewed_by || 'Coordinator'}
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Shared Institution Banner */}
                  <div className="px-5 py-2 bg-blue-50/40 border-b border-slate-200/80 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
                      <span className="font-bold text-slate-900 truncate">
                        {activePairMetrics?.instName || 'Institution Record'}
                      </span>
                      {activePairMetrics?.pid && (
                        <span className="font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-blue-200 font-semibold shrink-0">
                          PID: {activePairMetrics.pid}
                        </span>
                      )}
                    </div>

                    <Link
                      to={
                        activePairMetrics?.pid
                          ? `/institutions/${activePairMetrics.pid}`
                          : '/institutions'
                      }
                      className="text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1 shrink-0"
                    >
                      <span>Institution profile</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  {/* Sleek Match Signals Strip */}
                  <div className="px-5 py-2 bg-white flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-slate-500 font-medium text-xs flex items-center gap-1 mr-1">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                      <span>Match Signals:</span>
                    </span>

                    {activePairMetrics?.hasSamePID && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Same Permanent ID</span>
                      </span>
                    )}

                    {activePairMetrics?.hasSameCategory && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Same Category</span>
                      </span>
                    )}

                    {activePairMetrics?.hasSharedRef && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300">
                        <CheckCircle2 className="w-3 h-3 text-amber-600" />
                        <span>Shared Ref Code</span>
                      </span>
                    )}

                    {activePairMetrics && activePairMetrics.similarityPercent !== null && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                        <span>{activePairMetrics.similarityPercent}% Text Similarity</span>
                      </span>
                    )}

                    {activePairMetrics && activePairMetrics.daysApart !== null && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>
                          {activePairMetrics.daysApart === 0
                            ? 'Received same day'
                            : `${activePairMetrics.daysApart} days apart`}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 3B. SIDE-BY-SIDE CASE COMPARISON */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                    {/* Case A Column */}
                    <CaseComparisonColumn
                      caseMini={activeItem.case_a}
                      label="Case A"
                      detail={activeCaseADetail}
                      isLoading={caseLoading[activeItem.case_a.case_no]}
                      errorMsg={caseErrors[activeItem.case_a.case_no]}
                      onRetry={() => retryCaseFetch(activeItem.case_a.case_no)}
                      isRestricted={isOfficerOtherBureau(activeItem.case_a.bureau)}
                      categoryMatches={sameCategory}
                    />

                    {/* Case B Column */}
                    <CaseComparisonColumn
                      caseMini={activeItem.case_b}
                      label="Case B"
                      detail={activeCaseBDetail}
                      isLoading={caseLoading[activeItem.case_b.case_no]}
                      errorMsg={caseErrors[activeItem.case_b.case_no]}
                      onRetry={() => retryCaseFetch(activeItem.case_b.case_no)}
                      isRestricted={isOfficerOtherBureau(activeItem.case_b.bureau)}
                      categoryMatches={sameCategory}
                    />
                  </div>

                  {/* Center Delta Strip */}
                  {activePairMetrics && activePairMetrics.daysApart !== null && (
                    <div className="flex items-center justify-center pt-1">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs text-slate-600 font-medium">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600" />
                        <span>
                          {activeItem.case_a.bureau} vs {activeItem.case_b.bureau} Intake Delta:{' '}
                          <strong className="text-slate-900 font-bold">
                            {activePairMetrics.daysApart === 0
                              ? '0 days (Same date)'
                              : `±${activePairMetrics.daysApart} days`}
                          </strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3C. STICKY DECISION FOOTER */}
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 shrink-0 space-y-2">
                  {/* Prior review note if already reviewed */}
                  {activeItem.review_status !== 'open' && activeItem.note && (
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs flex items-start gap-2">
                      <span className="text-slate-500 font-medium shrink-0">Recorded Audit Note:</span>
                      <p className="text-slate-800 italic truncate font-normal">"{activeItem.note}"</p>
                    </div>
                  )}

                  {/* Submission error if any */}
                  {reviewForms[activeItem.id]?.error && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{reviewForms[activeItem.id].error}</span>
                    </div>
                  )}

                  {/* Read-only notice for non-coordinators */}
                  {!isCoordinator ? (
                    <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 p-2.5 rounded-lg">
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                      <span>
                        Coordination review decisions can only be recorded by authenticated Coordinators.
                      </span>
                    </div>
                  ) : (
                    /* Single-line note input + 4 decision buttons with Auto-Advance */
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          id={`review-note-${activeItem.id}`}
                          value={
                            reviewForms[activeItem.id]?.note !== undefined
                              ? reviewForms[activeItem.id].note
                              : activeItem.note || ''
                          }
                          onChange={(e) => handleNoteChange(activeItem.id, e.target.value)}
                          disabled={reviewForms[activeItem.id]?.submitting}
                          placeholder="Add optional coordination/audit note..."
                          className="w-full h-9 text-xs bg-white border border-slate-300 rounded-lg px-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                        />
                      </div>

                      {/* 4 Decision Buttons */}
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <button
                          type="button"
                          id={`btn-related-${activeItem.id}`}
                          onClick={() => handleReviewSubmit(activeItem.id, 'related')}
                          disabled={reviewForms[activeItem.id]?.submitting}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[#1E3A8A] text-white hover:bg-[#172554] disabled:opacity-50 transition shadow-xs cursor-pointer"
                        >
                          <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Related</span>
                        </button>

                        <button
                          type="button"
                          id={`btn-duplicate-${activeItem.id}`}
                          onClick={() => handleReviewSubmit(activeItem.id, 'duplicate')}
                          disabled={reviewForms[activeItem.id]?.submitting}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-rose-50 border border-rose-300 text-rose-800 hover:bg-rose-100 disabled:opacity-50 transition shadow-2xs cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
                          <span>Duplicate</span>
                        </button>

                        <button
                          type="button"
                          id={`btn-not-related-${activeItem.id}`}
                          onClick={() => handleReviewSubmit(activeItem.id, 'not_related')}
                          disabled={reviewForms[activeItem.id]?.submitting}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition shadow-2xs cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                          <span>Not Related</span>
                        </button>

                        <button
                          type="button"
                          id={`btn-needs-review-${activeItem.id}`}
                          onClick={() => handleReviewSubmit(activeItem.id, 'needs_review')}
                          disabled={reviewForms[activeItem.id]?.submitting}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-50 transition shadow-2xs cursor-pointer"
                        >
                          <HelpCircle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                          <span>Needs Review</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </main>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: MANUAL VERIFICATION GOVERNANCE QUEUE */}
      {viewMode === 'governance' && canScan && (
        <section aria-labelledby="manual-verification-heading" className="flex-1 flex flex-col min-h-0 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
              <h2 id="manual-verification-heading" className="text-base font-bold text-slate-900 tracking-tight">
                Manual Verification Governance Queue
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 num-tabular">
                {manualItems.length} records
              </span>
            </div>
            <button
              type="button"
              onClick={fetchManualQueue}
              disabled={manualLoading}
              className="text-xs font-semibold text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${manualLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Refresh list</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl shrink-0">
            Cases with missing or conflicting institutional Permanent IDs flagged for coordinator verification.
          </p>

          <div className="cb-card flex-1 overflow-hidden bg-white border border-slate-200 rounded-xl shadow-xs">
            {manualLoading ? (
              <div className="p-8 text-center text-xs text-slate-500">Checking records...</div>
            ) : manualItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-600 bg-slate-50">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" aria-hidden="true" />
                <div className="font-bold text-slate-900">All Cases Resolved</div>
                <div className="text-slate-500 mt-1">
                  Every registered case maps cleanly to a canonical permanent institution ID.
                </div>
              </div>
            ) : (
              <div className="overflow-auto h-full">
                <table className="w-full text-left text-xs text-slate-900">
                  <caption className="sr-only">Manual Verification Cases Table</caption>
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                    <tr>
                      <th scope="col" className="py-2.5 px-3">Case Number</th>
                      <th scope="col" className="py-2.5 px-3">Institution Name</th>
                      <th scope="col" className="py-2.5 px-3">Permanent ID</th>
                      <th scope="col" className="py-2.5 px-3">Issue Category</th>
                      <th scope="col" className="py-2.5 px-3">Reason</th>
                      <th scope="col" className="py-2.5 px-3">Bureau / Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {manualItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                          {item.case_no ? (
                            <Link to={`/cases/${item.case_no}`} className="hover:underline">
                              {item.case_no}
                            </Link>
                          ) : (
                            <span className="text-slate-400">Inst #{item.institution_id}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {item.institution_name}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">
                          {item.permanent_id || (
                            <span className="text-rose-600 font-bold">Missing ID</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {item.issue_type === 'missing_permanent_id' ? 'Missing ID' : 'Conflicting ID'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={item.reason}>
                          {item.reason}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 num-tabular">
                          {item.bureau || '—'} {item.received_date ? `· ${item.received_date}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

// ============================================================================
// Side-by-side Case Comparison Column Component
// ============================================================================

interface CaseColumnProps {
  caseMini: { case_no: string; bureau: string; status: string };
  label: string;
  detail?: CaseItem;
  isLoading?: boolean;
  errorMsg?: string;
  onRetry: () => void;
  isRestricted?: boolean;
  categoryMatches?: boolean;
}

const CaseComparisonColumn: React.FC<CaseColumnProps> = ({
  caseMini,
  label,
  detail,
  isLoading,
  errorMsg,
  onRetry,
  isRestricted: isRestrictedProp,
  categoryMatches,
}) => {
  const isRestricted = Boolean(
    isRestrictedProp ||
      (detail && detail.description === undefined && detail.assigned_officer === undefined)
  );

  const isCaseA = label.toLowerCase().includes('a');
  const cardTheme = isCaseA
    ? 'border-blue-200/90 bg-blue-50/20'
    : 'border-indigo-200/90 bg-indigo-50/20';
  const labelBadge = isCaseA
    ? 'bg-blue-600 text-white'
    : 'bg-indigo-600 text-white';
  const caseNoLink = isCaseA
    ? 'text-blue-700 hover:text-blue-900'
    : 'text-indigo-700 hover:text-indigo-900';

  return (
    <div
      className={`rounded-xl border ${cardTheme} p-4 flex flex-col justify-between h-full shadow-2xs bg-white`}
    >
      <div className="flex-1 flex flex-col">
        {/* Header: Label, Case No, Bureau, Status */}
        <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-slate-200 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shadow-2xs ${labelBadge}`}
            >
              {label}
            </span>
            <Link
              to={`/cases/${caseMini.case_no}`}
              className={`font-mono font-bold text-xs hover:underline ${caseNoLink}`}
            >
              {caseMini.case_no}
            </Link>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <BureauBadge bureau={caseMini.bureau} />
            <StatusChip status={caseMini.status} />
            {detail?.priority && <PriorityChip priority={detail.priority} />}
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-2 py-3 animate-pulse">
            <div className="h-3 bg-slate-200 rounded w-3/4"></div>
            <div className="h-3 bg-slate-200 rounded w-1/2"></div>
            <div className="h-16 bg-slate-200 rounded w-full mt-2"></div>
          </div>
        )}

        {/* Error state */}
        {!isLoading && errorMsg && (
          <div className="p-3 my-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
            <p className="text-xs mb-1.5">{errorMsg}</p>
            <button
              type="button"
              onClick={onRetry}
              className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
            >
              Retry loading
            </button>
          </div>
        )}

        {/* Case Attributes & Grievance Summary */}
        {!isLoading && !errorMsg && detail && (
          <div className="space-y-3 text-xs flex-1 flex flex-col justify-between">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-slate-500 font-medium">Category</dt>
                <dd
                  className={`font-semibold capitalize mt-0.5 ${
                    categoryMatches ? 'text-emerald-700 font-bold' : 'text-slate-900'
                  }`}
                >
                  {formatCategory(detail.category)}
                  {categoryMatches && (
                    <span className="ml-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                      Match
                    </span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500 font-medium">Received Date</dt>
                <dd className="font-semibold text-slate-900 flex items-center gap-1 mt-0.5 num-tabular">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <span>{detail.received_date || '—'}</span>
                </dd>
              </div>

              <div>
                <dt className="text-slate-500 font-medium">Assigned Officer</dt>
                <dd className="font-semibold text-slate-900 flex items-center gap-1 mt-0.5 truncate">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  {isRestricted ? (
                    <RestrictedBadge />
                  ) : (
                    <span>
                      {detail.assigned_officer || (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500 font-medium">Target SLA</dt>
                <dd className="font-semibold text-slate-900 flex items-center gap-1 mt-0.5 num-tabular">
                  {isRestricted ? (
                    <RestrictedBadge />
                  ) : (
                    <>
                      <span>{detail.expected_disposal_date || '—'}</span>
                      {detail.overdue && <OverdueBadge />}
                    </>
                  )}
                </dd>
              </div>
            </dl>

            {/* Grievance Summary with AUTO-HIGHLIGHT SHARED REF CODES */}
            <div>
              <span className="text-slate-700 font-semibold flex items-center gap-1 mb-1">
                <FileText className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                <span>Grievance Summary:</span>
              </span>
              <div className="p-3 rounded-lg bg-slate-50/70 border border-slate-200 text-slate-800 text-xs leading-relaxed max-h-32 overflow-y-auto shadow-2xs">
                {isRestricted ? (
                  <RestrictedBadge />
                ) : (
                  renderHighlightedText(detail.description)
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="pt-2.5 mt-2.5 border-t border-slate-200 flex justify-end">
        <Link
          to={`/cases/${caseMini.case_no}`}
          className="text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1"
        >
          <span>Open case record</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
};
