import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getReport, type ReportData } from '../api/client';
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
  ExternalLink,
  Percent,
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
    description: 'Distribution of complaints across AICTE Bureaus and Cells (RB, PGRC, RO, OC)',
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
    description: 'Geographic spread of grievances across AICTE administrative regions',
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

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Title & Breadcrumb header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
              Analytics & Intelligence
            </span>
            <span className="text-xs text-slate-400 font-mono">FR16 · Single-Source Truth</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-blue-900" />
            <span>Consolidated Complaint Reports</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Official reporting metrics derived directly from the consolidated complaint cases registry.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchReport}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition shadow-xs cursor-pointer self-start sm:self-auto disabled:opacity-50"
          title="Refresh current report data"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Report</span>
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="border-b border-slate-200 mb-6 overflow-x-auto">
        <nav className="flex space-x-2 min-w-max pb-px" aria-label="Report Categories">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeKind === tab.kind;

            return (
              <button
                key={tab.kind}
                type="button"
                onClick={() => handleTabChange(tab.kind)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'border-blue-900 text-blue-900 bg-blue-50/60 rounded-t-md font-bold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-900' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Header Description */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center flex-shrink-0">
            <currentTabDef.icon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">{currentTabDef.label} Report</h2>
            <p className="text-xs text-slate-500">{currentTabDef.description}</p>
          </div>
        </div>

        {report && (
          <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200 text-xs">
            <span className="text-slate-500">Report Scope:</span>
            <span className="font-bold text-slate-900 font-mono">
              {totalCases} {activeKind === 'overlap_outcomes' ? 'Pairs' : 'Cases'}
            </span>
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
          {/* Disposal Tab Special Highlight Cards */}
          {activeKind === 'disposal' && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {/* Disposal Rate Card */}
              <div className="p-5 rounded-lg bg-white border border-slate-200 border-t-4 border-t-emerald-600 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                    Disposal Rate
                  </span>
                  <Percent className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-3xl font-extrabold text-emerald-700 tracking-tight">
                  {((report.disposal_rate ?? 0) * 100).toFixed(1)}%
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Resolved cases out of total logged
                </div>
              </div>

              {/* Disposed Cases Card */}
              <div className="p-5 rounded-lg bg-white border border-slate-200 border-t-4 border-t-emerald-500 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                    Disposed Cases
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {report.disposed ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Officially closed complaints
                </div>
              </div>

              {/* Open Cases Card */}
              <div className="p-5 rounded-lg bg-white border border-slate-200 border-t-4 border-t-blue-600 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider">
                    Open / Active Cases
                  </span>
                  <Clock className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-3xl font-extrabold text-blue-900 tracking-tight">
                  {(report.total ?? 0) - (report.disposed ?? 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Pending, under process, or escalated
                </div>
              </div>

              {/* Total Cases Card */}
              <div className="p-5 rounded-lg bg-white border border-slate-200 border-t-4 border-t-slate-400 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Total Cases
                  </span>
                  <Layers className="w-4 h-4 text-slate-500" />
                </div>
                <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {report.total ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Complete registry volume
                </div>
              </div>
            </div>
          )}

          {/* Grid Layout: Visual Bar Chart (Left) + Detailed Summary Table (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Recharts Bar Chart Card */}
            <div className="lg:col-span-7 bg-white rounded-lg border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-900" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    {currentTabDef.label} Visual Distribution
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400">Bar Chart</span>
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
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '12px',
                        border: 'none',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      }}
                      itemStyle={{ color: '#f8fafc', padding: '2px 0' }}
                      formatter={(value: any) => [
                        `${value} ${activeKind === 'overlap_outcomes' ? 'pairs' : 'cases'}`,
                        'Count',
                      ]}
                      labelFormatter={(label: any) => formatLabel(String(label ?? ''), activeKind)}
                    />
                    <Bar dataKey="count" name="Case Count" radius={[3, 3, 0, 0]}>
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

            {/* Labels and Counts Table Card */}
            <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs">
              <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Tabular Data & Counts
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Detailed label breakdown with percentage shares
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                  {displayItems.length} Records
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 uppercase tracking-wider text-[11px]">
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayItems.map((item, idx) => {
                      const share = totalCases > 0 ? (item.count / totalCases) * 100 : 0;
                      const itemColor = getItemColor(item.bucket || item.label, activeKind);

                      return (
                        <tr
                          key={idx}
                          className={`${
                            idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                          } hover:bg-blue-50/30 transition-colors`}
                        >
                          {/* Label column with customized badge */}
                          <td className="px-4 py-2.5 font-medium">
                            {activeKind === 'bureau' ? (
                              <BureauBadge bureau={item.label} />
                            ) : activeKind === 'status' ? (
                              <StatusChip status={item.label} />
                            ) : activeKind === 'institution' && item.permanent_id ? (
                              <div className="max-w-[180px] sm:max-w-[220px]">
                                <Link
                                  to={`/institutions/${item.permanent_id}`}
                                  className="font-semibold text-blue-900 hover:underline flex items-center gap-1 truncate"
                                  title={item.name || item.label}
                                >
                                  <span className="truncate">{item.name || item.label}</span>
                                  <ExternalLink className="w-3 h-3 flex-shrink-0 text-slate-400" />
                                </Link>
                                <span className="font-mono text-[10px] text-slate-400">
                                  {item.permanent_id}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: itemColor }}
                                />
                                <span className="capitalize font-semibold text-slate-800">
                                  {formatLabel(item.label, activeKind)}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Count */}
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                            {item.count}
                          </td>

                          {/* Share Percentage */}
                          <td className="px-3 py-2.5 text-right font-mono text-slate-600">
                            {share.toFixed(1)}%
                          </td>

                          {/* Visual Ratio Mini Bar */}
                          <td className="px-4 py-2.5">
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${Math.min(100, Math.max(2, share))}%`,
                                  backgroundColor: itemColor,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Required Total Row */}
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                    <tr>
                      <th scope="row" className="px-4 py-3 uppercase tracking-wider text-slate-900">
                        Total {activeKind === 'overlap_outcomes' ? 'Pairs' : 'Cases'}
                      </th>
                      <td className="px-3 py-3 text-right font-mono font-extrabold text-blue-900 text-sm">
                        {totalCases}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-700">
                        100.0%
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-full bg-blue-900 rounded-full h-2" />
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
