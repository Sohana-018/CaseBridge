import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { formatCategory, formatSignal } from '../utils/formatters';
import { useToast } from '../components/Toast';
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
  Clock,
  Sparkles,
  FileText,
  Link2,
  Copy,
  XCircle,
  HelpCircle,
  ShieldAlert,
  ArrowRight,
  X,
} from 'lucide-react';

const DISMISS_BANNER_STORAGE_KEY = 'cb_overlap_banner_dismissed';

export const OverlapQueuePage: React.FC = () => {
  const { showToast } = useToast();
  const [overlaps, setOverlaps] = useState<OverlapItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [selectedStatus, setSelectedStatus] = useState<ReviewStatus | ''>('open');
  const [selectedBand, setSelectedBand] = useState<ConfidenceBand | ''>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Banner dismissal state in localStorage
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
    return localStorage.getItem(DISMISS_BANNER_STORAGE_KEY) === 'true';
  });

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

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem(DISMISS_BANNER_STORAGE_KEY, 'true');
  };

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
      setOverlaps(res.items || []);
      setTotal(res.total || 0);
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
      if (item.case_a?.case_no && !caseDetails[item.case_a.case_no] && !ongoingFetches.current.has(item.case_a.case_no)) {
        caseNosToFetch.add(item.case_a.case_no);
      }
      if (item.case_b?.case_no && !caseDetails[item.case_b.case_no] && !ongoingFetches.current.has(item.case_b.case_no)) {
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
        `Overlap scan complete: ${res.scanned ?? 0} active cases examined, ${res.created ?? 0} candidate pairs flagged`,
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="cb-page-container space-y-6">
      {/* Page Header */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-[28px] font-semibold text-[var(--text)] tracking-tight">
              Overlap Review Queue
            </h1>
            <span className="text-sm text-[var(--text-secondary)] num-tabular font-medium">
              ({total} pairs flagged)
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Human-in-the-loop coordination desk for evaluating cross-bureau duplicate or related complaint pairs
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 shrink-0">
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] disabled:bg-[var(--neutral-bg)] disabled:text-[var(--text-tertiary)] disabled:cursor-not-allowed transition shadow-xs cursor-pointer"
          >
            <Scan className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{scanning ? 'Scanning...' : 'Scan for Overlaps'}</span>
          </button>

          <button
            type="button"
            id="refresh-queue-btn"
            onClick={() => fetchQueue(true)}
            disabled={loading}
            aria-label="Refresh overlap queue"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-[var(--border-input)] text-[var(--text)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition shadow-xs cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[var(--text-secondary)] ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </section>

      {/* Dismissible Info Banner */}
      {!bannerDismissed && (
        <div
          role="region"
          aria-label="Coordination Workflow Information"
          className="cb-card p-4 bg-[var(--brand-subtle)] border-[#C7D7FE] flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-[var(--brand)] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs text-[var(--text)] leading-relaxed">
              <strong className="font-semibold text-[var(--brand)]">Non-destructive review: </strong>
              Coordination decisions append an audit event to both cases without altering case numbers, jurisdictions, or records.
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissBanner}
            aria-label="Dismiss banner"
            className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-black/5 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Sticky Filter Toolbar */}
      <section
        aria-labelledby="filters-heading"
        className="cb-card p-4 sticky top-16 z-20 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs bg-white"
      >
        <h2 id="filters-heading" className="sr-only">Queue Filters</h2>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter-review-status" className="font-medium text-[var(--text-secondary)] whitespace-nowrap">
              Review Status:
            </label>
            <select
              id="filter-review-status"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value as ReviewStatus | '');
                setPage(1);
              }}
              className="h-9 bg-white border border-[var(--border-input)] text-[var(--text)] rounded-[var(--radius-control)] px-3 text-xs font-medium cursor-pointer"
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
            <label htmlFor="filter-confidence-band" className="font-medium text-[var(--text-secondary)] whitespace-nowrap">
              Confidence Band:
            </label>
            <select
              id="filter-confidence-band"
              value={selectedBand}
              onChange={(e) => {
                setSelectedBand(e.target.value as ConfidenceBand | '');
                setPage(1);
              }}
              className="h-9 bg-white border border-[var(--border-input)] text-[var(--text)] rounded-[var(--radius-control)] px-3 text-xs font-medium cursor-pointer"
            >
              <option value="">All Bands (High → Low)</option>
              <option value="high">High Confidence Only</option>
              <option value="medium">Medium Confidence Only</option>
              <option value="low">Low Confidence Only</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-[var(--text-secondary)] num-tabular self-end md:self-auto">
          Showing {overlaps.length} of {total} flagged pairs
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[var(--border-input)] text-[var(--text)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
                  <span>Reset to Open Queue</span>
                </button>
              )}
            </div>
          }
        />
      )}

      {/* Overlap Cards List */}
      {!loading && !error && overlaps.length > 0 && (
        <div className="space-y-5">
          {overlaps.map((item) => {
            const form = reviewForms[item.id] || { note: '', submitting: false, error: null };
            const isPairReviewed = item.review_status !== 'open';

            const caseADetail = caseDetails[item.case_a.case_no];
            const caseBDetail = caseDetails[item.case_b.case_no];

            // Compare match vs differ
            const sameCategory = Boolean(
              caseADetail?.category &&
              caseBDetail?.category &&
              caseADetail.category.toLowerCase() === caseBDetail.category.toLowerCase()
            );

            return (
              <article
                key={item.id}
                id={`overlap-${item.id}`}
                aria-labelledby={`pair-heading-${item.id}`}
                className="cb-card overflow-hidden"
              >
                {/* Pair Header Bar */}
                <div className="px-5 py-3.5 bg-[var(--bg-subtle)] border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-[var(--text)] bg-white px-2 py-0.5 rounded border border-[var(--border)]">
                      Pair #{item.id}
                    </span>
                    <h2 id={`pair-heading-${item.id}`} className="font-semibold text-sm text-[var(--text)]">
                      Potential Cross-Bureau Overlap
                    </h2>
                    <ConfidenceBandBadge band={item.band} />
                    <ReviewStatusBadge status={item.review_status} />
                  </div>

                  {item.reviewed_at && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                      <Clock className="w-3.5 h-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
                      <span>
                        Reviewed {new Date(item.reviewed_at).toLocaleDateString()} by{' '}
                        <strong className="font-medium text-[var(--text)]">{item.reviewed_by || 'Coordinator'}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Signals Row */}
                <div className="px-5 py-2.5 bg-white border-b border-[var(--border)] flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-xs text-[var(--text-tertiary)] font-medium mr-1 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--brand)]" aria-hidden="true" />
                    <span>Signals:</span>
                  </span>
                  {item.reasons && item.reasons.length > 0 ? (
                    item.reasons.map((reason, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-[6px] text-xs font-medium bg-[var(--neutral-bg)] text-[var(--neutral)] border border-[var(--border)]"
                      >
                        {formatSignal(reason)}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-[var(--text-tertiary)] italic">
                      Same-institution cross-bureau candidate
                    </span>
                  )}
                </div>

                {/* Side-by-Side Comparison */}
                <div className="p-5 bg-white">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
                    {/* Case A */}
                    <CaseComparisonColumn
                      caseMini={item.case_a}
                      label="Case A"
                      detail={caseADetail}
                      isLoading={caseLoading[item.case_a.case_no]}
                      errorMsg={caseErrors[item.case_a.case_no]}
                      onRetry={() => retryCaseFetch(item.case_a.case_no)}
                      isRestricted={isOfficerOtherBureau(item.case_a.bureau)}
                      categoryMatches={sameCategory}
                    />

                    {/* Case B */}
                    <CaseComparisonColumn
                      caseMini={item.case_b}
                      label="Case B"
                      detail={caseBDetail}
                      isLoading={caseLoading[item.case_b.case_no]}
                      errorMsg={caseErrors[item.case_b.case_no]}
                      onRetry={() => retryCaseFetch(item.case_b.case_no)}
                      isRestricted={isOfficerOtherBureau(item.case_b.bureau)}
                      categoryMatches={sameCategory}
                    />
                  </div>
                </div>

                {/* Decision Footer Box */}
                <div className="px-5 py-4 bg-[var(--bg-subtle)] border-t border-[var(--border)] space-y-3">
                  {/* Prior review note if already reviewed */}
                  {isPairReviewed && item.note && (
                    <div className="p-3 rounded-lg bg-white border border-[var(--border)] text-xs">
                      <span className="text-[var(--text-tertiary)] font-medium">Recorded Coordination Note:</span>
                      <p className="text-[var(--text)] italic mt-0.5">"{item.note}"</p>
                    </div>
                  )}

                  {/* Submission error */}
                  {form.error && (
                    <div className="p-3 rounded-lg bg-[var(--danger-bg)] border border-[#FECDCA] text-xs text-[var(--danger)] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{form.error}</span>
                    </div>
                  )}

                  {/* Read-only warning (Muted Neutral Lock Note) */}
                  {!isCoordinator && (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] bg-white border border-[var(--border)] p-2.5 rounded-lg">
                      <Lock className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
                      <span>Coordination review decisions can only be recorded by authenticated Coordinators.</span>
                    </div>
                  )}

                  {/* Note input & decision buttons */}
                  <div>
                    <label htmlFor={`review-note-${item.id}`} className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      Coordination Note (Optional):
                    </label>
                    <textarea
                      id={`review-note-${item.id}`}
                      rows={2}
                      value={form.note !== undefined ? form.note : item.note || ''}
                      onChange={(e) => handleNoteChange(item.id, e.target.value)}
                      disabled={form.submitting || !isCoordinator}
                      aria-disabled={!isCoordinator}
                      placeholder="Add an audit note or rationale for this review decision..."
                      className="w-full text-xs bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] p-2.5 text-[var(--text)] placeholder:text-[var(--text-tertiary)] disabled:bg-[var(--bg-subtle)] disabled:text-[var(--text-tertiary)]"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {isPairReviewed ? 'Change decision:' : 'Select decision:'}
                    </span>

                    {/* Secondary decision buttons with recommended action emphasized */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        id={`btn-related-${item.id}`}
                        onClick={() => handleReviewSubmit(item.id, 'related')}
                        disabled={form.submitting || !isCoordinator}
                        aria-disabled={!isCoordinator}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control)] text-xs font-semibold bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] disabled:bg-[var(--neutral-bg)] disabled:text-[var(--text-tertiary)] disabled:cursor-not-allowed transition shadow-xs cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Related</span>
                      </button>

                      <button
                        type="button"
                        id={`btn-duplicate-${item.id}`}
                        onClick={() => handleReviewSubmit(item.id, 'duplicate')}
                        disabled={form.submitting || !isCoordinator}
                        aria-disabled={!isCoordinator}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control)] text-xs font-medium bg-white border border-[var(--border-input)] text-[var(--text)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-2xs cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 text-[var(--danger)]" aria-hidden="true" />
                        <span>Duplicate</span>
                      </button>

                      <button
                        type="button"
                        id={`btn-not-related-${item.id}`}
                        onClick={() => handleReviewSubmit(item.id, 'not_related')}
                        disabled={form.submitting || !isCoordinator}
                        aria-disabled={!isCoordinator}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control)] text-xs font-medium bg-white border border-[var(--border-input)] text-[var(--text)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-2xs cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
                        <span>Not Related</span>
                      </button>

                      <button
                        type="button"
                        id={`btn-needs-review-${item.id}`}
                        onClick={() => handleReviewSubmit(item.id, 'needs_review')}
                        disabled={form.submitting || !isCoordinator}
                        aria-disabled={!isCoordinator}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control)] text-xs font-medium bg-white border border-[var(--border-input)] text-[var(--text)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-2xs cursor-pointer"
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-[var(--warning)]" aria-hidden="true" />
                        <span>Needs Review</span>
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {/* Pagination Navigation */}
          {totalPages > 1 && (
            <nav aria-label="Queue Pagination" className="flex items-center justify-between border-t border-[var(--border)] pt-4 px-1 text-xs">
              <button
                type="button"
                id="pagination-prev"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-input)] bg-white text-[var(--text)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed font-medium transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                <span>Previous</span>
              </button>

              <span className="text-[var(--text-secondary)]">
                Page <strong className="text-[var(--text)] num-tabular">{page}</strong> of <strong className="text-[var(--text)] num-tabular">{totalPages}</strong>
              </span>

              <button
                type="button"
                id="pagination-next"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-input)] bg-white text-[var(--text)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed font-medium transition cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      )}

      {/* Manual Verification List Section */}
      {canScan && (
        <section aria-labelledby="manual-verification-heading" className="mt-8 border-t border-[var(--border)] pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[var(--warning)] shrink-0" aria-hidden="true" />
              <h2 id="manual-verification-heading" className="text-base font-semibold text-[var(--text)] tracking-tight">
                Manual Verification Governance Queue
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--neutral-bg)] text-[var(--neutral)] num-tabular">
                {manualItems.length} records
              </span>
            </div>
            <button
              type="button"
              onClick={fetchManualQueue}
              disabled={manualLoading}
              className="text-xs font-medium text-[var(--brand)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${manualLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Refresh list</span>
            </button>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mb-4 max-w-2xl">
            Cases with missing or conflicting institutional Permanent IDs flagged for coordinator verification.
          </p>

          <div className="cb-card overflow-hidden">
            {manualLoading ? (
              <div className="p-6 text-center text-xs text-[var(--text-tertiary)]">Checking records...</div>
            ) : manualItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-subtle)]">
                <CheckCircle2 className="w-5 h-5 text-[var(--success)] mx-auto mb-1.5" aria-hidden="true" />
                <div className="font-semibold text-[var(--text)]">All Cases Resolved</div>
                <div className="text-[var(--text-tertiary)] mt-0.5">Every registered case maps to a canonical permanent institution ID.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[var(--text)]">
                  <caption className="sr-only">Manual Verification Cases Table</caption>
                  <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border)] text-[var(--text-secondary)] font-medium">
                    <tr>
                      <th scope="col" className="py-2.5 px-3">Case Number</th>
                      <th scope="col" className="py-2.5 px-3">Institution Name</th>
                      <th scope="col" className="py-2.5 px-3">Permanent ID</th>
                      <th scope="col" className="py-2.5 px-3">Issue Category</th>
                      <th scope="col" className="py-2.5 px-3">Reason</th>
                      <th scope="col" className="py-2.5 px-3">Bureau / Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {manualItems.map((item) => (
                      <tr key={item.id} className="hover:bg-[var(--bg-subtle)] transition">
                        <td className="py-2.5 px-3 font-mono font-medium text-[var(--brand)]">
                          {item.case_no ? (
                            <Link to={`/cases/${item.case_no}`} className="hover:underline">
                              {item.case_no}
                            </Link>
                          ) : (
                            <span className="text-[var(--text-tertiary)]">Inst #{item.institution_id}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[var(--text)]">
                          {item.institution_name}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[var(--text-secondary)]">
                          {item.permanent_id || (
                            <span className="text-[var(--danger)] font-medium">Missing ID</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-[6px] text-[11px] font-medium bg-[var(--neutral-bg)] text-[var(--neutral)]">
                            {item.issue_type === 'missing_permanent_id' ? 'Missing ID' : 'Conflicting ID'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[var(--text-secondary)] max-w-xs truncate" title={item.reason}>
                          {item.reason}
                        </td>
                        <td className="py-2.5 px-3 text-[var(--text-tertiary)] num-tabular">
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
    isRestrictedProp || (detail && detail.description === undefined && detail.assigned_officer === undefined)
  );

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-4 flex flex-col justify-between h-full">
      <div className="flex-1 flex flex-col">
        {/* Header: Label, Case No, Bureau, Status */}
        <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-[var(--border)] flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--brand)] text-white">
              {label}
            </span>
            <span className="font-mono font-medium text-xs text-[var(--brand)]">
              {caseMini.case_no}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <BureauBadge bureau={caseMini.bureau} />
            <StatusChip status={caseMini.status} />
            {detail?.priority && <PriorityChip priority={detail.priority} />}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2 py-3 animate-pulse">
            <div className="h-3 bg-[var(--border)] rounded w-3/4"></div>
            <div className="h-3 bg-[var(--border)] rounded w-1/2"></div>
            <div className="h-14 bg-[var(--border)] rounded w-full mt-2"></div>
          </div>
        )}

        {/* Error */}
        {!isLoading && errorMsg && (
          <div className="p-3 my-2 bg-[var(--danger-bg)] border border-[#FECDCA] rounded-lg text-xs text-[var(--danger)]">
            <p className="text-xs mb-1.5">{errorMsg}</p>
            <button
              type="button"
              onClick={onRetry}
              className="text-xs font-semibold text-[var(--brand)] hover:underline cursor-pointer"
            >
              Retry loading
            </button>
          </div>
        )}

        {/* Details */}
        {!isLoading && !errorMsg && detail && (
          <div className="space-y-3 text-xs flex-1 flex flex-col justify-between">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-[var(--text-tertiary)]">Category</dt>
                <dd className={`font-medium capitalize mt-0.5 ${categoryMatches ? 'text-[var(--brand)] font-semibold' : 'text-[var(--text)]'}`}>
                  {formatCategory(detail.category)}
                  {categoryMatches && <span className="ml-1 text-[10px] text-[var(--brand)] font-normal">(Match)</span>}
                </dd>
              </div>

              <div>
                <dt className="text-[var(--text-tertiary)]">Received Date</dt>
                <dd className="font-medium text-[var(--text)] flex items-center gap-1 mt-0.5 num-tabular">
                  <Calendar className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
                  <span>{detail.received_date || '—'}</span>
                </dd>
              </div>

              <div>
                <dt className="text-[var(--text-tertiary)]">Assigned Officer</dt>
                <dd className="font-medium text-[var(--text)] flex items-center gap-1 mt-0.5 truncate">
                  <User className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
                  {isRestricted ? (
                    <RestrictedBadge />
                  ) : (
                    <span>{detail.assigned_officer || <span className="text-[var(--text-tertiary)] italic">Unassigned</span>}</span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-[var(--text-tertiary)]">Target SLA</dt>
                <dd className="font-medium text-[var(--text)] flex items-center gap-1 mt-0.5 num-tabular">
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

            {/* Description */}
            <div>
              <span className="text-[var(--text-tertiary)] font-medium flex items-center gap-1 mb-1">
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Grievance Summary:</span>
              </span>
              <div className="p-2.5 rounded bg-white border border-[var(--border)] text-[var(--text)] text-xs leading-relaxed max-h-28 overflow-y-auto">
                {isRestricted ? (
                  <RestrictedBadge />
                ) : (
                  detail.description || <span className="text-[var(--text-tertiary)] italic">No description provided</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="pt-3 mt-3 border-t border-[var(--border)] flex justify-end">
        <Link
          to={`/cases/${caseMini.case_no}`}
          className="text-xs font-medium text-[var(--brand)] hover:underline inline-flex items-center gap-1"
        >
          <span>Open case</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
};
