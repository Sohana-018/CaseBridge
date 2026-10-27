import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  getDashboardSummary,
  getDashboardWorkload,
  getRecentAlerts,
  getOverlaps,
  type DashboardSummary,
  type BureauWorkload,
  type AlertItem,
  type OverlapItem,
} from '../api/client';
import { PriorityChip } from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import { useToast } from '../components/Toast';
import {
  CheckCircle2,
  ArrowRight,
  BarChart3,
  RefreshCw,
  ShieldAlert,
  GitCompare,
  Building2,
  Calendar,
  Sliders,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export const OverviewPage: React.FC = () => {
  const location = useLocation();
  const { showToast } = useToast();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [workload, setWorkload] = useState<BureauWorkload[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [overlaps, setOverlaps] = useState<OverlapItem[]>([]);

  // Filter state for alerts: All | SLA Breach | Reminders
  const [alertFilter, setAlertFilter] = useState<'all' | 'sla_breach' | 'reminders'>('all');

  // Architecture strip toggle
  const [pipelineOpen, setPipelineOpen] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const deniedMessage = (location.state as { deniedMessage?: string } | null)?.deniedMessage;

  const loadData = useCallback(async (isRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, workRes, alertRes, overlapsRes] = await Promise.all([
        getDashboardSummary(),
        getDashboardWorkload(),
        getRecentAlerts(25),
        getOverlaps({ review_status: 'open', page_size: 100 }).catch(() => ({ items: [], total: 0 })),
      ]);
      setSummary(sumRes);
      setWorkload(workRes);
      setAlerts(alertRes.items || []);
      setOverlaps(overlapsRes.items || []);
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

  const currentDateDisplay = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Calculate unique cases in open overlaps per bureau
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
      return true;
    });
  }, [alerts, alertFilter]);

  return (
    <div className="cb-page-container space-y-5">
      {/* Access Denied Notice if redirected */}
      {deniedMessage && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 shadow-xs"
        >
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">Unauthorized Access</h2>
            <p className="text-xs text-rose-700 mt-0.5">{deniedMessage}</p>
          </div>
        </div>
      )}

      {/* 1. HEADER ROW (Compact & Actionable) */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Case Monitoring Overview
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Single-window consolidated tracking across Regulation Bureau (RB), Grievance Cell (PGRC), Regional Offices (RO), and Other Cells (OC).
          </p>
        </div>

        {/* Action Controls: Pipeline Architecture Toggle + Date Pill + Refresh */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {/* Toggle Button for Pipeline Architecture */}
          <button
            type="button"
            onClick={() => setPipelineOpen((prev) => !prev)}
            aria-expanded={pipelineOpen}
            aria-controls="pipeline-architecture-strip"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition shadow-2xs cursor-pointer ${
              pipelineOpen
                ? 'bg-blue-50 text-blue-800 border-blue-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Info className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
            <span>Pipeline Architecture</span>
          </button>

          {/* Date Pill */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>{currentDateDisplay}</span>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={loading}
            aria-label="Refresh dashboard data"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
        </div>
      </section>

      {/* 1. COMPACT HORIZONTAL 4-STEP ARCHITECTURE STRIP (Toggled from Header) */}
      {pipelineOpen && (
        <section
          id="pipeline-architecture-strip"
          aria-label="Cross-Bureau Coordination Pipeline Architecture"
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <Info className="w-4 h-4 text-blue-700" aria-hidden="true" />
              <span>Cross-Bureau Coordination Pipeline Architecture</span>
            </div>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Canonical PID matching & multi-signal overlap scoring
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Canonical Registry */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 mb-1">
                <Building2 className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
                <span>1. Canonical Registry</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Institutions indexed by permanent identifier across all geographic zones.
              </p>
            </div>

            {/* 2. Isolated Intake */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 mb-1">
                <Sliders className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                <span>2. Isolated Intake</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Complaints ingested into isolated bureaus (RB, PGRC, RO, OC) with role-based access.
              </p>
            </div>

            {/* 3. Overlap Engine */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 mb-1">
                <GitCompare className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                <span>3. Overlap Engine</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Automated cosine text similarity, date proximity, and category scoring flag cross-bureau pairs.
              </p>
            </div>

            {/* 4. Human Adjudication */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                <span>4. Human Adjudication</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Authorized coordinators inspect paired cases, record audit notes, and align bureau actions.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Loading & Error States */}
      {loading && <LoadingState message="Fetching dashboard metrics and alerts..." />}

      {!loading && error && (
        <ErrorState
          title="Unable to load Overview metrics"
          message={error}
          onRetry={() => loadData(true)}
        />
      )}

      {/* 2. CONSOLIDATED UNIFIED METRIC BLOCK */}
      {!loading && !error && summary && (
        <div className="space-y-5">
          {/* 2. CLEAN 2-TIER METRIC LAYOUT (No overflow, no horizontal scroll) */}
          <section
            aria-labelledby="overview-metrics-heading"
            className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6"
          >
            <h2 id="overview-metrics-heading" className="sr-only">Key Operational Indicators</h2>

            {/* Primary Action Cards (col-span-8: grid-cols-3) */}
            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 1. Total Complaints */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap block">
                    Total Complaints
                  </span>
                  <div className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight num-tabular mt-1 leading-none">
                    {summary.total}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2.5 mt-3 border-t border-slate-100 text-xs">
                  <span className="text-[11px] text-slate-500 font-medium">Across 4 Bureaus</span>
                  <Link
                    to="/cases"
                    className="font-semibold text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1 text-xs"
                  >
                    <span>View all</span>
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* 2. Coordination Queue */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap block">
                    Coordination Queue
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <div className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight num-tabular leading-none">
                      {summary.open_overlaps}
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                      Review
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2.5 mt-3 border-t border-slate-100 text-xs">
                  <span className="text-[11px] text-slate-500 font-medium">Cross-bureau overlaps</span>
                  <Link
                    to="/overlaps"
                    className="font-semibold text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1 text-xs"
                  >
                    <span>Review</span>
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* 3. Overdue SLA Target */}
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap block">
                    Overdue SLA Target
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <div className="text-2xl sm:text-3xl font-bold text-rose-700 tracking-tight num-tabular leading-none">
                      {summary.overdue}
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-300">
                      Breach
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2.5 mt-3 border-t border-slate-100 text-xs">
                  <span className="text-[11px] text-slate-500 font-medium">Action required</span>
                  <Link
                    to="/cases?overdue=true"
                    className="font-bold text-rose-700 hover:text-rose-900 hover:underline inline-flex items-center gap-1 text-xs"
                  >
                    <span>Inspect</span>
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Secondary Status Panel (col-span-4: 2-column mini grid) */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-center shadow-xs">
              <div className="grid grid-cols-2 gap-2.5">
                {/* Under Investigation */}
                <Link
                  to="/cases?status=under_process"
                  className="p-2.5 rounded-lg bg-slate-50 hover:bg-blue-50/70 border border-slate-200 transition group"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">
                    Under Investigation
                  </span>
                  <span className="text-lg font-bold text-slate-900 num-tabular group-hover:text-blue-700 leading-none mt-1 block">
                    {summary.under_process}
                  </span>
                </Link>

                {/* Pending Review */}
                <Link
                  to="/cases?status=pending"
                  className="p-2.5 rounded-lg bg-slate-50 hover:bg-amber-50/70 border border-slate-200 transition group"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">
                    Pending Review
                  </span>
                  <span className="text-lg font-bold text-slate-900 num-tabular group-hover:text-amber-800 leading-none mt-1 block">
                    {summary.pending}
                  </span>
                </Link>

                {/* Reassigned */}
                <Link
                  to="/cases?status=transferred"
                  className="p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition group"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">
                    Reassigned
                  </span>
                  <span className="text-lg font-bold text-slate-900 num-tabular group-hover:text-slate-800 leading-none mt-1 block">
                    {summary.transferred}
                  </span>
                </Link>

                {/* Disposed / Closed */}
                <Link
                  to="/cases?status=disposed"
                  className="p-2.5 rounded-lg bg-slate-50 hover:bg-emerald-50/70 border border-slate-200 transition group"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">
                    Disposed / Closed
                  </span>
                  <span className="text-lg font-bold text-slate-900 num-tabular group-hover:text-emerald-800 leading-none mt-1 block">
                    {summary.disposed}
                  </span>
                </Link>
              </div>
            </div>
          </section>

          {/* 3. RESTRUCTURED MAIN ANALYTICS & ALERTS GRID (grid-cols-12 gap-5 mt-5) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-5 items-stretch">
            {/* LEFT PANEL: Bureau Workload Distribution (col-span-7) */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                {/* Header and Legend on the same top line */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0"
                      aria-hidden="true"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 leading-tight">
                        Bureau Workload Distribution
                      </h2>
                      <p className="text-[11px] text-slate-500">Case volume per regulatory bureau</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Legend Indicators on same line */}
                    <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-xs bg-[#94A3B8]" aria-hidden="true" />
                        <span>Total</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-xs bg-[#2563EB]" aria-hidden="true" />
                        <span>Open</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-xs bg-[#DC2626]" aria-hidden="true" />
                        <span>Overdue</span>
                      </span>
                    </div>

                    <div className="h-3 w-px bg-slate-200 hidden sm:block" />

                    <Link
                      to="/reports"
                      className="text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <span>Reports</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>

                {/* Grouped Bar Chart (Tighter h-56) */}
                {workload.length === 0 ? (
                  <EmptyState
                    title="No workload data"
                    message="No case records were returned by the workload API endpoint."
                  />
                ) : (
                  <div
                    role="img"
                    aria-label="Bureau workload distribution chart comparing total cases, open cases, and overdue SLA cases across RB, PGRC, RO, and OC bureaus"
                    className="h-56 w-full pt-1"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={workload}
                        margin={{ top: 8, right: 10, left: -20, bottom: 0 }}
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
                            borderRadius: '8px',
                            color: '#0F172A',
                            fontSize: '12px',
                            border: '1px solid #CBD5E1',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                            padding: '6px 10px',
                          }}
                          itemStyle={{ color: '#0F172A', padding: '2px 0' }}
                        />
                        <Bar
                          dataKey="total"
                          name="Total Cases"
                          fill="#94A3B8"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          dataKey="open"
                          name="Open Cases"
                          fill="#2563EB"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          dataKey="overdue"
                          name="Overdue SLA"
                          fill="#DC2626"
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Compact 4-Column Summary Strip directly below the chart */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-200 mt-3">
                {workload.map((b) => {
                  const overlapPct = getOverlapPercentage(b.bureau, b.total);
                  return (
                    <div
                      key={b.bureau}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900 text-xs">{b.bureau}</span>
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          {overlapPct} Overlap
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[11px] text-slate-600 mt-1">
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-semibold">Total</span>
                          <span className="font-bold text-slate-900 num-tabular">{b.total}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-semibold">Open</span>
                          <span className="font-bold text-blue-700 num-tabular">{b.open}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-semibold">Overdue</span>
                          <span
                            className={`font-bold num-tabular ${
                              b.overdue > 0 ? 'text-rose-700' : 'text-slate-700'
                            }`}
                          >
                            {b.overdue}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT PANEL: Priority Alerts (col-span-5) */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                {/* Header: Title + Active Badge + Filter Tabs */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-200 mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">Priority Alerts</h2>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-300 num-tabular">
                      {alerts.length} Active
                    </span>
                  </div>

                  {/* Quick Filter Tabs: All | SLA Breach | Reminders */}
                  <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setAlertFilter('all')}
                      className={`px-2 py-1 rounded-md transition cursor-pointer ${
                        alertFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setAlertFilter('sla_breach')}
                      className={`px-2 py-1 rounded-md transition cursor-pointer ${
                        alertFilter === 'sla_breach'
                          ? 'bg-white text-slate-900 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      SLA Breach
                    </button>
                    <button
                      type="button"
                      onClick={() => setAlertFilter('reminders')}
                      className={`px-2 py-1 rounded-md transition cursor-pointer ${
                        alertFilter === 'reminders'
                          ? 'bg-white text-slate-900 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Reminders
                    </button>
                  </div>
                </div>

                {/* Compact Alert Rows (2-Line Dense List Items) */}
                {filteredAlerts.length === 0 ? (
                  <EmptyState
                    title="No matching alerts"
                    message={
                      alertFilter === 'all'
                        ? 'All notifications and SLA targets have been monitored and cleared.'
                        : 'No alerts found matching this category filter.'
                    }
                  />
                ) : (
                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {filteredAlerts.slice(0, 7).map((alert) => {
                      const isHigh = alert.priority?.toLowerCase() === 'high';
                      const isMed = alert.priority?.toLowerCase() === 'medium';
                      const borderLeft = isHigh
                        ? 'border-l-rose-600'
                        : isMed
                        ? 'border-l-amber-500'
                        : 'border-l-blue-600';

                      return (
                        <div
                          key={alert.id}
                          className={`py-2.5 px-3 rounded-lg border border-slate-200 border-l-4 ${borderLeft} bg-slate-50/50 hover:bg-slate-100 transition flex flex-col gap-1`}
                        >
                          {/* Line 1: Monospace Case ID, Priority badge, Alert Type tag, Timestamp on far right */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {alert.case_no && (
                                <span className="font-mono font-bold text-xs text-slate-800 bg-white border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                                  {alert.case_no}
                                </span>
                              )}
                              <PriorityChip priority={alert.priority} />
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200 uppercase tracking-wide truncate">
                                {alert.type.replace('_', ' ')}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 whitespace-nowrap font-medium shrink-0">
                              {formatDateTime(alert.created_at)}
                            </span>
                          </div>

                          {/* Line 2: Truncated rule description on left + Inspect -> link on right */}
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <p
                              className="text-slate-700 truncate text-[11px] font-medium leading-tight flex-1"
                              title={alert.message}
                            >
                              {alert.message}
                            </p>
                            {alert.case_no ? (
                              <Link
                                to={`/cases/${alert.case_no}`}
                                className="text-xs font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <span>Inspect</span>
                                <ArrowRight className="w-3 h-3" aria-hidden="true" />
                              </Link>
                            ) : (
                              <Link
                                to="/cases"
                                className="text-xs font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <span>Inspect</span>
                                <ArrowRight className="w-3 h-3" aria-hidden="true" />
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Alerts Panel Footer */}
              <div className="pt-3 border-t border-slate-200 mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing {Math.min(filteredAlerts.length, 7)} of {filteredAlerts.length} alerts
                </span>
                <Link
                  to="/cases?overdue=true"
                  className="font-semibold text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1"
                >
                  <span>All SLA Targets</span>
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
