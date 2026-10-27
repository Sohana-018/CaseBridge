import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  getOverlaps,
  getOverlapDetail,
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
import {
  RefreshCw,
  Scan,
  AlertTriangle,
  Info,
  Calendar,
  User,
  Building2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Lock,
  Tag,
  Clock,
  Sparkles,
  FileText,
  Link2,
  Copy,
  XCircle,
  HelpCircle,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';

export const OverlapQueuePage: React.FC = () => {
  const [overlaps, setOverlaps] = useState<OverlapItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [selectedStatus, setSelectedStatus] = useState<ReviewStatus | ''>('open');
  const [selectedBand, setSelectedBand] = useState<ConfidenceBand | ''>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Scan state
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanNotice, setScanNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Review interaction state: map of overlapId -> { note: string, submitting: boolean, error: string | null, success?: string | null }
  const [reviewForms, setReviewForms] = useState<Record<number, { note: string; submitting: boolean; error: string | null; success?: string | null }>>({});

  // Case details cache and per-case loading/error states
  const [caseDetails, setCaseDetails] = useState<Record<string, CaseItem>>({});
  const [caseLoading, setCaseLoading] = useState<Record<string, boolean>>({});
  const [caseErrors, setCaseErrors] = useState<Record<string, string>>({});
  const ongoingFetches = useRef<Set<string>>(new Set());

  const [currentUser, setCurrentUser] = useState<UserPayload | null>(() => getCurrentUser());
  const isCoordinator = currentUser?.role === 'coordinator';
  const canScan = currentUser?.role === 'coordinator' || currentUser?.role === 'administrator';

  // Manual verification items: missing or conflicting permanent_id
  const [manualItems, setManualItems] = useState<ManualVerificationItem[]>([]);
  const [manualLoading, setManualLoading] = useState<boolean>(false);
  const isOfficerOtherBureau = (bureau: string) =>
    currentUser?.role === 'bureau_officer' &&
    Boolean(currentUser?.bureau && bureau && currentUser.bureau.toUpperCase() !== bureau.toUpperCase());

  // Synchronize current user profile reactively on mount if not yet initialized
  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  // Fetch overlap list from backend
  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: OverlapListResponse = await getOverlaps({
        review_status: selectedStatus || undefined,
        band: selectedBand || undefined,
        page,
        page_size: pageSize,
      });
      setOverlaps(res.items || []);
      setTotal(res.total || 0);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch overlap candidate pairs from the backend.');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, selectedBand, page, pageSize]);

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

  // Fetch full details for cases visible in the current overlap list
  useEffect(() => {
    if (overlaps.length === 0) return;

    const caseNosToFetch = new Set<string>();
    overlaps.forEach((item) => {
      if (item.case_a?.case_no && !caseDetails[item.case_a.case_no] && !ongoingFetches.current.has(item.case_a.case_no)) {
        caseNosToFetch.add(item.case_a.case_no);
      }
      if (item.case_b?.case_no && !caseDetails[item.case_b.case_no] && !ongoingFetches.current.has(item.case_b.case_no)) {
        caseNosToFetch.add(item.case_b.case_no);
      }
    });

    if (caseNosToFetch.size === 0) return;

    caseNosToFetch.forEach(async (caseNo) => {
      ongoingFetches.current.add(caseNo);
      setCaseLoading((prev) => ({ ...prev, [caseNo]: true }));
      try {
        const detail = await getCaseDetail(caseNo);
        setCaseDetails((prev) => ({ ...prev, [caseNo]: detail }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not fetch case details';
        setCaseErrors((prev) => ({ ...prev, [caseNo]: msg }));
      } finally {
        setCaseLoading((prev) => ({ ...prev, [caseNo]: false }));
        ongoingFetches.current.delete(caseNo);
      }
    });
  }, [overlaps, caseDetails]);

  // Retry fetching full details for a case that failed earlier
  const retryCaseFetch = async (caseNo: string) => {
    setCaseErrors((prev) => {
      const copy = { ...prev };
      delete copy[caseNo];
      return copy;
    });
    setCaseLoading((prev) => ({ ...prev, [caseNo]: true }));
    try {
      const detail = await getCaseDetail(caseNo);
      setCaseDetails((prev) => ({ ...prev, [caseNo]: detail }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not fetch case details';
      setCaseErrors((prev) => ({ ...prev, [caseNo]: msg }));
    } finally {
      setCaseLoading((prev) => ({ ...prev, [caseNo]: false }));
    }
  };

  // Trigger automated overlap detection scan (only available to coordinator or administrator)
  const handleScan = async () => {
    if (!canScan) return;
    setScanning(true);
    setScanNotice(null);
    try {
      const scanResult = await scanOverlaps();
      setScanNotice({
        type: 'success',
        message: `Scan finished successfully. Found and updated ${scanResult.created} candidate overlap pairs.`,
      });
      // Refresh the queue view
      fetchQueue();
      fetchManualQueue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Overlap scan failed unexpectedly.';
      setScanNotice({
        type: 'error',
        message: msg,
      });
    } finally {
      setScanning(false);
    }
  };

  // Handle note text change for a specific overlap pair
  const handleNoteChange = (overlapId: number, note: string) => {
    setReviewForms((prev) => ({
      ...prev,
      [overlapId]: {
        note,
        submitting: prev[overlapId]?.submitting || false,
        error: null,
        success: prev[overlapId]?.success,
      },
    }));
  };

  // Submit review decision for an overlap pair
  const handleReviewSubmit = async (overlapId: number, decision: ReviewDecision) => {
    if (!isCoordinator) return;

    const currentForm = reviewForms[overlapId] || { note: '', submitting: false, error: null };
    setReviewForms((prev) => ({
      ...prev,
      [overlapId]: {
        ...currentForm,
        submitting: true,
        error: null,
      },
    }));

    try {
      // 1. Submit review to backend
      await submitOverlapReview(overlapId, {
        decision,
        note: currentForm.note?.trim() || undefined,
      });

      // 2. Refetch the overlap detail directly from the backend to verify and display persisted record
      const persistedOverlap = await getOverlapDetail(overlapId);

      // 3. Update the specific overlap item in state in-place with real persisted server record
      setOverlaps((prev) =>
        prev.map((item) => (item.id === overlapId ? persistedOverlap : item))
      );

      // 4. Update review form state with success confirmation and persisted note
      const decisionLabel =
        decision === 'not_related'
          ? 'Not Related'
          : decision === 'needs_review'
          ? 'Needs More Review'
          : decision.charAt(0).toUpperCase() + decision.slice(1);

      setReviewForms((prev) => ({
        ...prev,
        [overlapId]: {
          note: persistedOverlap.note || '',
          submitting: false,
          error: null,
          success: `Review decision saved: Marked as "${decisionLabel}" by ${persistedOverlap.reviewed_by || 'Coordinator'}.`,
        },
      }));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to submit review decision.';
      setReviewForms((prev) => ({
        ...prev,
        [overlapId]: {
          ...currentForm,
          submitting: false,
          error: errMsg,
          success: null,
        },
      }));
    }
  };

  // Human-readable formatter for detection reason strings
  const formatReasonTag = (reason: string) => {
    if (reason === 'same_permanent_id') return 'Same Permanent ID';
    if (reason === 'same_category') return 'Same Category Area';
    if (reason === 'related_category') return 'Related Category Area';
    if (reason === 'shared_reference') return 'Shared Case / Ref Code';
    if (reason.startsWith('text_similarity')) {
      const val = reason.split(' ')[1];
      const pct = val ? Math.round(parseFloat(val) * 100) : '';
      return `Text Similarity (${pct}%)`;
    }
    if (reason.startsWith('date_proximity')) {
      const parts = reason.split(' ');
      const days = parts[1] || '';
      return `Within ${days} Days`;
    }
    return reason.replace(/_/g, ' ');
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Desk Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Overlap Review Queue
            </h1>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
              {total} Pairs Flagged
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Human-in-the-loop coordination desk for evaluating cross-bureau duplicate or related complaint pairs
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap self-start md:self-auto">
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
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer ${
              canScan
                ? 'bg-blue-900 text-white hover:bg-blue-800 disabled:opacity-50'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            <Scan className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Scanning Cases...' : 'Scan for Overlaps'}</span>
          </button>

          <button
            type="button"
            id="refresh-queue-btn"
            onClick={fetchQueue}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition shadow-2xs cursor-pointer"
            title="Refresh queue pairs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Non-Destructive Explanatory Banner (Reference 5 Floating Alert Style) */}
      <div className="rounded-xl border border-blue-200/80 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-slate-50 p-4 sm:p-5 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Info className="w-4 h-4" />
          </div>
          <div className="text-xs text-slate-800 leading-relaxed">
            <span className="font-bold text-blue-950">Non-destructive coordination workflow: </span>
            Review decisions (<em>Related</em>, <em>Duplicate</em>, <em>Not Related</em>, or <em>Needs More Review</em>) record an append-only coordination event on both cases. The system <strong>never</strong> automatically merges, modifies, or disposes of either case—all case numbers, assigned officers, and jurisdictions remain completely intact.
          </div>
        </div>
      </div>

      {/* Scan Feedback Banner */}
      {scanNotice && (
        <div
          role="status"
          className={`rounded-xl border p-4 shadow-xs flex items-start justify-between gap-3 ${
            scanNotice.type === 'success'
              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
              : 'bg-rose-50/90 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-start gap-2.5 text-xs font-medium">
            {scanNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
            )}
            <span>{scanNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setScanNotice(null)}
            className="text-xs font-bold hover:underline cursor-pointer opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Toolbar (Reference 2 VertexPoint Pill Filter Style) */}
      <section
        aria-labelledby="filters-heading"
        className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs"
      >
        <h2 id="filters-heading" className="sr-only">Queue Filters</h2>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter-review-status" className="font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider text-[11px]">
              Review Status:
            </label>
            <div className="relative">
              <select
                id="filter-review-status"
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value as ReviewStatus | '');
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-1.5 pr-7 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-900 cursor-pointer appearance-none shadow-2xs"
              >
                <option value="open">Open Review (Default)</option>
                <option value="related">Marked as Related</option>
                <option value="duplicate">Marked as Duplicate</option>
                <option value="not_related">Dismissed (Not Related)</option>
                <option value="needs_review">Needs More Review</option>
                <option value="">All Review Statuses</option>
              </select>
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">
                ▼
              </div>
            </div>
          </div>

          {/* Confidence Band Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter-confidence-band" className="font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider text-[11px]">
              Confidence Band:
            </label>
            <div className="relative">
              <select
                id="filter-confidence-band"
                value={selectedBand}
                onChange={(e) => {
                  setSelectedBand(e.target.value as ConfidenceBand | '');
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-1.5 pr-7 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-900 cursor-pointer appearance-none shadow-2xs"
              >
                <option value="">All Bands (High → Low)</option>
                <option value="high">High Confidence Only</option>
                <option value="medium">Medium Confidence Only</option>
                <option value="low">Low Confidence Only</option>
              </select>
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">
                ▼
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-500 font-medium self-end md:self-auto">
          <span>
            {loading ? 'Fetching pairs...' : `Displaying ${overlaps.length} of ${total} flagged pair${total === 1 ? '' : 's'}`}
          </span>
        </div>
      </section>

      {/* Loading state */}
      {loading && <LoadingState message="Loading candidate overlap pairs..." />}

      {/* Error state */}
      {!loading && error && (
        <ErrorState
          title="Could not load Overlap Queue"
          message={error}
          onRetry={fetchQueue}
        />
      )}

      {/* Empty state */}
      {!loading && !error && overlaps.length === 0 && (
        <EmptyState
          title={selectedStatus ? 'No overlap pairs match your filters' : 'Overlap queue is clear'}
          message={
            selectedStatus || selectedBand
              ? 'No candidate pairs match the selected review status or confidence band.'
              : 'There are currently no recorded overlap pairs in the system. Run an overlap detection scan to discover potential cross-bureau overlaps.'
          }
          action={
            <div className="flex items-center gap-2 mt-2">
              {(selectedStatus !== 'open' || selectedBand) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatus('open');
                    setSelectedBand('');
                    setPage(1);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Reset to Open Queue</span>
                </button>
              )}
              {canScan && (
                <button
                  type="button"
                  onClick={handleScan}
                  disabled={scanning}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-blue-900 text-white hover:bg-blue-800 transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Scan className="w-3.5 h-3.5" />
                  <span>Run Detection Scan Now</span>
                </button>
              )}
            </div>
          }
        />
      )}

      {/* Overlap Cards List (Reference 7 Master-Detail Comparison Architecture) */}
      {!loading && !error && overlaps.length > 0 && (
        <div className="space-y-6">
          {overlaps.map((item) => {
            const form = reviewForms[item.id] || { note: '', submitting: false, error: null };
            const isPairReviewed = item.review_status !== 'open';

            return (
              <article
                key={item.id}
                id={`overlap-${item.id}`}
                aria-labelledby={`pair-heading-${item.id}`}
                className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs hover:border-slate-300 hover:shadow-sm transition"
              >
                {/* Pair Header Bar */}
                <div className="px-5 py-4 bg-slate-50/90 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-800 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs">
                      Pair #{item.id}
                    </span>
                    <h3 id={`pair-heading-${item.id}`} className="font-bold text-sm text-slate-900">
                      Potential Overlapping Cases – Coordination Required
                    </h3>
                    <ConfidenceBandBadge band={item.band} />
                    <ReviewStatusBadge status={item.review_status} />
                  </div>

                  {item.reviewed_at && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        Reviewed {new Date(item.reviewed_at).toLocaleDateString()} by{' '}
                        <strong className="text-slate-800">{item.reviewed_by || 'Coordinator'}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Why Flagged Strip (Reference 3 Tactile Reason Pills) */}
                <div className="px-5 py-3 bg-white border-b border-slate-100 flex items-start sm:items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
                    <Sparkles className="w-3.5 h-3.5 text-blue-900" />
                    <span>Algorithmic Signals:</span>
                  </div>
                  {item.reasons && item.reasons.length > 0 ? (
                    item.reasons.map((reason, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100/80 text-slate-700 border border-slate-200 shadow-2xs"
                      >
                        <Tag className="w-3 h-3 text-slate-400" />
                        {formatReasonTag(reason)}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">Same-institution cross-bureau candidate</span>
                  )}
                </div>

                {/* Same Institution Strip */}
                {(() => {
                  const inst =
                    caseDetails[item.case_a.case_no]?.institution ||
                    caseDetails[item.case_b.case_no]?.institution;
                  const isRestrictedPair =
                    !inst &&
                    isOfficerOtherBureau(item.case_a.bureau) &&
                    isOfficerOtherBureau(item.case_b.bureau);

                  return (
                    <div className="px-5 py-2.5 bg-gradient-to-r from-slate-50 via-blue-50/30 to-slate-50 border-b border-slate-200 text-xs flex items-center gap-2 flex-wrap">
                      <Building2 className="w-4 h-4 text-blue-900 shrink-0" />
                      <span className="font-bold text-slate-700">Same Institution:</span>
                      {inst ? (
                        <div className="inline-flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/institutions/${inst.permanent_id}`}
                            className="font-bold text-slate-900 hover:text-blue-900 hover:underline"
                            title={inst.name}
                          >
                            {inst.name}
                          </Link>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono text-blue-900 font-bold bg-blue-100/60 px-2 py-0.5 rounded text-[11px]">
                            {inst.permanent_id}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-600 font-medium">{inst.region} Region</span>
                        </div>
                      ) : isRestrictedPair ? (
                        <RestrictedBadge />
                      ) : (
                        <span className="text-slate-400 italic">Loading institution profile...</span>
                      )}
                    </div>
                  );
                })()}

                {/* Side-by-Side Comparison Grid (Reference 7 Master-Detail Item Columns) */}
                <div className="p-5 bg-slate-50/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
                    {/* Case A Panel */}
                    <CaseComparisonColumn
                      caseMini={item.case_a}
                      label="Case A"
                      detail={caseDetails[item.case_a.case_no]}
                      isLoading={caseLoading[item.case_a.case_no]}
                      errorMsg={caseErrors[item.case_a.case_no]}
                      onRetry={() => retryCaseFetch(item.case_a.case_no)}
                      isRestricted={isOfficerOtherBureau(item.case_a.bureau)}
                    />

                    {/* Case B Panel */}
                    <CaseComparisonColumn
                      caseMini={item.case_b}
                      label="Case B"
                      detail={caseDetails[item.case_b.case_no]}
                      isLoading={caseLoading[item.case_b.case_no]}
                      errorMsg={caseErrors[item.case_b.case_no]}
                      onRetry={() => retryCaseFetch(item.case_b.case_no)}
                      isRestricted={isOfficerOtherBureau(item.case_b.bureau)}
                    />
                  </div>
                </div>

                {/* Review Action & Decision Box (Reference 7 Segmented Action Drawer) */}
                <div className="px-5 py-4 bg-slate-50/80 border-t border-slate-200">
                  {/* Prior review note banner if already reviewed */}
                  {isPairReviewed && item.note && (
                    <div className="mb-3 p-3.5 rounded-xl bg-white border border-slate-200 text-xs shadow-2xs">
                      <div className="font-bold text-slate-800 mb-0.5">Recorded Coordination Note:</div>
                      <div className="text-slate-600 italic">"{item.note}"</div>
                    </div>
                  )}

                  {/* Submission success feedback */}
                  {form.success && (
                    <div className="mb-3 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-semibold">{form.success}</span>
                      </div>
                      {selectedStatus === 'open' && (
                        <button
                          type="button"
                          onClick={() => fetchQueue()}
                          className="text-[11px] font-bold text-emerald-900 underline hover:text-emerald-950 cursor-pointer"
                          title="Refresh queue to hide reviewed item"
                        >
                          Remove from open queue
                        </button>
                      )}
                    </div>
                  )}

                  {/* Submission error feedback */}
                  {form.error && (
                    <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-900 flex items-center gap-2 shadow-2xs">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span className="font-semibold">{form.error}</span>
                    </div>
                  )}

                  {/* Role warning for non-coordinators */}
                  {!isCoordinator && (
                    <div className="mb-3 flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-xl shadow-2xs">
                      <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="font-medium">Coordination decisions can only be recorded by authenticated Coordinators.</span>
                    </div>
                  )}

                  {/* Review input and action buttons */}
                  <div className="space-y-3">
                    <div>
                      <label htmlFor={`review-note-${item.id}`} className="block text-xs font-bold text-slate-700 mb-1">
                        {isPairReviewed ? 'Update Coordination Note (Optional):' : 'Coordination Review Note (Optional):'}
                      </label>
                      <textarea
                        id={`review-note-${item.id}`}
                        rows={2}
                        value={form.note !== undefined ? form.note : item.note || ''}
                        onChange={(e) => handleNoteChange(item.id, e.target.value)}
                        disabled={form.submitting || !isCoordinator}
                        placeholder="Add a coordination note (optional)"
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 disabled:bg-slate-100 disabled:text-slate-400 shadow-2xs transition"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                      <span className="text-[11px] text-slate-500 font-medium">
                        {isPairReviewed ? 'Change status or re-evaluate decision:' : 'Select coordination decision:'}
                      </span>

                      {/* 4 Explicit Review Decisions per PRD FR10 (Reference 3 Tactile Action Pills) */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 1. Related */}
                        <button
                          type="button"
                          id={`btn-related-${item.id}`}
                          onClick={() => handleReviewSubmit(item.id, 'related')}
                          disabled={form.submitting || !isCoordinator}
                          title="Flag cases as related; triggers coordination event on both cases"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-900 border border-indigo-300 hover:bg-indigo-100 disabled:opacity-50 transition cursor-pointer shadow-2xs hover:shadow-xs"
                        >
                          <Link2 className="w-3.5 h-3.5 text-indigo-700" />
                          <span>Related</span>
                        </button>

                        {/* 2. Duplicate */}
                        <button
                          type="button"
                          id={`btn-duplicate-${item.id}`}
                          onClick={() => handleReviewSubmit(item.id, 'duplicate')}
                          disabled={form.submitting || !isCoordinator}
                          title="Mark cases as duplicate complaints without merging or deleting"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-purple-50 text-purple-900 border border-purple-300 hover:bg-purple-100 disabled:opacity-50 transition cursor-pointer shadow-2xs hover:shadow-xs"
                        >
                          <Copy className="w-3.5 h-3.5 text-purple-700" />
                          <span>Duplicate</span>
                        </button>

                        {/* 3. Not Related */}
                        <button
                          type="button"
                          id={`btn-not-related-${item.id}`}
                          onClick={() => handleReviewSubmit(item.id, 'not_related')}
                          disabled={form.submitting || !isCoordinator}
                          title="Dismiss candidate overlap; cases are unrelated"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200 disabled:opacity-50 transition cursor-pointer shadow-2xs hover:shadow-xs"
                        >
                          <XCircle className="w-3.5 h-3.5 text-slate-500" />
                          <span>Not Related</span>
                        </button>

                        {/* 4. Needs More Review */}
                        <button
                          type="button"
                          id={`btn-needs-review-${item.id}`}
                          onClick={() => handleReviewSubmit(item.id, 'needs_review')}
                          disabled={form.submitting || !isCoordinator}
                          title="Mark as requiring further bureau consultation"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 disabled:opacity-50 transition cursor-pointer shadow-2xs hover:shadow-xs"
                        >
                          <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                          <span>Needs More Review</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {/* Pagination Navigation */}
          {totalPages > 1 && (
            <nav aria-label="Queue Pagination" className="flex items-center justify-between border-t border-slate-200 pt-5 px-2">
              <button
                type="button"
                id="pagination-prev"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <span className="text-xs text-slate-600 font-semibold">
                Page <strong className="text-slate-900">{page}</strong> of <strong className="text-slate-900">{totalPages}</strong>
              </span>

              <button
                type="button"
                id="pagination-next"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </nav>
          )}
        </div>
      )}

      {/* Manual Verification List Section */}
      {canScan && (
        <section aria-labelledby="manual-verification-heading" className="mt-10 border-t border-slate-200 pt-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
              <h2 id="manual-verification-heading" className="text-lg font-bold text-slate-900 tracking-tight">
                Manual Verification Governance Queue
              </h2>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full shadow-2xs ${
                manualItems.length > 0 ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              }`}>
                {manualItems.length} {manualItems.length === 1 ? 'case' : 'cases'}
              </span>
            </div>
            <button
              type="button"
              onClick={fetchManualQueue}
              disabled={manualLoading}
              className="text-xs font-bold text-blue-900 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${manualLoading ? 'animate-spin' : ''}`} />
              <span>Refresh list</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4 max-w-2xl">
            Cases with missing or unresolvable institutional Permanent IDs flagged for coordinator verification before automated overlap indexing.
          </p>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            {manualLoading ? (
              <div className="p-8 text-center text-xs text-slate-500">Checking data quality records...</div>
            ) : manualItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-50/50">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                <div className="font-semibold text-slate-800">All Active Complaints Resolved</div>
                <div className="text-slate-500 mt-0.5">Every registered case maps to a canonical permanent institution ID.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Case / Item</th>
                      <th className="py-3 px-4">Institution Name</th>
                      <th className="py-3 px-4">Permanent ID</th>
                      <th className="py-3 px-4">Issue Category</th>
                      <th className="py-3 px-4">Diagnostic Reason</th>
                      <th className="py-3 px-4">Bureau / Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {manualItems.map((item) => (
                      <tr key={item.id} className="hover:bg-amber-50/40 transition">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {item.case_no ? (
                            <Link to={`/cases/${item.case_no}`} className="text-blue-900 hover:underline">
                              {item.case_no}
                            </Link>
                          ) : (
                            <span className="text-slate-500">Inst #{item.institution_id}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-800 font-semibold">
                          {item.institution_name}
                        </td>
                        <td className="py-3 px-4">
                          {item.permanent_id ? (
                            <code className="text-slate-700 font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {item.permanent_id}
                            </code>
                          ) : (
                            <span className="text-rose-700 font-bold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px]">
                              Missing ID
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            item.issue_type === 'missing_permanent_id'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {item.issue_type === 'missing_permanent_id' ? 'Missing ID' : 'Conflicting ID'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={item.reason}>
                          {item.reason}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
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
    </main>
  );
};

// ============================================================================
// Side-by-side Case Comparison Column Component (Reference 7 Master-Detail Card)
// ============================================================================

interface CaseColumnProps {
  caseMini: { case_no: string; bureau: string; status: string };
  label: string;
  detail?: CaseItem;
  isLoading?: boolean;
  errorMsg?: string;
  onRetry: () => void;
  isRestricted?: boolean;
}

const CaseComparisonColumn: React.FC<CaseColumnProps> = ({
  caseMini,
  label,
  detail,
  isLoading,
  errorMsg,
  onRetry,
  isRestricted: isRestrictedProp,
}) => {
  const isRestricted = Boolean(
    isRestrictedProp || (detail && detail.description === undefined && detail.assigned_officer === undefined)
  );

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between h-full hover:border-slate-300 transition">
      <div className="flex-1 flex flex-col">
        {/* Header: Label, Case No, Bureau, Status, Priority */}
        <div className="flex items-center justify-between gap-2 pb-3 mb-3.5 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-900 text-white shadow-2xs">
              {label}
            </span>
            <span className="font-mono font-bold text-sm text-blue-900">
              {caseMini.case_no}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <BureauBadge bureau={caseMini.bureau} />
            <StatusChip status={caseMini.status} />
            {detail?.priority ? (
              <PriorityChip priority={detail.priority} />
            ) : isRestricted ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-400 border border-slate-200 italic">
                <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                <span>Priority: Restricted</span>
              </span>
            ) : null}
          </div>
        </div>

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="space-y-3 py-3 animate-pulse">
            <div className="h-4 bg-slate-100 rounded-md w-3/4"></div>
            <div className="h-3 bg-slate-100 rounded-md w-1/2"></div>
            <div className="h-20 bg-slate-100 rounded-lg w-full mt-2"></div>
          </div>
        )}

        {/* Error Fallback with Retry */}
        {!isLoading && errorMsg && (
          <div className="p-3 my-2 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900">
            <div className="font-bold mb-1">Could not load full case details</div>
            <p className="text-[11px] text-amber-800 mb-2">{errorMsg}</p>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-900 underline hover:text-blue-700 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Retry loading
            </button>
          </div>
        )}

        {/* Resolved Case Details */}
        {!isLoading && !errorMsg && detail && (
          <div className="space-y-3.5 text-xs flex-1 flex flex-col justify-between">
            {/* Key Metadata Table */}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Category</dt>
                <dd className="font-bold text-slate-800 capitalize truncate mt-0.5">{detail.category || '—'}</dd>
              </div>

              <div>
                <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Received Date</dt>
                <dd className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{detail.received_date || '—'}</span>
                </dd>
              </div>

              <div>
                <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Assigned Officer</dt>
                <dd className="font-semibold text-slate-800 flex items-center gap-1 truncate mt-0.5">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {isRestricted ? (
                    <RestrictedBadge />
                  ) : (
                    <span>{detail.assigned_officer || <span className="text-slate-400 italic font-normal">Unassigned</span>}</span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Target SLA</dt>
                <dd className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                  {isRestricted ? (
                    <RestrictedBadge />
                  ) : (
                    <>
                      <span>{detail.expected_disposal_date || '—'}</span>
                      {detail.overdue && <OverdueBadge className="scale-90" />}
                    </>
                  )}
                </dd>
              </div>
            </dl>

            {/* Full Complaint Description (Reference 7 Card Body) */}
            <div className="mt-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Grievance Summary / Allegations:</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-800 text-xs leading-relaxed max-h-36 overflow-y-auto font-normal">
                {isRestricted ? (
                  <RestrictedBadge />
                ) : (
                  detail.description || <span className="text-slate-400 italic">No description provided</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Fallback when detail is not yet loaded */}
        {!isLoading && !errorMsg && !detail && (
          <div className="py-3 text-xs text-slate-500">
            <div>Bureau: <strong className="text-slate-700">{caseMini.bureau}</strong></div>
            <div>Status: <strong className="text-slate-700">{caseMini.status}</strong></div>
          </div>
        )}
      </div>

      {/* Case Link Footer */}
      <div className="pt-3.5 mt-auto border-t border-slate-100 flex items-center justify-end text-xs">
        <Link
          to={`/cases/${caseMini.case_no}`}
          className="font-bold text-blue-900 hover:text-blue-700 flex items-center gap-1 group text-xs hover:underline"
        >
          <span>Open Full Case Timeline</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
};
