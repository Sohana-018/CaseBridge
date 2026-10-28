import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  getDashboardSummary,
  getDashboardWorkload,
  getRecentAlerts,
  getOverlaps,
  getCases,
  getCaseDetail,
  type DashboardSummary,
  type BureauWorkload,
  type AlertItem,
  type OverlapItem,
  type CaseItem,
} from '../api/client';
import { LoadingState, ErrorState } from '../components/StateFeedback';
import { useToast } from '../components/Toast';
import {
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  Building2,
  Calendar,
  Info,
  ChevronRight,
  User,
  Eye,
  Flame,
  CornerDownRight,
  Inbox,
} from 'lucide-react';

// ============================================================================
// Helper: Clean institution names by removing "(demo)" suffix
// ============================================================================
function cleanInstitutionName(name?: string): string {
  if (!name) return 'Institution record';
  return name.replace(/\s*\(\s*demo\s*\)/gi, '').trim();
}

// ============================================================================
// Helper: Format category string
// ============================================================================
function formatCategoryLabel(cat?: string): string {
  if (!cat) return 'General';
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================================================
// Helper: Calculate days overdue relative to today
// ============================================================================
function calculateDaysOverdue(targetDateStr?: string | null): number | null {
  if (!targetDateStr) return null;
  try {
    const target = new Date(targetDateStr).getTime();
    const now = new Date().getTime();
    const diffDays = Math.floor((now - target) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Visual Rules: Status tokens (identical everywhere on page)
// red #B42318 = overdue / SLA breach / high priority
// amber #B54708 = pending / warning
// teal #0E7490 = under process / in progress (NOT blue)
// green #067647 = disposed / success
// purple #6941C6 = escalated
// grey #344054 = neutral / transferred / reassigned
// ============================================================================
interface StatusVisual {
  text: string;
  bg: string;
  border: string;
  dot: string;
  label: string;
}

function getStatusVisual(status?: string): StatusVisual {
  const norm = (status || '').toLowerCase().trim();
  switch (norm) {
    case 'overdue':
    case 'sla_breach':
    case 'high':
      return {
        text: 'text-[#B42318]',
        bg: 'bg-[#FEF3F2]',
        border: 'border-[#FECDCA]',
        dot: 'bg-[#B42318]',
        label: norm === 'sla_breach' ? 'SLA breach' : norm === 'high' ? 'High' : 'Overdue',
      };
    case 'pending':
    case 'warning':
    case 'medium':
      return {
        text: 'text-[#B54708]',
        bg: 'bg-[#FFFAEB]',
        border: 'border-[#FEDF89]',
        dot: 'bg-[#B54708]',
        label: norm === 'pending' ? 'Pending review' : norm === 'medium' ? 'Medium' : 'Warning',
      };
    case 'under_process':
    case 'in_progress':
      return {
        text: 'text-[#0E7490]',
        bg: 'bg-[#ECFEFF]',
        border: 'border-[#A5F3FC]',
        dot: 'bg-[#0E7490]',
        label: 'Under investigation',
      };
    case 'disposed':
    case 'success':
      return {
        text: 'text-[#067647]',
        bg: 'bg-[#ECFDF3]',
        border: 'border-[#A6F4C5]',
        dot: 'bg-[#067647]',
        label: 'Disposed / closed',
      };
    case 'escalated':
      return {
        text: 'text-[#6941C6]',
        bg: 'bg-[#F9F5FF]',
        border: 'border-[#E9D7FE]',
        dot: 'bg-[#6941C6]',
        label: 'Escalated',
      };
    case 'transferred':
    case 'low':
    case 'neutral':
    default:
      return {
        text: 'text-[#344054]',
        bg: 'bg-[#F2F4F7]',
        border: 'border-[#EAECF0]',
        dot: 'bg-[#344054]',
        label: norm === 'transferred' ? 'Reassigned' : norm === 'low' ? 'Low' : norm || 'Neutral',
      };
  }
}

// Accessible Status Chip (uses text + dot, never color alone)
const StatusBadge: React.FC<{ status?: string; customLabel?: string }> = ({ status, customLabel }) => {
  const visual = getStatusVisual(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap border ${visual.bg} ${visual.text} ${visual.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${visual.dot}`} aria-hidden="true" />
      <span>{customLabel || visual.label}</span>
    </span>
  );
};

export const OverviewPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [workload, setWorkload] = useState<BureauWorkload[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [overlaps, setOverlaps] = useState<OverlapItem[]>([]);
  const [criticalBreaches, setCriticalBreaches] = useState<CaseItem[]>([]);

  // Filter state for alerts: All | SLA Breach | Reminders | Transfers
  const [alertFilter, setAlertFilter] = useState<'all' | 'sla_breach' | 'reminders' | 'transfers'>('all');

  // Selected alert for work queue split preview
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);
  const [selectedCasePreview, setSelectedCasePreview] = useState<CaseItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // Architecture strip toggle
  const [pipelineOpen, setPipelineOpen] = useState<boolean>(false);

  // Time tracking
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const deniedMessage = (location.state as { deniedMessage?: string } | null)?.deniedMessage;

  const listRef = useRef<HTMLDivElement>(null);

  // Primary data loader
  const loadData = useCallback(
    async (isRefresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const [sumRes, workRes, alertRes, overlapsRes, overdueCasesRes] = await Promise.all([
          getDashboardSummary(),
          getDashboardWorkload(),
          getRecentAlerts(50),
          getOverlaps({ review_status: 'open', page_size: 100 }).catch(() => ({ items: [], total: 0 })),
          getCases({ overdue: true, page_size: 10 }).catch(() => ({ items: [], total: 0 })),
        ]);

        setSummary(sumRes);
        setWorkload(workRes);
        setAlerts(alertRes.items || []);
        setOverlaps(overlapsRes.items || []);

        // Sort overdue cases by days overdue descending to pick the 3 most overdue breaches
        const overdueList = (overdueCasesRes.items || []).slice();
        overdueList.sort((a, b) => {
          const daysA = calculateDaysOverdue(a.expected_disposal_date) || 0;
          const daysB = calculateDaysOverdue(b.expected_disposal_date) || 0;
          return daysB - daysA;
        });
        setCriticalBreaches(overdueList.slice(0, 3));

        // Record last updated time
        const now = new Date();
        setLastUpdatedTime(
          now.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          })
        );

        if (isRefresh) {
          showToast('Dashboard metrics refreshed successfully', 'success');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch overview data';
        setError(msg);
        if (isRefresh) {
          showToast('Failed to refresh metrics', 'error');
        }
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Map overlaps by bureau to derive overlap percentages
  const overlapStatsByBureau = useMemo(() => {
    const map: Record<string, Set<string>> = {
      RB: new Set(),
      PGRC: new Set(),
      RO: new Set(),
      OC: new Set(),
    };
    overlaps.forEach((item) => {
      const bA = (item.case_a?.bureau || '').toUpperCase();
      const bB = (item.case_b?.bureau || '').toUpperCase();
      if (bA in map && item.case_a?.case_no) map[bA].add(item.case_a.case_no);
      if (bB in map && item.case_b?.case_no) map[bB].add(item.case_b.case_no);
    });
    return map;
  }, [overlaps]);

  const getOverlapPercentage = useCallback(
    (bureau: string, totalCases: number) => {
      const b = (bureau || '').toUpperCase();
      const count = overlapStatsByBureau[b]?.size || 0;
      if (!totalCases || totalCases <= 0) return '0%';
      return Math.round((count / totalCases) * 100) + '%';
    },
    [overlapStatsByBureau]
  );

  // Filter alerts based on active tab
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      if (alertFilter === 'sla_breach') {
        const t = (alert.type || '').toLowerCase();
        return t.includes('sla') || t.includes('breach');
      }
      if (alertFilter === 'reminders') {
        const t = (alert.type || '').toLowerCase();
        return t.includes('reminder') || t.includes('due') || t.includes('target');
      }
      if (alertFilter === 'transfers') {
        const t = (alert.type || '').toLowerCase();
        return t.includes('transfer');
      }
      return true;
    });
  }, [alerts, alertFilter]);

  // Tab counts
  const alertCounts = useMemo(() => {
    const sla = alerts.filter((a) => {
      const t = (a.type || '').toLowerCase();
      return t.includes('sla') || t.includes('breach');
    }).length;

    const reminders = alerts.filter((a) => {
      const t = (a.type || '').toLowerCase();
      return t.includes('reminder') || t.includes('due') || t.includes('target');
    }).length;

    const transfers = alerts.filter((a) => {
      const t = (a.type || '').toLowerCase();
      return t.includes('transfer');
    }).length;

    return { all: alerts.length, sla, reminders, transfers };
  }, [alerts]);

  // Load preview data when selected alert changes
  const activeAlert = useMemo(() => {
    if (!selectedAlertId) return null;
    return filteredAlerts.find((a) => a.id === selectedAlertId) || null;
  }, [selectedAlertId, filteredAlerts]);

  useEffect(() => {
    if (!activeAlert?.case_no) {
      setSelectedCasePreview(null);
      return;
    }

    // Check if the case is already in criticalBreaches in memory
    const existing = criticalBreaches.find((c) => c.case_no === activeAlert.case_no);
    if (existing) {
      setSelectedCasePreview(existing);
      return;
    }

    let isCurrent = true;
    setPreviewLoading(true);
    getCaseDetail(activeAlert.case_no)
      .then((data) => {
        if (isCurrent) setSelectedCasePreview(data);
      })
      .catch(() => {
        if (isCurrent) setSelectedCasePreview(null);
      })
      .finally(() => {
        if (isCurrent) setPreviewLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [activeAlert, criticalBreaches]);

  // Keyboard navigation for work queue listbox
  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (filteredAlerts.length === 0) return;

    const currentIndex = filteredAlerts.findIndex((a) => a.id === selectedAlertId);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < filteredAlerts.length - 1 ? currentIndex + 1 : 0;
      setSelectedAlertId(filteredAlerts[nextIndex].id);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : filteredAlerts.length - 1;
      setSelectedAlertId(filteredAlerts[prevIndex].id);
    } else if (e.key === 'Enter' && activeAlert?.case_no) {
      e.preventDefault();
      navigate(`/cases/${activeAlert.case_no}`);
    }
  };

  const currentDateDisplay = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const datePart = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      const timePart = d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${datePart}, ${timePart}`;
    } catch {
      return isoString;
    }
  };

  // Percentage of overdue cases vs total
  const overduePercentage = useMemo(() => {
    if (!summary || !summary.total || summary.total <= 0) return '0%';
    return ((summary.overdue / summary.total) * 100).toFixed(1) + '%';
  }, [summary]);

  return (
    <div className="cb-page-container pt-6 sm:pt-8 pb-12 space-y-6 max-w-[1280px] mx-auto">
      {/* Access Denied Notice if redirected from unauthorized route */}
      {deniedMessage && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318] flex items-start gap-3 shadow-xs"
        >
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-[#B42318]" aria-hidden="true" />
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider">Unauthorized Access</h2>
            <p className="text-xs text-[#B42318] mt-0.5">{deniedMessage}</p>
          </div>
        </div>
      )}

      {/* ====================================================================
          1. PAGE HEADER (24-32px top padding, Title, description, controls)
          ==================================================================== */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Case Monitoring Overview
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl">
            Single-window consolidated operational tracking across Regulation Bureau (RB), Grievance Cell (PGRC), Regional Offices (RO), and Other Cells (OC).
          </p>
        </div>

        {/* Action Controls: Architecture Toggle + Date + Last Updated + Refresh */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {/* Pipeline Architecture Toggle */}
          <button
            type="button"
            onClick={() => setPipelineOpen((prev) => !prev)}
            aria-expanded={pipelineOpen}
            aria-controls="pipeline-architecture-strip"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-600 ${
              pipelineOpen
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Info className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
            <span>Pipeline Architecture</span>
          </button>

          {/* Date Pill */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-medium shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>{currentDateDisplay}</span>
          </div>

          {/* Last updated label & Refresh button */}
          <div className="flex items-center gap-2">
            {lastUpdatedTime && (
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                Last updated {lastUpdatedTime}
              </span>
            )}
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={loading}
              aria-label="Refresh dashboard metrics"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* PIPELINE ARCHITECTURE ACCORDION STRIP */}
      {pipelineOpen && (
        <section
          id="pipeline-architecture-strip"
          aria-label="Cross-Bureau Coordination Pipeline Architecture"
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <Info className="w-4 h-4 text-blue-600" aria-hidden="true" />
              <span>Cross-Bureau Coordination Pipeline Architecture</span>
            </div>
            <span className="text-xs text-slate-500 hidden sm:inline">
              Canonical PID matching & multi-signal overlap scoring
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 mb-1">
                <Building2 className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                <span>1. Canonical Registry</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Institutions indexed by permanent identifier across all geographic zones.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 mb-1">
                <Inbox className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
                <span>2. Isolated Intake</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Complaints ingested into isolated bureaus (RB, PGRC, RO, OC) with role-based access.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 mb-1">
                <CornerDownRight className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                <span>3. Overlap Engine</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Automated cosine text similarity, date proximity, and category scoring flag cross-bureau pairs.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span>4. Coordinator Triage</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Coordinators inspect paired cases, record audit notes, and link related grievances.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Loading Skeleton */}
      {loading && <LoadingState message="Loading dashboard operational metrics..." />}

      {/* Error State */}
      {!loading && error && (
        <ErrorState
          title="Unable to load Overview metrics"
          message={error}
          onRetry={() => loadData(true)}
        />
      )}

      {/* MAIN CONTENT (Action-First Layout) */}
      {!loading && !error && summary && (
        <div className="space-y-6">
          {/* ====================================================================
              2. NEEDS ATTENTION HERO BAND (Full Width, One Wide Card)
              - Left: very large overdue SLA number, label, X% of total
              - Middle: top 3 most overdue/critical breaches
              - Right: stacked figures Total Complaints (222) & Coordination Queue (251)
              - Subtle red-tinted left border (#B42318)
              ==================================================================== */}
          <section
            aria-labelledby="hero-attention-heading"
            className="cb-card bg-white border border-slate-200 border-l-4 border-l-[#B42318] rounded-xl p-5 sm:p-6 shadow-xs"
          >
            <h2 id="hero-attention-heading" className="sr-only">
              Critical Attention Needed: Overdue SLA Cases
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Left Column: Very Large Overdue Number & Ratio */}
              <div className="lg:col-span-3 flex flex-col justify-center">
                <span className="text-xs font-semibold text-slate-600">
                  Overdue SLA cases
                </span>
                <div className="text-5xl sm:text-6xl font-bold text-[#B42318] num-tabular tracking-tight leading-none mt-1.5">
                  {summary.overdue}
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1.5">
                  <strong className="text-slate-800 font-semibold">{overduePercentage}</strong> of total caseload
                </p>
                <div className="mt-3">
                  <Link
                    to="/cases?overdue=true"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    <span>View all overdue cases</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* Middle Column: 3 Most Overdue Breaches */}
              <div className="lg:col-span-6 lg:border-x lg:border-slate-200 lg:px-6">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-[#B42318]" aria-hidden="true" />
                    <span>Most critical SLA breaches</span>
                  </span>
                  <span className="text-xs text-slate-500">Immediate action required</span>
                </div>

                {criticalBreaches.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">
                    No overdue cases recorded at this time.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {criticalBreaches.map((c) => {
                      const daysOverdue = calculateDaysOverdue(c.expected_disposal_date);
                      return (
                        <div
                          key={c.case_no}
                          className="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-50 hover:bg-slate-100/80 transition text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-mono font-bold text-slate-900 shrink-0">
                              {c.case_no}
                            </span>
                            <span className="text-slate-600 truncate text-xs" title={c.institution?.name}>
                              {cleanInstitutionName(c.institution?.name)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA] whitespace-nowrap">
                              {daysOverdue ? `${daysOverdue} days overdue` : 'Overdue target'}
                            </span>
                            <Link
                              to={`/cases/${c.case_no}`}
                              className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline shadow-2xs"
                              aria-label={`Inspect case ${c.case_no}`}
                            >
                              Inspect
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Stacked Figures Total Complaints (222) & Coordination Queue (251) */}
              <div className="lg:col-span-3 flex flex-col justify-center gap-4">
                {/* Total Complaints */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-600 font-medium block">
                    Total complaints
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-bold text-slate-900 num-tabular">
                      {summary.total}
                    </span>
                    <Link
                      to="/cases"
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-0.5"
                    >
                      <span>All cases</span>
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </Link>
                  </div>
                </div>

                {/* Coordination Queue */}
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-600 font-medium block">
                    Coordination queue
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-bold text-slate-900 num-tabular">
                      {summary.open_overlaps}
                    </span>
                    <Link
                      to="/overlaps"
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-0.5"
                    >
                      <span>Review</span>
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ====================================================================
              3. LIFECYCLE STRIP (Full Width, Slim Horizontal Flow)
              Registered (222) -> Pending (83) -> Under investigation (94) -> Reassigned (14) -> Disposed (9)
              Each step links to Cases filtered by that status
              ==================================================================== */}
          <section
            aria-labelledby="lifecycle-strip-heading"
            className="cb-card bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs overflow-x-auto"
          >
            <h2 id="lifecycle-strip-heading" className="sr-only">
              Case Lifecycle Status Flow
            </h2>

            <div className="flex items-center justify-between min-w-[720px] gap-2">
              {/* Step 1: Registered */}
              <Link
                to="/cases"
                className="flex-1 p-2.5 rounded-lg hover:bg-slate-50 transition border border-transparent hover:border-slate-200 group focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <span className="text-xs text-slate-600 font-medium block">
                  Registered
                </span>
                <span className="text-xl font-bold text-slate-900 num-tabular block mt-0.5 group-hover:text-blue-600 transition-colors">
                  {summary.total}
                </span>
              </Link>

              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />

              {/* Step 2: Pending Review */}
              <Link
                to="/cases?status=pending"
                className="flex-1 p-2.5 rounded-lg hover:bg-slate-50 transition border border-transparent hover:border-slate-200 group focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <span className="text-xs text-slate-600 font-medium block">
                  Pending review
                </span>
                <span className="text-xl font-bold text-slate-900 num-tabular block mt-0.5 group-hover:text-blue-600 transition-colors">
                  {summary.pending}
                </span>
              </Link>

              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />

              {/* Step 3: Under Investigation */}
              <Link
                to="/cases?status=under_process"
                className="flex-1 p-2.5 rounded-lg hover:bg-slate-50 transition border border-transparent hover:border-slate-200 group focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <span className="text-xs text-slate-600 font-medium block">
                  Under investigation
                </span>
                <span className="text-xl font-bold text-slate-900 num-tabular block mt-0.5 group-hover:text-blue-600 transition-colors">
                  {summary.under_process}
                </span>
              </Link>

              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />

              {/* Step 4: Reassigned */}
              <Link
                to="/cases?status=transferred"
                className="flex-1 p-2.5 rounded-lg hover:bg-slate-50 transition border border-transparent hover:border-slate-200 group focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <span className="text-xs text-slate-600 font-medium block">
                  Reassigned
                </span>
                <span className="text-xl font-bold text-slate-900 num-tabular block mt-0.5 group-hover:text-blue-600 transition-colors">
                  {summary.transferred}
                </span>
              </Link>

              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />

              {/* Step 5: Disposed / Closed */}
              <Link
                to="/cases?status=disposed"
                className="flex-1 p-2.5 rounded-lg hover:bg-slate-50 transition border border-transparent hover:border-slate-200 group focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <span className="text-xs text-slate-600 font-medium block">
                  Disposed / closed
                </span>
                <span className="text-xl font-bold text-slate-900 num-tabular block mt-0.5 group-hover:text-blue-600 transition-colors">
                  {summary.disposed}
                </span>
              </Link>
            </div>
          </section>

          {/* ====================================================================
              4. BUREAU HEALTH (Four Cards in a Row: RB, PGRC, RO, OC)
              - Replaces bar chart and bottom overlap chips
              - Neutral colors (dark slate fill, light grey track)
              - Links to Cases filtered by that bureau
              - "Detailed reports" link to Reports page
              ==================================================================== */}
          <section aria-labelledby="bureau-health-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="bureau-health-heading" className="text-sm font-bold text-slate-900">
                  Bureau Health & Caseload
                </h2>
                <p className="text-xs text-slate-500">
                  Caseload volume and SLA compliance breakdown across regulatory bodies
                </p>
              </div>
              <Link
                to="/reports"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
              >
                <span>Detailed reports</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>

            {/* 4 Cards Grid (2x2 on <=1024px, 1 col on <=640px) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {workload.map((b) => {
                const overlapPct = getOverlapPercentage(b.bureau, b.total);
                const nonOverdueOpen = Math.max(0, b.open - b.overdue);
                const openPct = b.total > 0 ? (nonOverdueOpen / b.total) * 100 : 0;
                const overduePct = b.total > 0 ? (b.overdue / b.total) * 100 : 0;

                const bureauFullName =
                  b.bureau === 'RB'
                    ? 'Regulation Bureau'
                    : b.bureau === 'PGRC'
                    ? 'Grievance Cell'
                    : b.bureau === 'RO'
                    ? 'Regional Offices'
                    : 'Other Cells';

                return (
                  <Link
                    key={b.bureau}
                    to={`/cases?bureau=${b.bureau}`}
                    className="cb-card p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-md transition block group focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    {/* Bureau Code & Overlap Chip */}
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          {b.bureau}
                        </span>
                        <span className="text-xs text-slate-500 block">
                          {bureauFullName}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                        {overlapPct} overlap
                      </span>
                    </div>

                    {/* Total Cases Number */}
                    <div className="mt-3">
                      <span className="text-3xl font-bold text-slate-900 num-tabular tracking-tight group-hover:text-blue-600 transition-colors">
                        {b.total}
                      </span>
                      <span className="text-xs text-slate-500 ml-1.5 font-medium">total cases</span>
                    </div>

                    {/* Thin Stacked Bar (Dark Slate for Open, Red for Overdue, Light Grey track) */}
                    <div
                      className="mt-3 mb-2 h-2 w-full bg-slate-100 rounded-full overflow-hidden flex"
                      role="progressbar"
                      aria-valuenow={b.open}
                      aria-valuemin={0}
                      aria-valuemax={b.total}
                      aria-label={`${b.bureau} open and overdue breakdown`}
                    >
                      <div
                        style={{ width: `${openPct}%` }}
                        className="bg-slate-700 h-full"
                        title={`Open within SLA: ${nonOverdueOpen}`}
                      />
                      <div
                        style={{ width: `${overduePct}%` }}
                        className="bg-[#B42318] h-full"
                        title={`Overdue: ${b.overdue}`}
                      />
                    </div>

                    {/* Text: Open N, Overdue N */}
                    <div className="flex items-center justify-between text-xs text-slate-600 font-medium num-tabular">
                      <span>Open {b.open}</span>
                      <span className={b.overdue > 0 ? 'text-[#B42318] font-semibold' : ''}>
                        Overdue {b.overdue}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ====================================================================
              5. WORK QUEUE (Main Working Area, Two Panes)
              - Left Pane (~60%): Priority Alerts list with filter tabs
              - Right Pane (~40%): Preview of selected case with Inspect case button
              - Below 1024px: Preview opens below the list
              - Keyboard support: Up/Down moves selection, Enter opens Inspect
              ==================================================================== */}
          <section aria-labelledby="work-queue-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="work-queue-heading" className="text-sm font-bold text-slate-900">
                  Priority Action Work Queue
                </h2>
                <p className="text-xs text-slate-500">
                  Actionable SLA breaches, target deadlines, and coordinator alerts
                </p>
              </div>
              <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                Use ↑ / ↓ arrow keys to navigate, Enter to inspect
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT PANE (lg:col-span-7, ~60%): Priority Alerts List */}
              <div className="lg:col-span-7 cb-card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs flex flex-col">
                {/* Header Strip: Active count + Filter tabs */}
                <div className="p-3.5 sm:p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">Active alerts</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 num-tabular">
                      {filteredAlerts.length}
                    </span>
                  </div>

                  {/* Filter Tabs */}
                  <div
                    role="tablist"
                    aria-label="Filter alerts"
                    className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={alertFilter === 'all'}
                      onClick={() => setAlertFilter('all')}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                        alertFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All ({alertCounts.all})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={alertFilter === 'sla_breach'}
                      onClick={() => setAlertFilter('sla_breach')}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                        alertFilter === 'sla_breach'
                          ? 'bg-white text-slate-900 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      SLA breach ({alertCounts.sla})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={alertFilter === 'reminders'}
                      onClick={() => setAlertFilter('reminders')}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                        alertFilter === 'reminders'
                          ? 'bg-white text-slate-900 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Reminders ({alertCounts.reminders})
                    </button>
                    {alertCounts.transfers > 0 && (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={alertFilter === 'transfers'}
                        onClick={() => setAlertFilter('transfers')}
                        className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                          alertFilter === 'transfers'
                            ? 'bg-white text-slate-900 shadow-xs font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Transfers ({alertCounts.transfers})
                      </button>
                    )}
                  </div>
                </div>

                {/* Scrollable Alerts List (Shows exactly 4 items without scrolling; scroll to see remaining) */}
                <div
                  ref={listRef}
                  role="listbox"
                  tabIndex={0}
                  aria-label="Priority alerts list"
                  onKeyDown={handleListKeyDown}
                  className="max-h-[264px] overflow-y-auto divide-y divide-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  {filteredAlerts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 space-y-2">
                      <CheckCircle2 className="w-7 h-7 text-[#067647] mx-auto opacity-80" aria-hidden="true" />
                      <p className="font-semibold text-slate-800">
                        No priority alerts. All cases are within SLA.
                      </p>
                      <p className="text-slate-500 max-w-sm mx-auto">
                        There are currently no open alerts or breaches matching the active filter.
                      </p>
                    </div>
                  ) : (
                    filteredAlerts.map((alert) => {
                      const isSelected = alert.id === selectedAlertId;
                      const priorityNorm = (alert.priority || '').toLowerCase();
                      const typeLabel =
                        (alert.type || '').toLowerCase().includes('sla') || (alert.type || '').toLowerCase().includes('breach')
                          ? 'SLA breach'
                          : (alert.type || '').toLowerCase().includes('reminder')
                          ? 'Reminder'
                          : alert.type.replace('_', ' ');

                      const typeStatus = typeLabel === 'SLA breach' ? 'overdue' : 'neutral';

                      return (
                        <div
                          key={alert.id}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => setSelectedAlertId(alert.id)}
                          className={`px-3.5 py-2.5 transition cursor-pointer select-none text-xs flex flex-col gap-1 ${
                            isSelected
                              ? 'bg-blue-50/70 border-l-4 border-l-blue-600 shadow-2xs'
                              : 'hover:bg-slate-50/80 border-l-4 border-l-transparent'
                          }`}
                        >
                          {/* Row 1: Case ID, Priority badge, Type badge, Timestamp on right */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {alert.case_no ? (
                                <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                                  {alert.case_no}
                                </span>
                              ) : (
                                <span className="font-mono text-xs text-slate-400">Alert #{alert.id}</span>
                              )}
                              {/* Priority badge: never wraps or truncates */}
                              <StatusBadge status={priorityNorm} />
                              {/* Type badge: never wraps or truncates */}
                              <StatusBadge status={typeStatus} customLabel={typeLabel} />
                            </div>

                            {/* Timestamp in right-aligned column */}
                            <span className="text-[11px] text-slate-500 whitespace-nowrap font-medium shrink-0">
                              {formatDateTime(alert.created_at)}
                            </span>
                          </div>

                          {/* Row 2: Alert Description */}
                          <p className="text-slate-700 text-xs leading-snug line-clamp-1">
                            {alert.message}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer status summary */}
                <div className="p-2.5 px-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Showing {filteredAlerts.length} of {alerts.length} total alerts
                  </span>
                  <Link
                    to="/cases?overdue=true"
                    className="font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                  >
                    <span>All overdue cases</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* RIGHT PANE (lg:col-span-5, ~40%): Selected Case Preview */}
              <div
                aria-live="polite"
                aria-atomic="true"
                className="lg:col-span-5 cb-card bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between sticky top-20"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-blue-600" aria-hidden="true" />
                      <h3 className="font-bold text-sm text-slate-900">Case Preview</h3>
                    </div>
                    {activeAlert?.case_no && (
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                        {activeAlert.case_no}
                      </span>
                    )}
                  </div>

                  {/* Empty state: nothing selected */}
                  {!selectedAlertId && (
                    <div className="py-12 px-4 text-center text-xs text-slate-500 space-y-3">
                      <div
                        className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto"
                        aria-hidden="true"
                      >
                        <Eye className="w-6 h-6" />
                      </div>
                      <h4 className="font-bold text-slate-800 text-sm">Select an alert to preview</h4>
                      <p className="text-slate-500 max-w-xs mx-auto leading-relaxed">
                        Choose any item from the work queue on the left to inspect case status, SLA deadlines, institution details, and take action.
                      </p>
                    </div>
                  )}

                  {/* Loading preview state */}
                  {selectedAlertId && previewLoading && (
                    <div className="space-y-3 py-6 animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-1/3" />
                      <div className="h-4 bg-slate-200 rounded w-2/3" />
                      <div className="h-20 bg-slate-200 rounded w-full mt-4" />
                    </div>
                  )}

                  {/* Selected Alert Details */}
                  {selectedAlertId && !previewLoading && (
                    <div className="space-y-4 text-xs">
                      {/* Case Identifiers & Status Chips */}
                      {selectedCasePreview ? (
                        <>
                          <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                Bureau {selectedCasePreview.bureau}
                              </span>
                              <StatusBadge status={selectedCasePreview.status} />
                              {selectedCasePreview.priority && (
                                <StatusBadge status={selectedCasePreview.priority} />
                              )}
                            </div>
                          </div>

                          {/* Case Attributes Definition List */}
                          <dl className="grid grid-cols-2 gap-3 pt-1 text-xs">
                            <div className="col-span-2">
                              <dt className="text-slate-500 font-medium">Institution</dt>
                              <dd className="font-semibold text-slate-900 mt-0.5">
                                {cleanInstitutionName(selectedCasePreview.institution?.name)}
                                {selectedCasePreview.institution?.permanent_id && (
                                  <span className="font-mono text-slate-500 block text-[11px] font-normal mt-0.5">
                                    PID: {selectedCasePreview.institution.permanent_id} · Region: {selectedCasePreview.institution.region}
                                  </span>
                                )}
                              </dd>
                            </div>

                            <div>
                              <dt className="text-slate-500 font-medium">Category</dt>
                              <dd className="font-semibold text-slate-900 mt-0.5">
                                {formatCategoryLabel(selectedCasePreview.category)}
                              </dd>
                            </div>

                            <div>
                              <dt className="text-slate-500 font-medium">Assigned Officer</dt>
                              <dd className="font-semibold text-slate-900 mt-0.5 flex items-center gap-1">
                                <User className="w-3 h-3 text-slate-400" aria-hidden="true" />
                                <span>{selectedCasePreview.assigned_officer || 'Unassigned'}</span>
                              </dd>
                            </div>

                            <div className="col-span-2">
                              <dt className="text-slate-500 font-medium">Target SLA Date</dt>
                              <dd className="font-semibold text-slate-900 mt-0.5 flex items-center gap-2 flex-wrap">
                                <span className="num-tabular">
                                  {selectedCasePreview.expected_disposal_date || 'No target date'}
                                </span>
                                {selectedCasePreview.overdue && (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA]">
                                    {calculateDaysOverdue(selectedCasePreview.expected_disposal_date)
                                      ? `${calculateDaysOverdue(selectedCasePreview.expected_disposal_date)} days overdue`
                                      : 'SLA overdue'}
                                  </span>
                                )}
                              </dd>
                            </div>

                            {selectedCasePreview.last_action && (
                              <div className="col-span-2">
                                <dt className="text-slate-500 font-medium">Last Action</dt>
                                <dd className="text-slate-700 mt-0.5">
                                  {selectedCasePreview.last_action}
                                  {selectedCasePreview.last_action_date && (
                                    <span className="text-slate-400 ml-1">
                                      ({selectedCasePreview.last_action_date})
                                    </span>
                                  )}
                                </dd>
                              </div>
                            )}
                          </dl>

                          {/* Grievance Description Preview */}
                          {selectedCasePreview.description && (
                            <div className="pt-2 border-t border-slate-100">
                              <span className="text-slate-500 font-medium block mb-1">
                                Grievance Description
                              </span>
                              <p className="text-slate-700 text-xs leading-relaxed max-h-28 overflow-y-auto p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                                {selectedCasePreview.description}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        /* Fallback if full case detail is not linked */
                        <div className="space-y-3 py-2">
                          <div>
                            <span className="text-slate-500 font-medium block">Alert Message</span>
                            <p className="text-slate-800 text-xs mt-1 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                              {activeAlert?.message}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">Created:</span>
                            <span className="text-slate-800 font-medium">{formatDateTime(activeAlert?.created_at)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Primary Action Button: Inspect Case */}
                {selectedAlertId && activeAlert?.case_no && (
                  <div className="pt-4 mt-4 border-t border-slate-200">
                    <Link
                      to={`/cases/${activeAlert.case_no}`}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
                    >
                      <span>Inspect case</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
