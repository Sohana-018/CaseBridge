import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Layers,
  Download,
  RefreshCw,
  ShieldCheck,
  Building2,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import type { PeriodicReportData } from '../api/client';
import { StatusChip } from './Badges';
import { LoadingState, ErrorState, EmptyState } from './StateFeedback';
import { formatCategory, formatStatus } from '../utils/formatters';

interface PeriodicReportViewProps {
  type: 'daily' | 'monthly' | 'quarterly';
  setType: (type: 'daily' | 'monthly' | 'quarterly') => void;
  dailyDate: string;
  setDailyDate: (date: string) => void;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  selectedMonth: number;
  setSelectedMonth: (month: number) => void;
  selectedQuarter: number;
  setSelectedQuarter: (quarter: number) => void;
  data: PeriodicReportData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onExportCsv: () => Promise<void>;
  csvLoading: boolean;
}

// Curated colors for statuses
function getStatusColor(status: string): string {
  const norm = (status || '').toLowerCase().trim();
  if (norm === 'pending') return '#D97706';
  if (norm === 'under_process') return '#0284C7';
  if (norm === 'escalated') return '#7C3AED';
  if (norm === 'transferred') return '#4F46E5';
  if (norm === 'disposed') return '#059669';
  return '#64748B';
}

// Curated colors for categories
function getCategoryColor(category: string, idx: number): string {
  const norm = (category || '').toLowerCase().trim();
  if (norm === 'infrastructure') return '#2563EB';
  if (norm === 'faculty') return '#0D9488';
  if (norm === 'fee_refund') return '#D97706';
  if (norm === 'admission') return '#7C3AED';
  if (norm === 'approval') return '#059669';
  if (norm === 'examination') return '#E11D48';
  if (norm === 'other') return '#64748B';
  const palette = ['#2563EB', '#0D9488', '#D97706', '#7C3AED', '#E11D48', '#0284C7', '#059669'];
  return palette[idx % palette.length];
}

// Custom Slice Label helper
interface SliceProps {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  name?: string;
  label?: string;
  payload?: { label?: string; category?: string; status?: string };
}

function renderSliceLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  percent = 0,
  payload,
}: SliceProps) {
  if (percent < 0.05) return null;

  const raw = payload?.label || payload?.category || payload?.status || '';
  const text = formatCategory(raw);
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.65;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  const display = text.length > 12 ? text.slice(0, 10) + '…' : text;
  const fontSize = percent < 0.12 ? 9 : 10.5;

  return (
    <text
      x={x}
      y={y}
      fill="#FFFFFF"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: `${fontSize}px` }}
      className="font-bold select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
    >
      {display}
    </text>
  );
}

