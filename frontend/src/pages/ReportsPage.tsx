import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getReport, downloadReportCsv, type ReportData } from '../api/client';
import { StatusChip, BureauBadge } from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import {
  BarChart3,
  Building2,
  PieChart,
  Clock,
  CheckCircle2,
  GitCompare,
  Layers,
  MapPin,
  RefreshCw,
  Download,
  ExternalLink,
  Percent,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

export type ReportKind =
  | 'bureau'
  | 'status'
  | 'region'
  | 'institution'
  | 'ageing'
  | 'disposal'
  | 'overlap_outcomes';

interface TabDefinition {
  kind: ReportKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const TABS: TabDefinition[] = [
  {
    kind: 'bureau',
    label: 'By Bureau',
    icon: Layers,
    description: 'Distribution of complaints across Bureaus and Cells (RB, PGRC, RO, OC)',
  },
  {
    kind: 'status',
    label: 'By Status',
    icon: PieChart,
    description: 'Breakdown of complaints across workflow statuses (pending, under process, disposed, transferred, escalated)',
  },
  {
    kind: 'region',
    label: 'By Region',
    icon: MapPin,
    description: 'Geographic spread of grievances across administrative regions',
  },
  {
    kind: 'institution',
    label: 'By Institution',
    icon: Building2,
    description: 'Institutions with the highest volume of registered complaint records',
  },
  {
    kind: 'ageing',
    label: 'Ageing',
    icon: Clock,
    description: 'Age distribution of all open (non-disposed) complaints across SLA ageing buckets',
  },
  {
    kind: 'disposal',
    label: 'Disposal',
    icon: CheckCircle2,
    description: 'Overall complaint resolution metrics and percentage disposal rate',
  },
  {
    kind: 'overlap_outcomes',
    label: 'Overlap Outcomes',
    icon: GitCompare,
    description: 'Classification results of detected cross-bureau overlap candidate pairs',
  },
];

// Consistent color palettes aligned with the rest of the application
const STATUS_COLORS: Record<string, string> = {
  pending: '#d97706', // amber-600
  under_process: '#2563eb', // blue-600
  disposed: '#059669', // emerald-600
  transferred: '#64748b', // slate-500
  escalated: '#9333ea', // purple-600
};

const BUREAU_COLORS: Record<string, string> = {
  RB: '#1d4ed8', // blue-700
  PGRC: '#0d9488', // teal-600
  RO: '#d97706', // amber-600
  OC: '#4f46e5', // indigo-600
};

const REGION_COLORS: Record<string, string> = {
  North: '#2563eb',
  South: '#059669',
  East: '#7c3aed',
  West: '#d97706',
  Central: '#0891b2',
  Unassigned: '#94a3b8',
};

const AGEING_COLORS: Record<string, string> = {
  '0-7': '#10b981', // emerald-500
  '0-7 days': '#10b981',
  '8-30': '#2563eb', // blue-600
  '8-30 days': '#2563eb',
  '31-90': '#f59e0b', // amber-500
  '31-90 days': '#f59e0b',
  '90+': '#ef4444', // red-500
  '90+ days': '#ef4444',
};

const DISPOSAL_COLORS: Record<string, string> = {
  disposed: '#059669', // emerald-600
  open: '#2563eb', // blue-600
};

const OVERLAP_COLORS: Record<string, string> = {
  open: '#f59e0b',
  related: '#2563eb',
  duplicate: '#9333ea',
  not_related: '#64748b',
  needs_review: '#4f46e5',
};

function getItemColor(label: string, kind: ReportKind): string {
  const norm = label.toLowerCase().trim();

  if (kind === 'bureau') {
    return BUREAU_COLORS[label.toUpperCase()] || '#1e3a8a';
  }
  if (kind === 'status') {
    return STATUS_COLORS[norm] || '#64748b';
  }
  if (kind === 'region') {
    return REGION_COLORS[label] || '#3b82f6';
  }
  if (kind === 'ageing') {
    return AGEING_COLORS[label] || AGEING_COLORS[norm] || '#f59e0b';
  }
  if (kind === 'disposal') {
    return DISPOSAL_COLORS[norm] || '#2563eb';
  }
  if (kind === 'overlap_outcomes') {
    return OVERLAP_COLORS[norm] || '#64748b';
  }
  // Institution or default
  return '#1e3a8a';
}

function formatLabel(label: string, kind: ReportKind): string {
  if (kind === 'status' || kind === 'overlap_outcomes') {
    return label.replace(/_/g, ' ');
  }
  return label;
}

function getDrilldownUrl(item: { label: string; bucket?: string; permanent_id?: string }, kind: ReportKind): string | null {
  if (kind === 'bureau') {
    return `/cases?bureau=${encodeURIComponent(item.label.toUpperCase())}`;
  }
  if (kind === 'status') {
    return `/cases?status=${encodeURIComponent(item.label.toLowerCase())}`;
  }
  if (kind === 'region') {
    return `/cases?region=${encodeURIComponent(item.label)}`;
  }
  if (kind === 'institution' && item.permanent_id) {
    return `/institutions/${encodeURIComponent(item.permanent_id)}`;
  }
  if (kind === 'disposal') {
    if (item.label.toLowerCase() === 'disposed') return '/cases?status=disposed';
    if (item.label.toLowerCase() === 'open') return '/cases?status=pending';
    return '/cases';
  }
  if (kind === 'overlap_outcomes') {
    return '/overlap-queue';
  }
  if (kind === 'ageing') {
    return '/cases';
  }
  return null;
}

export const ReportsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read tab from query string, validating against TABS
  const tabParam = (searchParams.get('tab') || 'bureau') as ReportKind;
  const currentTabDef = TABS.find((t) => t.kind === tabParam) || TABS[0];
  const activeKind = currentTabDef.kind;

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Switch tab and sync with URL
  const handleTabChange = (kind: ReportKind) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', kind);
    setSearchParams(nextParams);
  };

  // Fetch report data for active tab
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReport(activeKind);
      setReport(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(`Failed to retrieve ${currentTabDef.label} report from CaseBridge.`);
      }
    } finally {
      setLoading(false);
    }
  }, [activeKind, currentTabDef.label]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Order items specifically for Ageing: 0-7, 8-30, 31-90, 90+
  const displayItems = useMemo(() => {
    if (!report || !report.items) return [];

    if (activeKind === 'ageing') {
      const bucketOrder = ['0-7', '8-30', '31-90', '90+'];
      return [...report.items].sort((a, b) => {
        const aKey = a.bucket || a.label.split(' ')[0];
        const bKey = b.bucket || b.label.split(' ')[0];
        const aIndex = bucketOrder.indexOf(aKey);
        const bIndex = bucketOrder.indexOf(bKey);
        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
      });
    }

    return report.items;
  }, [report, activeKind]);

  // Calculate sum of item counts
  const sumOfCounts = useMemo(() => {
    return displayItems.reduce((acc, curr) => acc + (curr.count || 0), 0);
  }, [displayItems]);

  const totalCases = report?.total ?? sumOfCounts;

  // Leading distribution category
  const topItem = useMemo(() => {
    if (!displayItems || displayItems.length === 0) return null;
    return [...displayItems].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
  }, [displayItems]);

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Consistent Header matching Cases, Institutions & Overview Pages */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Consolidated Complaint Reports
            </h1>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-900 border border-blue-200/80 shadow-2xs">
              7 Analytics Modules
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Single-source statistical intelligence and CSV exports derived directly from the centralized complaints registry
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition shadow-2xs cursor-pointer"
            title="Refresh current report data"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Report</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                await downloadReportCsv(activeKind);
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Failed to export CSV';
                setError(msg);
              }
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-blue-900 hover:bg-blue-800 text-white disabled:opacity-50 transition shadow-xs cursor-pointer"
            title="Export current report as CSV"
          >
            <Download className="w-3.5 h-3.5 text-blue-200" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Category Navigation Pills (Kalshi Reference 2 Style) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeKind === tab.kind;

          return (
            <button
              key={tab.kind}
              type="button"
              onClick={() => handleTabChange(tab.kind)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full font-semibold border transition cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-blue-900 text-white border-blue-900 shadow-sm font-bold'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-2xs'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-200' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Header Banner with Tax Close / Kalshi KPI Highlights */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-900/5 border border-blue-900/15 text-blue-900 flex items-center justify-center shrink-0 shadow-2xs">
            <currentTabDef.icon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900">{currentTabDef.label} Analytics</h2>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                FR16 Verified
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{currentTabDef.description}</p>
          </div>
        </div>

        {report && (
          <div className="flex items-center gap-3 flex-wrap self-start md:self-auto text-xs">
            {/* Scope Badge */}
            <div className="flex items-center gap-2 bg-slate-50/90 px-3.5 py-2 rounded-lg border border-slate-200/90 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Scope:</span>
              <span className="font-mono font-extrabold text-slate-900 text-sm">
                {totalCases} {activeKind === 'overlap_outcomes' ? 'Pairs' : 'Cases'}
              </span>
            </div>

            {/* Top Leader Badge */}
            {topItem && (
              <div className="flex items-center gap-2 bg-blue-50/60 px-3.5 py-2 rounded-lg border border-blue-200/70 shadow-2xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Primary:</span>
                <span className="font-bold text-blue-900 text-xs">
                  {formatLabel(topItem.label, activeKind)}
                </span>
                <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-100/80 px-1.5 py-0.5 rounded">
                  {totalCases > 0 ? ((topItem.count / totalCases) * 100).toFixed(0) : 0}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tab Loading State */}
      {loading && <LoadingState message={`Generating ${currentTabDef.label} report...`} />}

      {/* Tab Error State */}
      {!loading && error && (
        <ErrorState
          title={`Could not generate ${currentTabDef.label} report`}
          message={error}
          onRetry={fetchReport}
        />
      )}

      {/* Tab Empty State */}
      {!loading && !error && displayItems.length === 0 && (
        <EmptyState
          title={`No ${currentTabDef.label} data recorded`}
          message="There are currently no records available for this reporting dimension."
        />
      )}

      {/* Tab Content Display */}
      {!loading && !error && displayItems.length > 0 && report && (
        <div className="space-y-6">
          {/* Disposal Tab Special Highlight Cards (Tax Close Reference 1 Style) */}
          {activeKind === 'disposal' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Disposal Rate Card */}
              <div className="p-5 rounded-xl bg-white border border-emerald-200 shadow-xs relative overflow-hidden group hover:border-emerald-300 transition">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    Disposal Rate
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                    <Percent className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-emerald-700 tracking-tight font-mono">
                  {((report.disposal_rate ?? 0) * 100).toFixed(1)}%
                </div>
                <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Resolved cases out of total logged</span>
                </div>
              </div>

              {/* Disposed Cases Card */}
              <div className="p-5 rounded-xl bg-white border border-slate-200/90 shadow-xs relative overflow-hidden group hover:border-emerald-300 transition">
                <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Disposed Cases
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {report.disposed ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1.5">
                  Closed and formally settled
                </div>
              </div>

              {/* Open Cases Card */}
              <div className="p-5 rounded-xl bg-white border border-slate-200/90 shadow-xs relative overflow-hidden group hover:border-blue-300 transition">
                <div className="absolute top-0 left-0 right-0 h-1 bg-blue-600" />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900">
                    Open / Active Cases
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-blue-900 tracking-tight font-mono">
                  {(report.total ?? 0) - (report.disposed ?? 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1.5">
                  Pending, under process, or escalated
                </div>
              </div>

              {/* Total Cases Card */}
              <div className="p-5 rounded-xl bg-white border border-slate-200/90 shadow-xs relative overflow-hidden group hover:border-slate-300 transition">
                <div className="absolute top-0 left-0 right-0 h-1 bg-slate-400" />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Total In Registry
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {report.total ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1.5">
                  Complete grievance intake volume
                </div>
              </div>
            </div>
          )}

          {/* Grid Layout: Visual Bar Chart (Left) + Detailed Summary Table (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Recharts Bar Chart Card (Tax Close Reference 1 Bridge Styling) */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-900" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    {currentTabDef.label} Visual Distribution
                  </h3>
                </div>
                <span className="text-[11px] font-mono font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60">
                  Live Aggregate
                </span>
              </div>

              <div className="h-80 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={displayItems}
                    margin={{
                      top: 15,
                      right: 15,
                      left: -15,
                      bottom: activeKind === 'institution' ? 45 : 15,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                      interval={0}
                      angle={activeKind === 'institution' ? -35 : 0}
                      textAnchor={activeKind === 'institution' ? 'end' : 'middle'}
                      height={activeKind === 'institution' ? 55 : 30}
                      tickFormatter={(val: string) => {
                        if (activeKind === 'institution' && val.length > 20) {
                          return `${val.substring(0, 18)}…`;
                        }
                        return formatLabel(val, activeKind);
                      }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0];
                          const formattedTitle = formatLabel(String(label ?? ''), activeKind);
                          const countVal = data.value;
                          const shareVal = totalCases > 0 ? (((Number(countVal) || 0) / totalCases) * 100).toFixed(1) : '0.0';
                          return (
                            <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-xl shadow-xl border border-slate-700/80 text-xs min-w-[150px]">
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                {currentTabDef.label}
                              </div>
                              <div className="text-sm font-bold text-white mb-2 flex items-center justify-between gap-2">
                                <span>{formattedTitle}</span>
                                <span className="font-mono text-emerald-400 font-bold">{shareVal}%</span>
                              </div>
                              <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-slate-300 font-mono text-[11px]">
                                <span>Volume:</span>
                                <span className="font-bold text-white">
                                  {countVal} {activeKind === 'overlap_outcomes' ? 'pairs' : 'cases'}
                                </span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" name="Case Count" radius={[6, 6, 0, 0]}>
                      {displayItems.map((item, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={getItemColor(item.bucket || item.label, activeKind)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Labels and Counts Table Card (VertexPoint & Kalshi Dual Mini-Bar Style) */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-xs">
              <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Tabular Data & Counts
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Breakdown with percentage share & drilldown
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/80 font-mono shadow-2xs">
                  {displayItems.length} Records
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700 border-collapse">
                  <thead className="bg-slate-50/90 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        {activeKind === 'bureau'
                          ? 'Bureau'
                          : activeKind === 'status'
                          ? 'Status'
                          : activeKind === 'region'
                          ? 'Region'
                          : activeKind === 'institution'
                          ? 'Institution'
                          : activeKind === 'ageing'
                          ? 'Age Bucket'
                          : activeKind === 'disposal'
                          ? 'Category'
                          : 'Outcome'}
                      </th>
                      <th scope="col" className="px-3 py-3 text-right">
                        Count
                      </th>
                      <th scope="col" className="px-3 py-3 text-right">
                        Share
                      </th>
                      <th scope="col" className="px-4 py-3 text-left w-24">
                        Ratio
                      </th>
                      <th scope="col" className="px-3 py-3 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/90">
                    {displayItems.map((item, idx) => {
                      const share = totalCases > 0 ? (item.count / totalCases) * 100 : 0;
                      const itemColor = getItemColor(item.bucket || item.label, activeKind);
                      const drilldownUrl = getDrilldownUrl(item, activeKind);

                      return (
                        <tr
                          key={idx}
                          className="hover:bg-blue-50/40 transition-colors group"
                        >
                          {/* Label column with customized badge */}
                          <td className="px-4 py-2.5 font-medium">
                            {activeKind === 'bureau' ? (
                              <BureauBadge bureau={item.label} />
                            ) : activeKind === 'status' ? (
                              <StatusChip status={item.label} />
                            ) : activeKind === 'institution' && item.permanent_id ? (
                              <div className="max-w-[170px] sm:max-w-[200px]">
                                <Link
                                  to={`/institutions/${item.permanent_id}`}
                                  className="font-bold text-blue-900 group-hover:underline flex items-center gap-1 truncate text-xs"
                                  title={item.name || item.label}
                                >
                                  <span className="truncate">{item.name || item.label}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0 text-slate-400 group-hover:text-blue-900" />
                                </Link>
                                <span className="font-mono text-[10px] text-slate-400">
                                  {item.permanent_id}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                                  style={{ backgroundColor: itemColor }}
                                />
                                <span className="capitalize font-bold text-slate-800 text-xs">
                                  {formatLabel(item.label, activeKind)}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Count */}
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 text-xs">
                            {item.count}
                          </td>

                          {/* Share Percentage */}
                          <td className="px-3 py-2.5 text-right font-mono text-slate-600 font-semibold text-xs">
                            {share.toFixed(1)}%
                          </td>

                          {/* Visual Ratio Mini Bar (Kalshi Reference 2 Style) */}
                          <td className="px-4 py-2.5">
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/80 shadow-2xs">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${Math.min(100, Math.max(3, share))}%`,
                                  backgroundColor: itemColor,
                                }}
                              />
                            </div>
                          </td>

                          {/* Drilldown link */}
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            {drilldownUrl ? (
                              <Link
                                to={drilldownUrl}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 group-hover:text-blue-900 bg-white group-hover:bg-blue-50/80 border border-slate-200 group-hover:border-blue-300 px-2 py-0.5 rounded-md transition shadow-2xs"
                                title={`Inspect matching records in directory`}
                              >
                                <span>Filter</span>
                                <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                              </Link>
                            ) : (
                              <span className="text-slate-300 text-[11px]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Required Total Row */}
                  <tfoot className="bg-slate-50/90 border-t-2 border-slate-200 font-bold text-slate-900 text-xs">
                    <tr>
                      <th scope="row" className="px-4 py-3 uppercase tracking-wider text-slate-900">
                        Total {activeKind === 'overlap_outcomes' ? 'Pairs' : 'Cases'}
                      </th>
                      <td className="px-3 py-3 text-right font-mono font-black text-blue-900 text-sm">
                        {totalCases}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-700">
                        100.0%
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-full bg-blue-900 rounded-full h-2 shadow-2xs" />
                      </td>
                      <td className="px-3 py-3 text-right text-[11px] font-mono text-slate-400">
                        Sum
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
