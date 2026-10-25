import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  getOverlaps,
  getOverlapDetail,
  scanOverlaps,
  submitOverlapReview,
  getCaseDetail,
  getCurrentUser,
  autoLogin,
  type UserPayload,
  type OverlapItem,
  type OverlapListResponse,
  type CaseItem,
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
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Send,
  CheckCircle2,
  Lock,
  Tag,
  Clock,
  Sparkles,
  FileText,
} from 'lucide-react';

export const OverlapQueuePage: React.FC = () => {
  const [overlaps, setOverlaps] = useState<OverlapItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedStatus, setSelectedStatus] = useState<ReviewStatus | ''>('open');
  const [selectedBand, setSelectedBand] = useState<ConfidenceBand | ''>('high');

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
  const isOfficerOtherBureau = (bureau: string) =>
    currentUser?.role === 'bureau_officer' &&
    Boolean(currentUser?.bureau && bureau && currentUser.bureau.toUpperCase() !== bureau.toUpperCase());

  // Synchronize current user profile reactively on mount if not yet initialized
  useEffect(() => {
    if (!getCurrentUser()) {
      autoLogin()
        .then((res) => setCurrentUser(res.user))
        .catch(() => {});
    }
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

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

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
      setCaseErrors((prev) => {
        const next = { ...prev };
        delete next[caseNo];
        return next;
      });

      try {
        const detail = await getCaseDetail(caseNo);
        setCaseDetails((prev) => ({ ...prev, [caseNo]: detail }));
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Failed to load case detail';
        setCaseErrors((prev) => ({ ...prev, [caseNo]: errMsg }));
      } finally {
        ongoingFetches.current.delete(caseNo);
        setCaseLoading((prev) => ({ ...prev, [caseNo]: false }));
      }
    });
  }, [overlaps, caseDetails]);

  // Retry fetching an individual case
  const retryCaseFetch = (caseNo: string) => {
    ongoingFetches.current.delete(caseNo);
    setCaseLoading((prev) => ({ ...prev, [caseNo]: true }));
    setCaseErrors((prev) => {
      const next = { ...prev };
      delete next[caseNo];
      return next;
    });

    getCaseDetail(caseNo)
      .then((detail) => {
        setCaseDetails((prev) => ({ ...prev, [caseNo]: detail }));
      })
      .catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : 'Failed to load case detail';
        setCaseErrors((prev) => ({ ...prev, [caseNo]: errMsg }));
      })
      .finally(() => {
        ongoingFetches.current.delete(caseNo);
        setCaseLoading((prev) => ({ ...prev, [caseNo]: false }));
      });
  };

  // Run overlap detection scan
  const handleScan = async () => {
    if (!canScan) return;
    setScanning(true);
    setScanNotice(null);
    try {
      const res = await scanOverlaps();
      setScanNotice({
        type: 'success',
        message:
          res.created > 0
            ? `Detection scan complete: ${res.created} new candidate overlap pair(s) detected and added to queue.`
            : 'Detection scan complete: No new overlap pairs detected. The queue is up to date.',
      });
      // Refresh the queue to show newly created candidate pairs
      await fetchQueue();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to execute overlap detection scan.';
      setScanNotice({
        type: 'error',
        message: msg,
      });
    } finally {
      setScanning(false);
    }
  };

  // Handle note input
  const handleNoteChange = (overlapId: number, note: string) => {
    setReviewForms((prev) => ({
      ...prev,
      [overlapId]: {
        note,
        submitting: prev[overlapId]?.submitting || false,
        error: null,
        success: null,
      },
    }));
  };

  // Submit review decision
  const handleReviewSubmit = async (overlapId: number, decision: ReviewDecision) => {
    if (!isCoordinator) return;

    const currentForm = reviewForms[overlapId] || { note: '', submitting: false, error: null, success: null };
    setReviewForms((prev) => ({
      ...prev,
      [overlapId]: { ...currentForm, submitting: true, error: null, success: null },
    }));

    try {
      // 1. Submit review payload to backend review endpoint
      await submitOverlapReview(overlapId, {
        decision,
        note: currentForm.note.trim() || null,
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
    if (reason === 'same_category') return 'Same Complaint Category';
    if (reason === 'related_category') return 'Related Category Area';
    if (reason === 'shared_reference') return 'Shared Case / Letter Reference';
    if (reason.startsWith('text_similarity')) {
      const val = reason.split(' ')[1];
      const pct = val ? Math.round(parseFloat(val) * 100) : '';
      return `Text Similarity (${pct}%)`;
    }
    if (reason.startsWith('date_proximity')) {
      const parts = reason.split(' ');
      const days = parts[1] || '';
      return `Received within ${days} days`;
    }
    return reason.replace(/_/g, ' ');
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">
          Overlap Review Queue
        </h1>
        <p className="text-sm text-slate-500">
          Internal coordination review for potential cross-bureau case overlaps concerning the same institution.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
            {total} Flagged
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
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
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold shadow-xs transition cursor-pointer ${
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
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Non-Destructive Explanatory Banner */}
      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50/70 p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-800 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-950 leading-relaxed">
            <span className="font-semibold text-blue-900">Non-destructive coordination workflow: </span>
            Review decisions (Related, Duplicate, Dismiss, or Needs Review) record an audit event on both cases
            to establish cross-bureau coordination. They <strong>never</strong> automatically merge, close, or dispose of either case.
            Both case numbers, assigned officers, and timelines remain completely intact.
          </div>
        </div>
      </div>

      {/* Scan Feedback Banner */}
      {scanNotice && (
        <div
          role="status"
          className={`mb-6 rounded-lg border p-4 shadow-xs flex items-start justify-between gap-3 ${
            scanNotice.type === 'success'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : 'bg-red-50/80 border-red-200 text-red-950'
          }`}
        >
          <div className="flex items-start gap-2.5 text-xs font-medium">
            {scanNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />
            )}
            <span>{scanNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setScanNotice(null)}
            className="text-xs font-semibold hover:underline cursor-pointer opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <section aria-labelledby="filters-heading" className="bg-white rounded-lg border border-slate-200 p-4 mb-6 shadow-xs">
        <h2 id="filters-heading" className="sr-only">Queue Filters</h2>
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <label htmlFor="filter-review-status" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                Review Status:
              </label>
              <select
                id="filter-review-status"
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value as ReviewStatus | '');
                  setPage(1);
                }}
                className="text-xs bg-slate-50 border border-slate-300 text-slate-800 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-900 cursor-pointer"
              >
                <option value="open">Open (Default)</option>
                <option value="related">Related</option>
                <option value="duplicate">Duplicate</option>
                <option value="not_related">Not Related</option>
                <option value="needs_review">Needs More Review</option>
                <option value="">All Statuses</option>
              </select>
            </div>

            {/* Confidence Band Filter */}
            <div className="flex items-center gap-2">
              <label htmlFor="filter-confidence-band" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                Confidence Band:
              </label>
              <select
                id="filter-confidence-band"
                value={selectedBand}
                onChange={(e) => {
                  setSelectedBand(e.target.value as ConfidenceBand | '');
                  setPage(1);
                }}
                className="text-xs bg-slate-50 border border-slate-300 text-slate-800 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-900 cursor-pointer"
              >
                <option value="">All Bands (High → Low)</option>
                <option value="high">High Confidence</option>
                <option value="medium">Medium Confidence</option>
                <option value="low">Low Confidence</option>
              </select>
            </div>
          </div>

          {/* Page size and counter */}
          <div className="flex items-center justify-between md:justify-end gap-3 text-xs text-slate-500">
            <span>
              Showing {overlaps.length > 0 ? (page - 1) * pageSize + 1 : 0}–
              {Math.min(page * pageSize, total)} of {total} pairs
            </span>
            <div className="flex items-center gap-1.5">
              <label htmlFor="page-size-select" className="sr-only">Page Size</label>
              <select
                id="page-size-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="text-xs bg-slate-50 border border-slate-300 text-slate-800 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-900 cursor-pointer"
              >
                <option value="5">5 / page</option>
                <option value="10">10 / page</option>
                <option value="20">20 / page</option>
                <option value="50">50 / page</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Loading & Error States */}
      {loading && <LoadingState message="Fetching candidate overlap pairs..." />}

      {!loading && error && (
        <ErrorState
          title="Unable to load Overlap Queue"
          message={error}
          onRetry={fetchQueue}
        />
      )}

      {/* Empty State */}
      {!loading && !error && overlaps.length === 0 && (
        <EmptyState
          title="No overlap candidate pairs found"
          message={
            selectedStatus || selectedBand
              ? 'No pairs match the selected review status or confidence band criteria. Try resetting your filters.'
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition cursor-pointer"
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
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-blue-900 text-white hover:bg-blue-800 transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Scan className="w-3.5 h-3.5" />
                  <span>Run Detection Scan Now</span>
                </button>
              )}
            </div>
          }
        />
      )}

      {/* Overlap Cards List */}
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
                className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs hover:border-slate-300 transition-colors"
              >
                {/* Pair Header Bar */}
                <div className="px-5 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      Pair #{item.id}
                    </span>
                    <h3 id={`pair-heading-${item.id}`} className="font-semibold text-sm text-slate-900">
                      Potential Overlapping Cases – Coordination Required
                    </h3>
                    <ConfidenceBandBadge band={item.band} />
                    <ReviewStatusBadge status={item.review_status} />
                  </div>

                  {item.reviewed_at && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        Reviewed {new Date(item.reviewed_at).toLocaleDateString()} by{' '}
                        <strong className="text-slate-700">{item.reviewed_by || 'Coordinator'}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Why Flagged Strip */}
                <div className="px-5 py-3 bg-white border-b border-slate-100 flex items-start sm:items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">
                    <Sparkles className="w-3.5 h-3.5 text-blue-900" />
                    <span>Why flagged:</span>
                  </div>
                  {item.reasons && item.reasons.length > 0 ? (
                    item.reasons.map((reason, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
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
                    <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200 text-xs flex items-center gap-1.5 flex-wrap">
                      <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="font-medium text-slate-600">Same institution:</span>
                      {inst ? (
                        <div className="inline-flex items-center gap-1.5 flex-wrap">
                          <Link
                            to={`/institutions/${inst.permanent_id}`}
                            className="font-semibold text-slate-900 hover:text-blue-900 hover:underline"
                            title={inst.name}
                          >
                            {inst.name}
                          </Link>
                          <span className="text-slate-400">·</span>
                          <span className="font-mono text-blue-900 font-medium">{inst.permanent_id}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600">{inst.region}</span>
                        </div>
                      ) : isRestrictedPair ? (
                        <RestrictedBadge />
                      ) : (
                        <span className="text-slate-400 italic">Loading institution...</span>
                      )}
                    </div>
                  );
                })()}

                {/* Side-by-Side Comparison Grid */}
                <div className="p-5">
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

                {/* Review Action & Decision Box */}
                <div className="px-5 py-4 bg-slate-50 border-t border-slate-200">
                  {/* Prior review note banner if already reviewed */}
                  {isPairReviewed && item.note && (
                    <div className="mb-3 p-3 rounded-md bg-white border border-slate-200 text-xs">
                      <div className="font-semibold text-slate-700 mb-0.5">Recorded Review Note:</div>
                      <div className="text-slate-600 italic">"{item.note}"</div>
                    </div>
                  )}

                  {/* Submission success feedback */}
                  {form.success && (
                    <div className="mb-3 p-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>{form.success}</span>
                      </div>
                      {selectedStatus === 'open' && (
                        <button
                          type="button"
                          onClick={() => fetchQueue()}
                          className="text-[11px] font-semibold text-emerald-900 underline hover:text-emerald-950 cursor-pointer"
                          title="Refresh queue to hide reviewed item"
                        >
                          Remove from open queue
                        </button>
                      )}
                    </div>
                  )}

                  {/* Submission error feedback */}
                  {form.error && (
                    <div className="mb-3 p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <span>{form.error}</span>
                    </div>
                  )}

                  {/* Role warning for non-coordinators */}
                  {!isCoordinator && (
                    <div className="mb-3 flex items-center gap-2 text-xs text-amber-800 bg-amber-50/80 border border-amber-200 p-2.5 rounded-md">
                      <Lock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                      <span>Only coordinators can record overlap decisions.</span>
                    </div>
                  )}

                  {/* Review input and action buttons */}
                  <div className="space-y-3">
                    <div>
                      <label htmlFor={`review-note-${item.id}`} className="block text-xs font-semibold text-slate-700 mb-1">
                        {isPairReviewed ? 'Update Coordination Note (Optional):' : 'Coordination Review Note (Optional):'}
                      </label>
                      <textarea
                        id={`review-note-${item.id}`}
                        rows={2}
                        value={form.note !== undefined ? form.note : item.note || ''}
                        onChange={(e) => handleNoteChange(item.id, e.target.value)}
                        disabled={form.submitting || !isCoordinator}
                        placeholder="Add a coordination note (optional)"
                        className="w-full text-xs bg-white border border-slate-300 rounded-md p-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-900 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                      <span className="text-[11px] text-slate-500">
                        {isPairReviewed ? 'Change status or re-evaluate decision:' : 'Select coordination decision:'}
                      </span>

                      {/* 4 Explicit Review Decisions per PRD FR10 (open is NEVER a decision) */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 1. Related */}
                        <button
                          type="button"
                          id={`btn-related-${item.id}`}
                          onClick={() => handleReviewSubmit(item.id, 'related')}
                          disabled={form.submitting || !isCoordinator}
                          title="Flag cases as related; triggers coordination event on both cases"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-900 border border-indigo-300 hover:bg-indigo-100 disabled:opacity-50 transition cursor-pointer shadow-xs"
                        >
                          <Send className="w-3 h-3 text-indigo-700" />
                          <span>Related</span>
                        </button>

                        {/* 2. Duplicate */}
                        <button
                          type="button"
                          id={`btn-duplicate-${item.id}`}
                          onClick={() => handleReviewSubmit(item.id, 'duplicate')}
                          disabled={form.submitting || !isCoordinator}
                          title="Mark cases as duplicate complaints without merging or deleting"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-purple-50 text-purple-900 border border-purple-300 hover:bg-purple-100 disabled:opacity-50 transition cursor-pointer shadow-xs"
                        >
                          <CheckCircle2 className="w-3 h-3 text-purple-700" />
                          <span>Duplicate</span>
                        </button>

                        {/* 3. Not Related */}
                        <button
                          type="button"
                          id={`btn-not-related-${item.id}`}
                          onClick={() => handleReviewSubmit(item.id, 'not_related')}
                          disabled={form.submitting || !isCoordinator}
                          title="Dismiss candidate overlap; cases are unrelated"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200 disabled:opacity-50 transition cursor-pointer shadow-xs"
                        >
                          <span>Not Related</span>
                        </button>

                        {/* 4. Needs More Review */}
                        <button
                          type="button"
                          id={`btn-needs-review-${item.id}`}
                          onClick={() => handleReviewSubmit(item.id, 'needs_review')}
                          disabled={form.submitting || !isCoordinator}
                          title="Mark as requiring further bureau consultation"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 disabled:opacity-50 transition cursor-pointer shadow-xs"
                        >
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
            <nav aria-label="Queue Pagination" className="flex items-center justify-between border-t border-slate-200 pt-4 px-2">
              <button
                type="button"
                id="pagination-prev"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-xs cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <span className="text-xs text-slate-600 font-medium">
                Page {page} of {totalPages}
              </span>

              <button
                type="button"
                id="pagination-next"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-xs cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </nav>
          )}
        </div>
      )}
    </main>
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
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-2xs flex flex-col justify-between h-full">
      <div className="flex-1 flex flex-col">
        {/* Header: Label, Case No, Bureau, Status, Priority */}
        <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              {label}
            </span>
            <span className="font-mono font-bold text-sm text-slate-900">
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
          <div className="space-y-2.5 py-3 animate-pulse">
            <div className="h-4 bg-slate-100 rounded w-3/4"></div>
            <div className="h-3 bg-slate-100 rounded w-1/2"></div>
            <div className="h-16 bg-slate-100 rounded w-full mt-2"></div>
          </div>
        )}

        {/* Error Fallback with Retry */}
        {!isLoading && errorMsg && (
          <div className="p-3 my-2 bg-amber-50/70 border border-amber-200 rounded text-xs text-amber-900">
            <div className="font-semibold mb-1">Could not load full case details</div>
            <p className="text-[11px] text-amber-800 mb-2">{errorMsg}</p>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-900 underline hover:text-blue-700 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Retry loading
            </button>
          </div>
        )}

        {/* Resolved Case Details */}
        {!isLoading && !errorMsg && detail && (
          <div className="space-y-3 text-xs flex-1 flex flex-col justify-between">
            {/* Key Metadata Table */}
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs">
              <div>
                <dt className="text-[11px] text-slate-500">Category:</dt>
                <dd className="font-medium text-slate-800 capitalize truncate">{detail.category || '—'}</dd>
              </div>

              <div>
                <dt className="text-[11px] text-slate-500">Received Date:</dt>
                <dd className="font-medium text-slate-800 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>{detail.received_date || '—'}</span>
                </dd>
              </div>

              <div>
                <dt className="text-[11px] text-slate-500">Assigned Officer:</dt>
                <dd className="font-medium text-slate-800 flex items-center gap-1 truncate">
                  <User className="w-3 h-3 text-slate-400" />
                  {isRestricted ? (
                    <RestrictedBadge />
                  ) : (
                    <span>{detail.assigned_officer || <span className="text-slate-400 italic">Unassigned</span>}</span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-[11px] text-slate-500">Due / Expected Disposal:</dt>
                <dd className="font-medium text-slate-800 flex items-center gap-1">
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

            {/* Full Complaint Description */}
            <div className="mt-2">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3 text-slate-400" />
                <span>Complaint Description:</span>
              </div>
              <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-slate-700 text-xs leading-relaxed max-h-32 overflow-y-auto">
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
          <div className="py-2 text-xs text-slate-500">
            <div>Bureau: <strong className="text-slate-700">{caseMini.bureau}</strong></div>
            <div>Status: <strong className="text-slate-700">{caseMini.status}</strong></div>
          </div>
        )}
      </div>

      {/* Case Link Footer */}
      <div className="pt-3 mt-auto border-t border-slate-100 flex items-center justify-end text-xs">
        <Link
          to={`/cases/${caseMini.case_no}`}
          className="font-semibold text-blue-900 hover:text-blue-700 flex items-center gap-1 group text-xs"
        >
          <span>Open case</span>
          <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
};
