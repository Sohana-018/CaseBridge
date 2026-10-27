import React, { useEffect, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  getDashboardSummary,
  getDashboardWorkload,
  getRecentAlerts,
  type DashboardSummary,
  type BureauWorkload,
  type AlertItem,
} from '../api/client';
import { PriorityChip } from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import { useToast } from '../components/Toast';
import {
  Clock,
  RotateCw,
  CheckCircle2,
  ArrowRightLeft,
  Flame,
  AlertOctagon,
  Bell,
  ArrowRight,
  BarChart3,
  RefreshCw,
  ShieldAlert,
  GitCompare,
  Layers,
  Building2,
  Calendar,
  Sliders,
  ChevronDown,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

export const OverviewPage: React.FC = () => {
  const location = useLocation();
  const { showToast } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [workload, setWorkload] = useState<BureauWorkload[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pipelineOpen, setPipelineOpen] = useState<boolean>(false);
  const deniedMessage = (location.state as { deniedMessage?: string } | null)?.deniedMessage;

  const loadData = useCallback(async (isRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, workRes, alertRes] = await Promise.all([
        getDashboardSummary(),
        getDashboardWorkload(),
        getRecentAlerts(15),
      ]);
      setSummary(sumRes);
      setWorkload(workRes);
      setAlerts(alertRes.items || []);
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
  }, [showToast]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const currentDateDisplay = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="cb-page-container space-y-6">
      {/* Access Denied Notice if redirected */}
      {deniedMessage && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-[var(--danger-bg)] border border-[#FECDCA] text-[var(--danger)] flex items-start gap-3 shadow-xs"
        >
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">Unauthorized Access</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{deniedMessage}</p>
          </div>
        </div>
      )}

      {/* Page Header Pattern */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold text-[var(--text)] tracking-tight">
            Case Monitoring Overview
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
            Single-window consolidated tracking across Regulation Bureau (RB), Grievance Cell (PGRC), Regional Offices (RO), and Other Cells (OC).
          </p>
        </div>

        {/* Date & Refresh Controls */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[var(--border)] text-[var(--text-secondary)] text-xs font-medium shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
            <span>{currentDateDisplay}</span>
          </div>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={loading}
            aria-label="Refresh dashboard data"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[var(--border-input)] text-[var(--text)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition shadow-xs cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[var(--text-secondary)] ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
        </div>
      </section>

      {/* Loading & Error States */}
      {loading && <LoadingState message="Fetching dashboard metrics and alerts..." />}

      {!loading && error && (
        <ErrorState
          title="Unable to load Overview metrics"
          message={error}
          onRetry={() => loadData(true)}
        />
      )}

      {!loading && !error && summary && (
        <div className="space-y-6">
          {/* Main 4 KPI Cards (White surfaces, no gradients) */}
          <section aria-labelledby="kpi-metrics-heading">
            <h2 id="kpi-metrics-heading" className="sr-only">Key Operational Indicators</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Total Cases */}
              <div className="cb-card p-5 flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                      Total Cases
                    </span>
                    <div className="text-[32px] font-semibold text-[var(--text)] tracking-tight mt-1 num-tabular">
                      {summary.total}
                    </div>
                  </div>
                  <div
                    className="w-9 h-9 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <Layers className="w-4 h-4 text-[var(--brand)]" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] text-xs">
                  <span className="text-[var(--text-tertiary)]">Across 4 bureaus</span>
                  <Link
                    to="/cases"
                    className="font-medium text-[var(--brand)] hover:underline inline-flex items-center gap-1"
                  >
                    <span>View all</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* 2. Under Investigation */}
              <div className="cb-card p-5 flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                      Under Investigation
                    </span>
                    <div className="text-[32px] font-semibold text-[var(--text)] tracking-tight mt-1 num-tabular">
                      {summary.under_process}
                    </div>
                  </div>
                  <div
                    className="w-9 h-9 rounded-lg bg-[var(--info-bg)] border border-[#B2DDFF] flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <RotateCw className="w-4 h-4 text-[var(--info)]" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] text-xs">
                  <span className="text-[var(--text-tertiary)]">Active inquiry workflow</span>
                  <Link
                    to="/cases?status=under_process"
                    className="font-medium text-[var(--brand)] hover:underline inline-flex items-center gap-1"
                  >
                    <span>View active</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* 3. Coordination Queue (Action required: subtle warning tint) */}
              <div className="cb-card p-5 border-l-4 border-l-[var(--warning)] flex flex-col justify-between bg-white">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        Coordination Queue
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-[var(--warning-bg)] text-[var(--warning)] border border-[#FEDF89]">
                        Review
                      </span>
                    </div>
                    <div className="text-[32px] font-semibold text-[var(--text)] tracking-tight mt-1 num-tabular">
                      {summary.open_overlaps}
                    </div>
                  </div>
                  <div
                    className="w-9 h-9 rounded-lg bg-[var(--warning-bg)] border border-[#FEDF89] flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <GitCompare className="w-4 h-4 text-[var(--warning)]" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] text-xs">
                  <span className="text-[var(--text-tertiary)]">Candidate pairs flagged</span>
                  <Link
                    to="/overlaps"
                    className="font-medium text-[var(--brand)] hover:underline inline-flex items-center gap-1"
                  >
                    <span>Review queue</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* 4. Overdue SLA Target (Promoted to main row, subtle danger accent) */}
              <div className="cb-card p-5 border-l-4 border-l-[var(--danger)] flex flex-col justify-between bg-white">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        Overdue SLA Target
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-[var(--danger-bg)] text-[var(--danger)] border border-[#FECDCA]">
                        Action
                      </span>
                    </div>
                    <div className="text-[32px] font-semibold text-[var(--danger)] tracking-tight mt-1 num-tabular">
                      {summary.overdue}
                    </div>
                  </div>
                  <div
                    className="w-9 h-9 rounded-lg bg-[var(--danger-bg)] border border-[#FECDCA] flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <AlertOctagon className="w-4 h-4 text-[var(--danger)]" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] text-xs">
                  <span className="text-[var(--text-tertiary)]">Past expected target</span>
                  <Link
                    to="/cases?overdue=true"
                    className="font-medium text-[var(--danger)] hover:underline inline-flex items-center gap-1"
                  >
                    <span>View overdue</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* Secondary Status Strip (Disposed, Pending, Reassigned, Escalated) */}
          <section
            aria-labelledby="secondary-metrics-heading"
            className="cb-card p-4 sm:p-5"
          >
            <h2 id="secondary-metrics-heading" className="sr-only">Detailed Status Metrics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border)]">
              {/* Pending */}
              <Link
                to="/cases?status=pending"
                className="group p-2 rounded-lg hover:bg-[var(--bg-subtle)] transition flex items-center gap-3"
              >
                <div
                  className="w-9 h-9 rounded-lg bg-[var(--warning-bg)] text-[var(--warning)] flex items-center justify-center shrink-0 border border-[#FEDF89]"
                  aria-hidden="true"
                >
                  <Clock className="w-4 h-4 text-[var(--warning)]" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-[var(--text)] num-tabular">
                    {summary.pending}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] font-medium">Pending Review</div>
                </div>
              </Link>

              {/* Reassigned / Transferred */}
              <Link
                to="/cases?status=transferred"
                className="group p-2 rounded-lg hover:bg-[var(--bg-subtle)] transition flex items-center gap-3 pt-3 sm:pt-2 sm:pl-4"
              >
                <div
                  className="w-9 h-9 rounded-lg bg-[var(--neutral-bg)] text-[var(--neutral)] flex items-center justify-center shrink-0 border border-[var(--border)]"
                  aria-hidden="true"
                >
                  <ArrowRightLeft className="w-4 h-4 text-[var(--neutral)]" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-[var(--text)] num-tabular">
                    {summary.transferred}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] font-medium">Reassigned Bureau</div>
                </div>
              </Link>

              {/* Escalated */}
              <Link
                to="/cases?status=escalated"
                className="group p-2 rounded-lg hover:bg-[var(--bg-subtle)] transition flex items-center gap-3 pt-3 sm:pt-2 sm:pl-4"
              >
                <div
                  className="w-9 h-9 rounded-lg bg-[var(--escalated-bg)] text-[var(--escalated)] flex items-center justify-center shrink-0 border border-[#E9D7FE]"
                  aria-hidden="true"
                >
                  <Flame className="w-4 h-4 text-[var(--escalated)]" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-[var(--text)] num-tabular">
                    {summary.escalated}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] font-medium">Escalated Priority</div>
                </div>
              </Link>

              {/* Disposed */}
              <Link
                to="/cases?status=disposed"
                className="group p-2 rounded-lg hover:bg-[var(--bg-subtle)] transition flex items-center gap-3 pt-3 sm:pt-2 sm:pl-4"
              >
                <div
                  className="w-9 h-9 rounded-lg bg-[var(--success-bg)] text-[var(--success)] flex items-center justify-center shrink-0 border border-[#A6F4C5]"
                  aria-hidden="true"
                >
                  <CheckCircle2 className="w-4 h-4 text-[var(--success)]" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-[var(--text)] num-tabular">
                    {summary.disposed}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] font-medium">Disposed / Closed</div>
                </div>
              </Link>
            </div>
          </section>

          {/* Cross-Bureau Coordination Pipeline (Restyled as compact light panel) */}
          <section className="cb-card overflow-hidden">
            <button
              type="button"
              onClick={() => setPipelineOpen((prev) => !prev)}
              aria-expanded={pipelineOpen}
              aria-controls="coordination-pipeline-content"
              className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-[var(--bg-subtle)] transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[var(--brand)]" aria-hidden="true" />
                <h2 className="text-xs font-semibold text-[var(--text)]">
                  Cross-Bureau Coordination Pipeline Architecture
                </h2>
                <span className="text-xs text-[var(--text-tertiary)] hidden sm:inline">
                  — Canonical PID matching & multi-signal overlap scoring
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] font-medium">
                <span>{pipelineOpen ? 'Hide details' : 'How it works'}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-150 ${pipelineOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </div>
            </button>

            {pipelineOpen && (
              <div id="coordination-pipeline-content" className="p-5 pt-2 border-t border-[var(--border)] bg-[var(--bg-subtle)]">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white border border-[var(--border)] rounded-lg p-3.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--brand)] mb-1">
                      <Building2 className="w-4 h-4" aria-hidden="true" />
                      <span>1. Canonical Registry</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Institutions indexed by permanent identifier across all geographic zones.
                    </p>
                  </div>

                  <div className="bg-white border border-[var(--border)] rounded-lg p-3.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--info)] mb-1">
                      <Sliders className="w-4 h-4" aria-hidden="true" />
                      <span>2. Isolated Intake</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Complaints ingested into isolated bureaus (RB, PGRC, RO, OC) with role-based access.
                    </p>
                  </div>

                  <div className="bg-white border border-[var(--border)] rounded-lg p-3.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--warning)] mb-1">
                      <GitCompare className="w-4 h-4" aria-hidden="true" />
                      <span>3. Overlap Engine</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Automated cosine text similarity, date proximity, and category scoring flag cross-bureau pairs.
                    </p>
                  </div>

                  <div className="bg-white border border-[var(--border)] rounded-lg p-3.5 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--success)] mb-1">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      <span>4. Human Adjudication</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Authorized coordinators inspect paired cases, record audit notes, and align bureau actions.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Charts & Alerts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Bureau Workload Chart Card (7 cols) */}
            <div className="lg:col-span-7 cb-card p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg bg-[var(--brand-subtle)] border border-[var(--border)] flex items-center justify-center shrink-0"
                      aria-hidden="true"
                    >
                      <BarChart3 className="w-4 h-4 text-[var(--brand)]" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--text)]">Bureau Workload Distribution</h2>
                      <p className="text-xs text-[var(--text-secondary)]">Total, Open, and Overdue complaints per Bureau</p>
                    </div>
                  </div>

                  <Link
                    to="/reports"
                    className="text-xs font-medium text-[var(--brand)] hover:underline inline-flex items-center gap-1"
                  >
                    <span>Reports</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>

                {workload.length === 0 ? (
                  <EmptyState
                    title="No workload data"
                    message="No case records were returned by the workload API endpoint."
                  />
                ) : (
                  <div
                    role="img"
                    aria-label="Bureau workload distribution chart comparing total cases, open cases, and overdue SLA cases across operational bureaus"
                    className="h-72 w-full pt-2"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={workload}
                        margin={{ top: 18, right: 10, left: -15, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E7EC" />
                        <XAxis
                          dataKey="bureau"
                          tickLine={false}
                          axisLine={{ stroke: '#E4E7EC' }}
                          tick={{ fill: '#475467', fontSize: 12, fontWeight: 600 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#667085', fontSize: 11 }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '8px',
                            color: '#101828',
                            fontSize: '12px',
                            border: '1px solid #E4E7EC',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            padding: '8px 12px',
                          }}
                          itemStyle={{ color: '#101828', padding: '2px 0' }}
                        />
                        <Legend
                          verticalAlign="top"
                          align="right"
                          wrapperStyle={{ paddingBottom: '12px', fontSize: '12px', color: '#475467' }}
                        />
                        {/* Total: light outlined bar, not darkest */}
                        <Bar
                          dataKey="total"
                          name="Total Cases"
                          fill="#F2F4F7"
                          stroke="#667085"
                          strokeWidth={1.5}
                          radius={[4, 4, 0, 0]}
                        />
                        {/* Open: Brand Navy */}
                        <Bar
                          dataKey="open"
                          name="Open Cases"
                          fill="#1E3A8A"
                          radius={[4, 4, 0, 0]}
                        />
                        {/* Overdue: Danger Red */}
                        <Bar
                          dataKey="overdue"
                          name="Overdue SLA"
                          fill="#B42318"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Priority Alerts Card (5 cols) */}
            <div className="lg:col-span-5 cb-card p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg bg-[var(--warning-bg)] border border-[#FEDF89] flex items-center justify-center shrink-0"
                      aria-hidden="true"
                    >
                      <Bell className="w-4 h-4 text-[var(--warning)]" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--text)]">Priority Alerts</h2>
                      <p className="text-xs text-[var(--text-secondary)]">Impending SLA breaches & notifications</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--neutral-bg)] text-[var(--neutral)] num-tabular">
                    {alerts.length} Active
                  </span>
                </div>

                {alerts.length === 0 ? (
                  <EmptyState
                    title="No open alerts"
                    message="All notifications and SLA targets have been monitored and cleared."
                  />
                ) : (
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {alerts.slice(0, 5).map((alert) => (
                      <div
                        key={alert.id}
                        className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-white hover:border-[var(--brand)] transition shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <PriorityChip priority={alert.priority} />
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--neutral-bg)] text-[var(--neutral)] font-medium">
                              {alert.type.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap">
                            {formatDateTime(alert.created_at)}
                          </span>
                        </div>

                        <p className="text-xs text-[var(--text)] leading-snug font-medium mb-1.5">
                          {alert.message}
                        </p>

                        {alert.case_no && (
                          <div className="pt-1.5 border-t border-[var(--border)] flex items-center justify-between">
                            <span className="text-xs font-mono font-medium text-[var(--text-secondary)]">
                              {alert.case_no}
                            </span>
                            <Link
                              to={`/cases/${alert.case_no}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] hover:underline"
                            >
                              <span>Inspect case</span>
                              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                            </Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
