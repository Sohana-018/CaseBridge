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
          {/* Main 4 KPI Cards (Clean White Institutional Cards) */}
          <section aria-labelledby="kpi-metrics-heading">
            <h2 id="kpi-metrics-heading" className="sr-only">Key Operational Indicators</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Total Complaints */}
              <div className="cb-card p-5 bg-white border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-sm transition rounded-xl flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Total Complaints
                    </span>
                    <div className="text-[34px] font-bold text-slate-900 tracking-tight mt-1 num-tabular leading-none">
                      {summary.total}
                    </div>
                  </div>
                  <div
                    className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <Layers className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <span className="text-slate-500 font-medium">Across 4 Bureaus</span>
                  <Link
                    to="/cases"
                    className="font-semibold text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1"
                  >
                    <span>View all cases</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* 2. Under Investigation */}
              <div className="cb-card p-5 bg-white border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-sm transition rounded-xl flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Under Investigation
                    </span>
                    <div className="text-[34px] font-bold text-slate-900 tracking-tight mt-1 num-tabular leading-none">
                      {summary.under_process}
                    </div>
                  </div>
                  <div
                    className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200/60 flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <RotateCw className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <span className="text-slate-500 font-medium">Active inquiry workflow</span>
                  <Link
                    to="/cases?status=under_process"
                    className="font-semibold text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1"
                  >
                    <span>View active</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* 3. Coordination Queue */}
              <div className="cb-card p-5 bg-white border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-sm transition rounded-xl flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Coordination Queue
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                        Review
                      </span>
                    </div>
                    <div className="text-[34px] font-bold text-slate-900 tracking-tight mt-1 num-tabular leading-none">
                      {summary.open_overlaps}
                    </div>
                  </div>
                  <div
                    className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60 flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <GitCompare className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <span className="text-slate-500 font-medium">Cross-bureau overlaps</span>
                  <Link
                    to="/overlaps"
                    className="font-semibold text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Review queue</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* 4. Overdue SLA Target */}
              <div className="cb-card p-5 bg-white border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-sm transition rounded-xl flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Overdue SLA Target
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-300">
                        Breach
                      </span>
                    </div>
                    <div className="text-[34px] font-bold text-rose-700 tracking-tight mt-1 num-tabular leading-none">
                      {summary.overdue}
                    </div>
                  </div>
                  <div
                    className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 border border-rose-200/60 flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <AlertOctagon className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <span className="text-slate-500 font-medium">Target resolution exceeded</span>
                  <Link
                    to="/cases?overdue=true"
                    className="font-bold text-rose-700 hover:text-rose-900 hover:underline inline-flex items-center gap-1"
                  >
                    <span>View overdue</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* Secondary Status Strip (Clean, Authentic White Cards) */}
          <section aria-labelledby="secondary-metrics-heading">
            <h2 id="secondary-metrics-heading" className="sr-only">Detailed Status Metrics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Pending Review */}
              <Link
                to="/cases?status=pending"
                className="group p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs transition flex items-center gap-3.5"
              >
                <div
                  className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 num-tabular leading-tight">
                    {summary.pending}
                  </div>
                  <div className="text-xs text-slate-600 font-semibold">Pending Review</div>
                </div>
              </Link>

              {/* Reassigned Bureau */}
              <Link
                to="/cases?status=transferred"
                className="group p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs transition flex items-center gap-3.5"
              >
                <div
                  className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 num-tabular leading-tight">
                    {summary.transferred}
                  </div>
                  <div className="text-xs text-slate-600 font-semibold">Reassigned Bureau</div>
                </div>
              </Link>

              {/* Escalated */}
              <Link
                to="/cases?status=escalated"
                className="group p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs transition flex items-center gap-3.5"
              >
                <div
                  className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 border border-purple-200/60 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 num-tabular leading-tight">
                    {summary.escalated}
                  </div>
                  <div className="text-xs text-slate-600 font-semibold">Escalated Priority</div>
                </div>
              </Link>

              {/* Disposed */}
              <Link
                to="/cases?status=disposed"
                className="group p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs transition flex items-center gap-3.5"
              >
                <div
                  className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 num-tabular leading-tight">
                    {summary.disposed}
                  </div>
                  <div className="text-xs text-slate-600 font-semibold">Disposed / Closed</div>
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
              <div id="coordination-pipeline-content" className="p-5 pt-2 border-t border-slate-200 bg-slate-50/70">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-900 mb-1.5">
                      <Building2 className="w-4 h-4 text-blue-700" aria-hidden="true" />
                      <span>1. Canonical Registry</span>
                    </div>
                    <p className="text-xs text-blue-950/80 leading-relaxed">
                      Institutions indexed by permanent identifier across all geographic zones.
                    </p>
                  </div>

                  <div className="bg-teal-50/80 border border-teal-200 rounded-xl p-4 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-bold text-teal-900 mb-1.5">
                      <Sliders className="w-4 h-4 text-teal-700" aria-hidden="true" />
                      <span>2. Isolated Intake</span>
                    </div>
                    <p className="text-xs text-teal-950/80 leading-relaxed">
                      Complaints ingested into isolated bureaus (RB, PGRC, RO, OC) with role-based access.
                    </p>
                  </div>

                  <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-950 mb-1.5">
                      <GitCompare className="w-4 h-4 text-amber-700" aria-hidden="true" />
                      <span>3. Overlap Engine</span>
                    </div>
                    <p className="text-xs text-amber-950/80 leading-relaxed">
                      Automated cosine text similarity, date proximity, and category scoring flag cross-bureau pairs.
                    </p>
                  </div>

                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-4 shadow-2xs">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-950 mb-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                      <span>4. Human Adjudication</span>
                    </div>
                    <p className="text-xs text-emerald-950/80 leading-relaxed">
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
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-blue-500/20"
                      aria-hidden="true"
                    >
                      <BarChart3 className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Bureau Workload Distribution</h2>
                      <p className="text-xs text-slate-600">Total, Open, and Overdue complaints per Bureau</p>
                    </div>
                  </div>

                  <Link
                    to="/reports"
                    className="text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Detailed reports</span>
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
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#CBD5E1" />
                        <XAxis
                          dataKey="bureau"
                          tickLine={false}
                          axisLine={{ stroke: '#CBD5E1' }}
                          tick={{ fill: '#334155', fontSize: 12, fontWeight: 700 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#64748B', fontSize: 11 }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '10px',
                            color: '#0F172A',
                            fontSize: '12px',
                            border: '1px solid #CBD5E1',
                            boxShadow: '0 8px 16px -2px rgba(15, 23, 42, 0.1)',
                            padding: '8px 12px',
                          }}
                          itemStyle={{ color: '#0F172A', padding: '2px 0' }}
                        />
                        <Legend
                          verticalAlign="top"
                          align="right"
                          wrapperStyle={{ paddingBottom: '12px', fontSize: '12px', color: '#475467' }}
                        />
                        {/* Total: Steel Slate */}
                        <Bar
                          dataKey="total"
                          name="Total Cases"
                          fill="#94A3B8"
                          radius={[4, 4, 0, 0]}
                        />
                        {/* Open: Vivid Royal Blue */}
                        <Bar
                          dataKey="open"
                          name="Open Cases"
                          fill="#2563EB"
                          radius={[4, 4, 0, 0]}
                        />
                        {/* Overdue: Bold Crimson Red */}
                        <Bar
                          dataKey="overdue"
                          name="Overdue SLA"
                          fill="#DC2626"
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
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-sm shadow-amber-500/20"
                      aria-hidden="true"
                    >
                      <Bell className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Priority Alerts</h2>
                      <p className="text-xs text-slate-600">Impending SLA breaches & notifications</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-950 border border-amber-300 num-tabular">
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
                    {alerts.slice(0, 5).map((alert) => {
                      const isHigh = alert.priority?.toLowerCase() === 'high';
                      const isMed = alert.priority?.toLowerCase() === 'medium';
                      const borderClass = isHigh
                        ? 'border-l-4 border-l-rose-600 bg-rose-50/50 border-y border-r border-rose-200'
                        : isMed
                        ? 'border-l-4 border-l-amber-500 bg-amber-50/40 border-y border-r border-amber-200'
                        : 'border-l-4 border-l-blue-500 bg-blue-50/40 border-y border-r border-blue-200';

                      return (
                        <div
                          key={alert.id}
                          className={`p-3 rounded-lg ${borderClass} hover:shadow-xs transition`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <PriorityChip priority={alert.priority} />
                              <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-white text-slate-700 border border-slate-200">
                                {alert.type.replace('_', ' ')}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 whitespace-nowrap font-medium">
                              {formatDateTime(alert.created_at)}
                            </span>
                          </div>

                          <p className="text-xs text-slate-900 leading-snug font-medium mb-1.5">
                            {alert.message}
                          </p>

                          {alert.case_no && (
                            <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between">
                              <span className="text-xs font-mono font-bold text-slate-700">
                                {alert.case_no}
                              </span>
                              <Link
                                to={`/cases/${alert.case_no}`}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                              >
                                <span>Inspect case</span>
                                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                              </Link>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
