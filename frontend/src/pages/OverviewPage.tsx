import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  getDashboardSummary,
  getDashboardWorkload,
  getRecentAlerts,
  getCurrentUser,
  type DashboardSummary,
  type BureauWorkload,
  type AlertItem,
} from '../api/client';
import { PriorityChip } from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
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
  Sparkles,
  ArrowUpRight,
  Sliders,
  ExternalLink,
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
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [workload, setWorkload] = useState<BureauWorkload[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const deniedMessage = (location.state as { deniedMessage?: string } | null)?.deniedMessage;

  const currentUser = getCurrentUser();

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, workloadRes, alertsRes] = await Promise.all([
        getDashboardSummary(),
        getDashboardWorkload(),
        getRecentAlerts(5),
      ]);

      setSummary(summaryRes);
      setWorkload(workloadRes);
      setAlerts(alertsRes.items || []);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to connect to the CaseBridge backend API.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const handleCountsUpdate = () => {
      loadData();
    };
    window.addEventListener('casebridge:refresh-counts', handleCountsUpdate);
    return () => {
      window.removeEventListener('casebridge:refresh-counts', handleCountsUpdate);
    };
  }, [loadData]);

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const dt = new Date(isoString);
      return dt.toLocaleString(undefined, {
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
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Access Denied Notice if redirected from admin */}
      {deniedMessage && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3 shadow-sm">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-amber-950">Unauthorized Access Attempt</h3>
            <p className="text-xs text-amber-800 mt-0.5">{deniedMessage}</p>
          </div>
        </div>
      )}

      {/* Institutional Welcome & Desk Header (Reference 1: Ruby & Reference 6: CVC) */}
      <section className="bg-gradient-to-r from-blue-900/5 via-slate-50 to-indigo-900/5 border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">
              Role: <strong className="text-slate-800">{currentUser?.name || 'Authorized Officer'}</strong>
              {currentUser?.bureau ? ` (${currentUser.bureau})` : ''}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Case Monitoring Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl">
            Single-window consolidated tracking across Regulation Bureau (RB), Grievance Cell (PGRC), Regional Offices (RO), and Other Cells (OC).
          </p>
        </div>

        {/* Date & Refresh Controls */}
        <div className="flex items-center gap-2.5 flex-wrap self-start md:self-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentDateDisplay}</span>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition shadow-2xs cursor-pointer"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>
        </div>
      </section>

      {/* Loading & Error States */}
      {loading && <LoadingState message="Fetching dashboard metrics and alerts..." />}

      {!loading && error && (
        <ErrorState
          title="Unable to load Overview metrics"
          message={error}
          onRetry={loadData}
        />
      )}

      {!loading && !error && summary && (
        <div className="space-y-8">
          {/* TIER 1: High-Impact Bold Metric Cards (Reference 1 Ruby + Reference 6 CVC Style) */}
          <section aria-labelledby="hero-metrics-heading">
            <h2 id="hero-metrics-heading" className="sr-only">Key Operational Indicators</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {/* 1. Total Cases Registered */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white p-5 sm:p-6 shadow-md group">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-200/90">
                      Total Information Registry
                    </span>
                    <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1 text-white">
                      {summary.total}
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                    <Layers className="w-6 h-6 text-white" />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs">
                  <span className="text-blue-200/80 text-[11px]">Across all 4 Bureaus</span>
                  <Link
                    to="/cases"
                    className="inline-flex items-center gap-1 font-semibold text-white hover:text-blue-200 transition group-hover:translate-x-0.5"
                  >
                    <span>Inspect</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* 2. Active Inquiries (Under Process) */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white p-5 sm:p-6 shadow-md group">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-100/90">
                      Under Investigation
                    </span>
                    <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1 text-white">
                      {summary.under_process}
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                    <RotateCw className="w-6 h-6 text-white animate-spin-slow" />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs">
                  <span className="text-blue-100/80 text-[11px]">Active inquiry workflow</span>
                  <Link
                    to="/cases?status=under_process"
                    className="inline-flex items-center gap-1 font-semibold text-white hover:text-blue-100 transition group-hover:translate-x-0.5"
                  >
                    <span>View Active</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* 3. Open Overlaps (Action Required) */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-600 via-rose-700 to-amber-700 text-white p-5 sm:p-6 shadow-md group">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rose-100/90">
                        Coordination Queue
                      </span>
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-white text-rose-700 uppercase tracking-wider animate-pulse">
                        Action
                      </span>
                    </div>
                    <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1 text-white">
                      {summary.open_overlaps}
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                    <GitCompare className="w-6 h-6 text-white" />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs">
                  <span className="text-rose-100/80 text-[11px]">Flagged candidate pairs</span>
                  <Link
                    to="/overlaps"
                    className="inline-flex items-center gap-1 font-semibold text-white hover:text-amber-200 transition group-hover:translate-x-0.5"
                  >
                    <span>Review Queue</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* 4. Disposed & Resolved */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white p-5 sm:p-6 shadow-md group">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100/90">
                      Disposed Complaints
                    </span>
                    <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1 text-white">
                      {summary.disposed}
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs">
                  <span className="text-emerald-100/80 text-[11px]">Officially closed & archived</span>
                  <Link
                    to="/cases?status=disposed"
                    className="inline-flex items-center gap-1 font-semibold text-white hover:text-emerald-100 transition group-hover:translate-x-0.5"
                  >
                    <span>View Closed</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* TIER 2: Secondary Status Strip (Interactive Clickable Filtering) */}
          <section
            aria-labelledby="secondary-metrics-heading"
            className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs"
          >
            <h2 id="secondary-metrics-heading" className="sr-only">Detailed Status Metrics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
              {/* Pending */}
              <Link
                to="/cases?status=pending"
                className="group p-2 rounded-xl hover:bg-amber-50/50 transition flex items-center gap-3.5"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-200 shadow-2xs group-hover:scale-105 transition-transform">
                  <Clock className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 group-hover:text-amber-900 transition">
                    {summary.pending}
                  </div>
                  <div className="text-xs text-slate-500 font-medium">Pending Review</div>
                </div>
              </Link>

              {/* Transferred */}
              <Link
                to="/cases?status=transferred"
                className="group p-2 rounded-xl hover:bg-slate-50 transition flex items-center gap-3.5 pt-3 sm:pt-2 sm:pl-4"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200 shadow-2xs group-hover:scale-105 transition-transform">
                  <ArrowRightLeft className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 group-hover:text-slate-700 transition">
                    {summary.transferred}
                  </div>
                  <div className="text-xs text-slate-500 font-medium">Reassigned Bureau</div>
                </div>
              </Link>

              {/* Escalated */}
              <Link
                to="/cases?status=escalated"
                className="group p-2 rounded-xl hover:bg-purple-50/50 transition flex items-center gap-3.5 pt-3 sm:pt-2 sm:pl-4"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 border border-purple-200 shadow-2xs group-hover:scale-105 transition-transform">
                  <Flame className="w-5 h-5 text-purple-700" />
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 group-hover:text-purple-900 transition">
                    {summary.escalated}
                  </div>
                  <div className="text-xs text-slate-500 font-medium">Escalated Priority</div>
                </div>
              </Link>

              {/* Overdue */}
              <Link
                to="/cases?overdue=true"
                className="group p-2 rounded-xl hover:bg-rose-50/50 transition flex items-center gap-3.5 pt-3 sm:pt-2 sm:pl-4"
              >
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center shrink-0 border border-rose-200 shadow-2xs group-hover:scale-105 transition-transform">
                  <AlertOctagon className="w-5 h-5 text-rose-700 animate-pulse" />
                </div>
                <div>
                  <div className="text-xl font-bold text-rose-700 group-hover:text-rose-900 transition">
                    {summary.overdue}
                  </div>
                  <div className="text-xs text-rose-600 font-medium">Overdue SLA Target</div>
                </div>
              </Link>
            </div>
          </section>

          {/* Cross-Bureau Architecture & Coordination Flow (Reference 1 Node Architecture) */}
          <section className="bg-slate-900 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                    Cross-Bureau Coordination Pipeline
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  Autonomous Flagging · Human Decision Loop
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1">
                {/* Node 1 */}
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 relative">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-300 mb-1">
                    <Building2 className="w-4 h-4" />
                    <span>1. Institutions Directory</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Single canonical registry indexed by Permanent ID (`PID-XXXX`) across all zones.
                  </p>
                </div>

                {/* Node 2 */}
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 relative">
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-300 mb-1">
                    <Sliders className="w-4 h-4" />
                    <span>2. Multi-Bureau Desk</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Complaints ingested into isolated bureaus: RB, PGRC, RO, and OC with masked privacy.
                  </p>
                </div>

                {/* Node 3 */}
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 relative">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300 mb-1">
                    <GitCompare className="w-4 h-4" />
                    <span>3. Overlap Engine</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    TF-IDF cosine similarity, category relations, and date proximity score duplicates.
                  </p>
                </div>

                {/* Node 4 */}
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 relative">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 mb-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>4. Officer Adjudication</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Coordinators inspect paired cases, record audit notes, and align bureau actions.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Charts & Alerts Grid (Reference 1 & Reference 5) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Bureau Workload Chart Card (7 cols) */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-5">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-900 border border-blue-200 flex items-center justify-center shadow-2xs">
                    <BarChart3 className="w-5 h-5 text-blue-900" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Bureau Workload Distribution</h3>
                    <p className="text-xs text-slate-500">Distribution of Total, Open, and Overdue complaints across operational Bureaus</p>
                  </div>
                </div>

                <Link
                  to="/reports"
                  className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-blue-900 hover:text-blue-700 hover:underline"
                >
                  <span>Detailed Reports</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {workload.length === 0 ? (
                <EmptyState
                  title="No workload data available"
                  message="No case records were returned by the workload API endpoint."
                />
              ) : (
                <div className="h-80 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={workload}
                      margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="bureau"
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tick={{ fill: '#334155', fontSize: 12, fontWeight: 700 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderRadius: '10px',
                          color: '#f8fafc',
                          fontSize: '12px',
                          border: '1px solid #334155',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                          padding: '10px 14px',
                        }}
                        itemStyle={{ color: '#f8fafc', padding: '3px 0' }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ paddingBottom: '16px', fontSize: '12px', fontWeight: 500 }}
                      />
                      <Bar dataKey="total" name="Total Cases" fill="#64748b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="open" name="Open Cases" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="overdue" name="Overdue SLA" fill="#e11d48" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Recent Open Alerts Card (5 cols - Reference 5 Floating Toast Style) */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center shadow-2xs">
                    <Bell className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Priority Alerts</h3>
                    <p className="text-xs text-slate-500">Impending SLA breaches & coordination requests</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
                  {alerts.length} Active
                </span>
              </div>

              {alerts.length === 0 ? (
                <EmptyState
                  title="No open alerts"
                  message="All active notifications and SLA alerts have been addressed."
                />
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="p-3.5 rounded-xl border border-slate-200/90 bg-gradient-to-r from-slate-50/90 to-blue-50/30 hover:border-blue-300 transition shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <PriorityChip priority={alert.priority} />
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-slate-700 font-semibold uppercase border border-slate-200 shadow-2xs">
                            {alert.type.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                          {formatDateTime(alert.created_at)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-800 leading-snug mb-2 font-medium">
                        {alert.message}
                      </p>

                      {alert.case_no && (
                        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                          <span className="text-[11px] font-mono font-semibold text-slate-500">
                            {alert.case_no}
                          </span>
                          <Link
                            to={`/cases/${alert.case_no}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-900 hover:text-blue-700 transition group"
                          >
                            <span>Inspect Case</span>
                            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
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
      )}
    </main>
  );
};