export function PeriodicReportView({
  type,
  setType,
  dailyDate,
  setDailyDate,
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  selectedQuarter,
  setSelectedQuarter,
  data,
  loading,
  error,
  onRefresh,
  onExportCsv,
  csvLoading,
}: PeriodicReportViewProps) {
  const [hoveredStatus, setHoveredStatus] = useState<string | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  const monthOptions = [
    { val: 1, name: 'January' },
    { val: 2, name: 'February' },
    { val: 3, name: 'March' },
    { val: 4, name: 'April' },
    { val: 5, name: 'May' },
    { val: 6, name: 'June' },
    { val: 7, name: 'July' },
    { val: 8, name: 'August' },
    { val: 9, name: 'September' },
    { val: 10, name: 'October' },
    { val: 11, name: 'November' },
    { val: 12, name: 'December' },
  ];

  const currentRealTimeYear = useMemo(() => new Date().getFullYear(), []);
  const yearOptions = useMemo(() => {
    const list: number[] = [];
    for (let yr = currentRealTimeYear - 3; yr <= currentRealTimeYear + 1; yr++) {
      list.push(yr);
    }
    if (!list.includes(selectedYear)) {
      list.push(selectedYear);
      list.sort((a, b) => a - b);
    }
    return list;
  }, [currentRealTimeYear, selectedYear]);

  return (
    <div className="space-y-6">
      {/* 1. Period Selector & Controls Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-wrap">
          {/* Period Mode Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>Period:</span>
            </span>
            <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs" role="group" aria-label="Aggregation period">
              <button
                type="button"
                onClick={() => setType('daily')}
                className={`px-3 py-1.5 rounded-md font-semibold transition cursor-pointer ${
                  type === 'daily'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setType('monthly')}
                className={`px-3 py-1.5 rounded-md font-semibold transition cursor-pointer ${
                  type === 'monthly'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setType('quarterly')}
                className={`px-3 py-1.5 rounded-md font-semibold transition cursor-pointer ${
                  type === 'quarterly'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Quarterly
              </button>
            </div>
          </div>

          {/* Date Picker Controls depending on Period */}
          <div className="flex items-center gap-3 flex-wrap">
            {type === 'daily' && (
              <div className="flex items-center gap-2">
                <label htmlFor="periodic-daily-picker" className="text-xs font-semibold text-slate-600">
                  Date:
                </label>
                <input
                  id="periodic-daily-picker"
                  type="date"
                  value={dailyDate}
                  onChange={(e) => setDailyDate(e.target.value)}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                />
              </div>
            )}

            {type === 'monthly' && (
              <div className="flex items-center gap-2">
                <label htmlFor="periodic-month-picker" className="text-xs font-semibold text-slate-600">
                  Month:
                </label>
                <select
                  id="periodic-month-picker"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                >
                  {monthOptions.map((m) => (
                    <option key={m.val} value={m.val}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <select
                  id="periodic-year-picker"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  aria-label="Target year"
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                >
                  {yearOptions.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {type === 'quarterly' && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-600">Quarter:</span>
                <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs" role="group" aria-label="Target quarter">
                  {[1, 2, 3, 4].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSelectedQuarter(q)}
                      className={`px-2.5 py-1 rounded font-semibold transition cursor-pointer ${
                        selectedQuarter === q
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Q{q}
                    </button>
                  ))}
                </div>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  aria-label="Target year"
                  className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                >
                  {yearOptions.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Actions: Refresh & Export CSV */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                aria-label="Refresh periodic report"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-2xs cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                type="button"
                onClick={onExportCsv}
                disabled={loading || csvLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{csvLoading ? 'Exporting...' : 'Export CSV'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Range Banner */}
        {data && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-700">Active Window:</span>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
                {data.period_label}
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                ({data.start_date} to {data.end_date})
              </span>
            </div>
            <div className="text-slate-600">
              Total Intake:{' '}
              <strong className="text-slate-900 font-bold num-tabular">
                {data.total_cases} complaints
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* 2. Loading / Error / Empty States */}
      {loading && <LoadingState message="Aggregating periodic performance metrics..." />}

      {!loading && error && (
        <ErrorState
          title="Could not generate periodic report"
          message={error}
          onRetry={onRefresh}
        />
      )}

      {!loading && !error && data && data.total_cases === 0 && (
        <EmptyState
          title={`No complaints logged for ${data.period_label}`}
          message="There were no complaint cases received in the centralized registry during this time interval. Select another date, month, or quarter to view performance analytics."
        />
      )}

      {/* 3. Main Report View when Data Exists */}
      {!loading && !error && data && data.total_cases > 0 && (
        <div className="space-y-6">
          {/* KPI Stat Cards Grid (4 Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="cb-card p-5 bg-white border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300 transition">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Total Intake</span>
                <Layers className="w-4 h-4 text-blue-600" aria-hidden="true" />
              </div>
              <div className="text-[32px] font-bold text-slate-900 tracking-tight mt-1 num-tabular">
                {data.total_cases}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-medium">
                Registered in {data.period_label}
              </div>
            </div>

            <div className="cb-card p-5 bg-white border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300 transition">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Disposed Cases</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              </div>
              <div className="text-[32px] font-bold text-slate-900 tracking-tight mt-1 num-tabular">
                {data.summary.disposed_cases}
              </div>
              <div className="text-xs text-emerald-700 font-semibold mt-1">
                {data.summary.disposal_rate}% disposal rate ({data.summary.open_cases} open)
              </div>
            </div>

            <div className="cb-card p-5 bg-white border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300 transition">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>Avg Resolution Time</span>
                <Clock className="w-4 h-4 text-amber-600" aria-hidden="true" />
              </div>
              <div className="text-[32px] font-bold text-slate-900 tracking-tight mt-1 num-tabular">
                {data.resolution_stats.has_resolved_cases ? (
                  <>
                    {data.resolution_stats.avg_days} <span className="text-sm font-normal text-slate-500">days</span>
                  </>
                ) : (
                  <span className="text-2xl text-slate-400">N/A</span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-medium">
                {data.resolution_stats.has_resolved_cases
                  ? `Median: ${data.resolution_stats.median_days}d · Range: ${data.resolution_stats.min_days}-${data.resolution_stats.max_days}d`
                  : '0 disposed cases in cohort (0 eligible)'}
              </div>
            </div>

            <div className="cb-card p-5 bg-white border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300 transition">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <span>SLA Compliance</span>
                <ShieldCheck className="w-4 h-4 text-indigo-600" aria-hidden="true" />
              </div>
              <div className="text-[32px] font-bold text-slate-900 tracking-tight mt-1 num-tabular">
                {data.resolution_stats.has_resolved_cases ? (
                  `${data.resolution_stats.sla_compliance_rate}%`
                ) : (
                  <span className="text-2xl text-slate-400">N/A</span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-medium">
                {data.resolution_stats.has_resolved_cases
                  ? `${data.resolution_stats.within_sla_count} of ${data.resolution_stats.resolved_cases} resolved within SLA`
                  : 'N/A · No eligible disposed cases'}
              </div>
            </div>
          </div>

          {/* Resolution & SLA Performance Benchmark Card */}
          <div className="cb-card p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" aria-hidden="true" />
                  <span>Resolution-Time & SLA Performance Statistics</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Resolution metrics computed from closed and disposed cases logged during {data.period_label}
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 self-start sm:self-auto">
                {data.resolution_stats.resolved_cases} resolved / {data.total_cases} total cohort
              </span>
            </div>

            {/* Visual SLA Compliance Bar or Active Intake Cohort Callout */}
            {!data.resolution_stats.has_resolved_cases ? (
              <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <div className="font-semibold text-amber-950">Active Intake Cohort · No Disposals Yet</div>
                  <div className="text-amber-800 mt-0.5 leading-relaxed">
                    All {data.total_cases} complaint cases received in {data.period_label} are currently under active investigation or multi-bureau review ({data.summary.open_cases} open, 0 disposed). Resolution times and SLA adherence are calculated strictly for disposed cases within the intake cohort and will populate as cases reach resolution.
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>SLA Adherence Rate</span>
                  <span className="font-bold text-slate-900 num-tabular">
                    {data.resolution_stats.sla_compliance_rate}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      data.resolution_stats.sla_compliance_rate >= 80
                        ? 'bg-emerald-500'
                        : data.resolution_stats.sla_compliance_rate >= 50
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(0, data.resolution_stats.sla_compliance_rate))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Detailed Metric Badges Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
              <div className="p-3 rounded-lg bg-slate-50 text-center border border-slate-100">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Average Time
                </div>
                <div className="text-xl font-bold text-slate-900 mt-1 num-tabular">
                  {data.resolution_stats.has_resolved_cases ? (
                    <>
                      {data.resolution_stats.avg_days} <span className="text-xs font-normal text-slate-500">days</span>
                    </>
                  ) : (
                    <span className="text-base text-slate-400 font-medium">N/A</span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 text-center border border-slate-100">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Median Time
                </div>
                <div className="text-xl font-bold text-slate-900 mt-1 num-tabular">
                  {data.resolution_stats.has_resolved_cases ? (
                    <>
                      {data.resolution_stats.median_days} <span className="text-xs font-normal text-slate-500">days</span>
                    </>
                  ) : (
                    <span className="text-base text-slate-400 font-medium">N/A</span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 text-center border border-slate-100">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Fastest Closure
                </div>
                <div className="text-xl font-bold text-slate-900 mt-1 num-tabular">
                  {data.resolution_stats.has_resolved_cases ? (
                    <>
                      {data.resolution_stats.min_days} <span className="text-xs font-normal text-slate-500">days</span>
                    </>
                  ) : (
                    <span className="text-base text-slate-400 font-medium">N/A</span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 text-center border border-slate-100">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Longest Closure
                </div>
                <div className="text-xl font-bold text-slate-900 mt-1 num-tabular">
                  {data.resolution_stats.has_resolved_cases ? (
                    <>
                      {data.resolution_stats.max_days} <span className="text-xs font-normal text-slate-500">days</span>
                    </>
                  ) : (
                    <span className="text-base text-slate-400 font-medium">N/A</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Two-Column Analytics: Status Breakdown & Category Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Breakdown */}
            <div className="cb-card p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-blue-600" aria-hidden="true" />
                    <span>Complaints by Status</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Workflow distribution of cohort intake</p>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {data.by_status.filter((s) => s.count > 0).length} active statuses
                </span>
              </div>

              {/* Status Pie Chart */}
              <div className="w-[260px] h-[260px] mx-auto relative flex items-center justify-center my-2">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-md text-xs">
                            <div className="font-bold text-slate-900">{formatStatus(item.status)}</div>
                            <div className="text-slate-600 mt-1">
                              {item.count} cases ({item.percentage}%)
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Pie
                      data={data.by_status.filter((s) => s.count > 0)}
                      dataKey="count"
                      nameKey="status"
                      startAngle={90}
                      endAngle={-270}
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius={105}
                      labelLine={false}
                      label={renderSliceLabel}
                      onMouseEnter={(_, index) => {
                        const filtered = data.by_status.filter((s) => s.count > 0);
                        if (filtered[index]) setHoveredStatus(filtered[index].status);
                      }}
                      onMouseLeave={() => setHoveredStatus(null)}
                    >
                      {data.by_status
                        .filter((s) => s.count > 0)
                        .map((item, index) => {
                          const isHovered = hoveredStatus === item.status;
                          return (
                            <Cell
                              key={`status-slice-${index}`}
                              fill={getStatusColor(item.status)}
                              stroke="#FFFFFF"
                              strokeWidth={2}
                              opacity={hoveredStatus ? (isHovered ? 1 : 0.45) : 1}
                            />
                          );
                        })}
                    </Pie>
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>

              {/* Status Breakdown Table */}
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3 text-right">Count</th>
                      <th className="py-2 px-3 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.by_status.map((item) => (
                      <tr
                        key={item.status}
                        onMouseEnter={() => setHoveredStatus(item.status)}
                        onMouseLeave={() => setHoveredStatus(null)}
                        className={`transition ${
                          hoveredStatus === item.status ? 'bg-slate-50' : ''
                        }`}
                      >
                        <td className="py-2 px-3">
                          <StatusChip status={item.status} />
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-800 num-tabular">
                          {item.count}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-medium text-slate-600 num-tabular">
                              {item.percentage}%
                            </span>
                            <div className="w-14 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, item.percentage)}%`,
                                  backgroundColor: getStatusColor(item.status),
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="cb-card p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-teal-600" aria-hidden="true" />
                    <span>Complaints by Category</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Categorical grievance domain classification</p>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {data.by_category.filter((c) => c.count > 0).length} active categories
                </span>
              </div>

              {/* Category Pie Chart */}
              <div className="w-[260px] h-[260px] mx-auto relative flex items-center justify-center my-2">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-md text-xs">
                            <div className="font-bold text-slate-900">{formatCategory(item.category)}</div>
                            <div className="text-slate-600 mt-1">
                              {item.count} cases ({item.percentage}%)
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Pie
                      data={data.by_category.filter((c) => c.count > 0)}
                      dataKey="count"
                      nameKey="category"
                      startAngle={90}
                      endAngle={-270}
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius={105}
                      labelLine={false}
                      label={renderSliceLabel}
                      onMouseEnter={(_, index) => {
                        const filtered = data.by_category.filter((c) => c.count > 0);
                        if (filtered[index]) setHoveredCategory(filtered[index].category);
                      }}
                      onMouseLeave={() => setHoveredCategory(null)}
                    >
                      {data.by_category
                        .filter((c) => c.count > 0)
                        .map((item, index) => {
                          const isHovered = hoveredCategory === item.category;
                          return (
                            <Cell
                              key={`category-slice-${index}`}
                              fill={getCategoryColor(item.category, index)}
                              stroke="#FFFFFF"
                              strokeWidth={2}
                              opacity={hoveredCategory ? (isHovered ? 1 : 0.45) : 1}
                            />
                          );
                        })}
                    </Pie>
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>

              {/* Category Breakdown Table */}
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-2 px-3">Grievance Category</th>
                      <th className="py-2 px-3 text-right">Count</th>
                      <th className="py-2 px-3 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.by_category.map((item, idx) => (
                      <tr
                        key={item.category}
                        onMouseEnter={() => setHoveredCategory(item.category)}
                        onMouseLeave={() => setHoveredCategory(null)}
                        className={`transition ${
                          hoveredCategory === item.category ? 'bg-slate-50' : ''
                        }`}
                      >
                        <td className="py-2 px-3 font-medium text-slate-800 flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: getCategoryColor(item.category, idx) }}
                            aria-hidden="true"
                          />
                          <span>{formatCategory(item.category)}</span>
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-800 num-tabular">
                          {item.count}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-medium text-slate-600 num-tabular">
                              {item.percentage}%
                            </span>
                            <div className="w-14 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, item.percentage)}%`,
                                  backgroundColor: getCategoryColor(item.category, idx),
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 5. Complaints by Institute Breakdown Table */}
          <div className="cb-card p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" aria-hidden="true" />
                  <span>Complaints by Institute</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Institutions ranked by grievance volume registered in {data.period_label}
                </p>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {data.by_institution.length} registered institutions
              </span>
            </div>

            {data.by_institution.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No institution records associated with complaints in this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-2.5 px-3">Permanent ID</th>
                      <th className="py-2.5 px-3">Institution Name</th>
                      <th className="py-2.5 px-3 text-right">Complaint Volume</th>
                      <th className="py-2.5 px-3 text-right">Cohort Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.by_institution.map((inst) => (
                      <tr key={inst.permanent_id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3">
                          {inst.permanent_id !== 'UNKNOWN' ? (
                            <Link
                              to={`/institutions/${encodeURIComponent(inst.permanent_id)}`}
                              className="font-mono text-blue-600 hover:text-blue-800 hover:underline font-medium"
                            >
                              {inst.permanent_id}
                            </Link>
                          ) : (
                            <span className="font-mono text-slate-400">UNKNOWN</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {inst.name}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 num-tabular">
                          {inst.count}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-medium text-slate-600 num-tabular">
                              {inst.percentage}%
                            </span>
                            <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full bg-blue-600 rounded-full"
                                style={{ width: `${Math.min(100, inst.percentage)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
