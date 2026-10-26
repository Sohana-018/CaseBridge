import React, { useEffect, useState } from 'react';
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
  ShieldAlert,
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

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Title with short description */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Case Monitoring Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Consolidated cross-bureau complaint monitoring and tracking dashboard for authorized officials.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-xs cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Access Denied Notice if redirected from admin */}
      {deniedMessage && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3 shadow-xs">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-amber-950">Unauthorized Access Attempt</h3>
            <p className="text-xs text-amber-800 mt-0.5">{deniedMessage}</p>
          </div>
        </div>
      )}

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
          {/* KPI Cards: Large number, small label, and colored accents:
              pending amber | under process blue | disposed green | transferred gray | escalated purple | overdue red */}
          <section aria-labelledby="kpi-heading">
            <h2 id="kpi-heading" className="sr-only">Key Performance Indicators</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
              {/* Total Cases (Navy/Slate Accent) */}
              <div className="p-4 rounded-lg bg-white border border-slate-200 border-t-4 border-t-blue-900 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total</span>
                  <FileText className="w-4 h-4 text-slate-400" />
                </div>
                <div className="text-3xl font-bold text-slate-900 tracking-tight">{summary.total}</div>
                <div className="text-xs text-slate-500 mt-1">All recorded cases</div>
              </div>

              {/* Pending (Amber Accent) */}
              <div className="p-4 rounded-lg bg-white border border-slate-200 border-t-4 border-t-amber-500 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Pending</span>
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-3xl font-bold text-slate-900 tracking-tight">{summary.pending}</div>
                <div className="text-xs text-slate-500 mt-1">Awaiting review</div>
              </div>

              {/* Under Process (Blue Accent) */}
              <div className="p-4 rounded-lg bg-white border border-slate-200 border-t-4 border-t-blue-600 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Under Process</span>
                  <RotateCw className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-3xl font-bold text-slate-900 tracking-tight">{summary.under_process}</div>
                <div className="text-xs text-slate-500 mt-1">Active investigation</div>
              </div>

              {/* Disposed (Green Accent) */}
              <div className="p-4 rounded-lg bg-white border border-slate-200 border-t-4 border-t-emerald-600 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Disposed</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-3xl font-bold text-slate-900 tracking-tight">{summary.disposed}</div>
                <div className="text-xs text-slate-500 mt-1">Resolved & closed</div>
              </div>

              {/* Transferred (Gray Accent) */}
              <div className="p-4 rounded-lg bg-white border border-slate-200 border-t-4 border-t-slate-400 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Transferred</span>
                  <ArrowRightLeft className="w-4 h-4 text-slate-500" />
                </div>
                <div className="text-3xl font-bold text-slate-900 tracking-tight">{summary.transferred}</div>
                <div className="text-xs text-slate-500 mt-1">Reassigned bureau</div>
              </div>

              {/* Escalated (Purple Accent) */}
              <div className="p-4 rounded-lg bg-white border border-slate-200 border-t-4 border-t-purple-600 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Escalated</span>
                  <Flame className="w-4 h-4 text-purple-600" />
                </div>
                <div className="text-3xl font-bold text-slate-900 tracking-tight">{summary.escalated}</div>
                <div className="text-xs text-slate-500 mt-1">Urgent review</div>
              </div>

              {/* Overdue (Red Accent) */}
              <div className="p-4 rounded-lg bg-white border border-slate-200 border-t-4 border-t-red-600 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wider">Overdue</span>
                  <AlertOctagon className="w-4 h-4 text-red-600" />
                </div>
                <div className="text-3xl font-bold text-red-700 tracking-tight">{summary.overdue}</div>
                <div className="text-xs text-slate-500 mt-1">Past SLA target</div>
              </div>
            </div>
          </section>

          {/* Charts & Alerts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Bureau Workload Chart Card */}
            <div className="lg:col-span-7 bg-white rounded-lg border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-5">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-900 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Bureau Workload Distribution</h3>
                    <p className="text-xs text-slate-500">Distribution of Total, Open, and Overdue complaints across Bureaus</p>
                  </div>
                </div>
              </div>

              {workload.length === 0 ? (
                <EmptyState
                  title="No workload data available"
                  message="No case records were returned by the workload API endpoint."
                />
              ) : (
                <div className="h-72 w-full pt-2">
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
                        tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          fontSize: '12px',
                          border: 'none',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        }}
                        itemStyle={{ color: '#f8fafc', padding: '2px 0' }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ paddingBottom: '12px', fontSize: '12px' }}
                      />
                      <Bar dataKey="total" name="Total Cases" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="open" name="Open Cases" fill="#2563eb" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="overdue" name="Overdue" fill="#dc2626" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Recent Open Alerts Card */}
            <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-md bg-amber-50 text-amber-700 flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Recent Open Alerts</h3>
                    <p className="text-xs text-slate-500">Most recent alerts requiring bureau coordination</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
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
                    <div key={alert.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <PriorityChip priority={alert.priority} />
                          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase border border-slate-200">
                            {alert.type.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 whitespace-nowrap">
                          {formatDateTime(alert.created_at)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 leading-snug mb-2 font-normal">
                        {alert.message}
                      </p>

                      {alert.case_no && (
                        <Link
                          to={`/cases/${alert.case_no}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-900 hover:text-blue-700 group"
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
