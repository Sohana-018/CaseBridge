import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getDashboardSummary,
  getDashboardWorkload,
  getRecentAlerts,
  autoLogin,
  type DashboardSummary,
  type BureauWorkload,
  type AlertItem,
} from '../api/client';
import { PriorityChip } from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import {
  FileText,
  Clock,
  RotateCw,
  CheckCircle2,
  ArrowRightLeft,
  Flame,
  AlertOctagon,
  Bell,
  ArrowUpRight,
  BarChart3,
  RefreshCw,
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
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [workload, setWorkload] = useState<BureauWorkload[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Ensure coordinator login is initialized
      await autoLogin('coordinator');

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

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Case Monitoring Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time cross-bureau intelligence and tracking metrics across all AICTE grievance cases.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition shadow-xs cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

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
          {/* KPI Cards (Total, Pending, Under Process, Disposed, Transferred, Escalated, Overdue) */}
          <section aria-labelledby="kpi-heading">
            <h2 id="kpi-heading" className="sr-only">Key Performance Indicators</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
              {/* Total Cases */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</span>
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900">{summary.total}</div>
                <div className="text-[11px] text-slate-500 mt-1">All recorded cases</div>
              </div>

              {/* Pending */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Pending</span>
                  <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-amber-700">{summary.pending}</div>
                <div className="text-[11px] text-slate-500 mt-1">Awaiting review</div>
              </div>

              {/* Under Process */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Under Process</span>
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <RotateCw className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-indigo-700">{summary.under_process}</div>
                <div className="text-[11px] text-slate-500 mt-1">Active investigation</div>
              </div>

              {/* Disposed */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Disposed</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-700">{summary.disposed}</div>
                <div className="text-[11px] text-slate-500 mt-1">Resolved & closed</div>
              </div>

              {/* Transferred */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Transferred</span>
                  <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <ArrowRightLeft className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-purple-700">{summary.transferred}</div>
                <div className="text-[11px] text-slate-500 mt-1">Cross-bureau moved</div>
              </div>

              {/* Escalated */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Escalated</span>
                  <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                    <Flame className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-rose-700">{summary.escalated}</div>
                <div className="text-[11px] text-slate-500 mt-1">High attention</div>
              </div>

              {/* Overdue */}
              <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 shadow-xs hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Overdue</span>
                  <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-xs">
                    <AlertOctagon className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-black text-rose-800">{summary.overdue}</div>
                <div className="text-[11px] text-rose-600 font-medium mt-1">Past SLA deadline</div>
              </div>
            </div>
          </section>

          {/* Charts & Alerts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Workload Chart (Recharts) */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Bureau Workload Distribution</h3>
                    <p className="text-xs text-slate-500">Total, Open, and Overdue cases across Bureaus</p>
                  </div>
                </div>
              </div>

              {workload.length === 0 ? (
                <EmptyState
                  title="No workload data available"
                  message="No case records were returned by the workload API endpoint."
                />
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={workload}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="bureau"
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                        tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderRadius: '12px',
                          color: '#f8fafc',
                          fontSize: '12px',
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                          border: 'none',
                        }}
                        itemStyle={{ color: '#f8fafc', padding: '2px 0' }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ paddingBottom: '16px', fontSize: '12px' }}
                      />
                      <Bar dataKey="total" name="Total Cases" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="open" name="Open Cases" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="overdue" name="Overdue" fill="#e11d48" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* 5 Most Recent Open Alerts */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Recent Open Alerts</h3>
                    <p className="text-xs text-slate-500">5 most recent open alerts from GET /alerts</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {alerts.length} Active
                </span>
              </div>

              {alerts.length === 0 ? (
                <EmptyState
                  title="No open alerts"
                  message="All active notifications and SLA alerts have been addressed."
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <PriorityChip priority={alert.priority} />
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                            {alert.type.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 whitespace-nowrap">
                          {formatDateTime(alert.created_at)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 leading-snug mb-2 font-medium">
                        {alert.message}
                      </p>

                      {alert.case_no && (
                        <Link
                          to={`/cases/${alert.case_no}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 group"
                        >
                          <span>Case {alert.case_no}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </Link>
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
