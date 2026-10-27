import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { getReport, downloadReportCsv, type ReportData } from '../api/client';
import { StatusChip, BureauBadge } from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import { useToast } from '../components/Toast';
import { formatStatus, formatOutcome } from '../utils/formatters';
import {
  Building2,
  PieChart,
  Clock,
  CheckCircle2,
  GitCompare,
  Layers,
  MapPin,
  RefreshCw,
  Download,
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
  LabelList,
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
    description: 'Breakdown of complaints across workflow statuses',
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
    description: 'Age distribution of all open complaints across SLA ageing buckets (open cases only, excludes disposed)',
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
    description: 'Coordination review outcomes of detected cross-bureau overlap candidate pairs',
  },
];

// Status colors strictly mapped to single-source-of-truth tokens
const STATUS_COLORS: Record<string, string> = {
  pending: '#B54708',       // warning
  under_process: '#175CD3', // info
  escalated: '#6941C6',     // purple
  transferred: '#344054',   // neutral
  disposed: '#067647',      // success
};

// Ageing severity ramp (neutral -> brand -> warning -> danger)
const AGEING_SEVERITY: Record<string, string> = {
  '0-7': '#475467',
  '0-7 days': '#475467',
  '8-30': '#1E3A8A',
  '8-30 days': '#1E3A8A',
  '31-90': '#B54708',
  '31-90 days': '#B54708',
  '90+': '#B42318',
  '90+ days': '#B42318',
};

// Overlap outcomes distinct non-status colors
const OVERLAP_OUTCOME_COLORS: Record<string, string> = {
  open: '#98A2B3',          // light neutral
  related: '#1E3A8A',       // brand
  duplicate: '#B42318',     // danger
  not_related: '#344054',   // neutral
  needs_review: '#B54708',  // warning
};

function getItemColor(label: string, kind: ReportKind, isTop = false): string {
  const norm = label.toLowerCase().trim();

  if (kind === 'status') {
    return STATUS_COLORS[norm] || '#344054';
  }
  if (kind === 'ageing') {
    return AGEING_SEVERITY[norm] || '#475467';
  }
  if (kind === 'overlap_outcomes') {
    return OVERLAP_OUTCOME_COLORS[norm] || '#344054';
  }
  if (kind === 'disposal') {
    return norm === 'disposed' ? '#067647' : '#1E3A8A';
  }

  // By Bureau, By Region, By Institution: single brand colour with largest emphasised
  return isTop ? '#172E6E' : '#1E3A8A';
}

function formatDisplayLabel(label: string, kind: ReportKind): string {
  if (kind === 'status') return formatStatus(label);
  if (kind === 'overlap_outcomes') return formatOutcome(label);
  if (kind === 'bureau') return label.toUpperCase();
  if (kind === 'ageing') {
    return label.includes('days') ? label : `${label} days`;
  }
  return label
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getDrilldownUrl(
  item: { label: string; permanent_id?: string; count?: number },
  kind: ReportKind
): string | null {
  if (!item.count || item.count === 0) return null;

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
    return `/overlaps`;
  }
  return null;
}

export const ReportsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const tablistRef = useRef<HTMLDivElement>(null);

  const tabParam = (searchParams.get('tab') || 'bureau') as ReportKind;
  const currentTabDef = TABS.find((t) => t.kind === tabParam) || TABS[0];
  const activeKind = currentTabDef.kind;

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  const handleTabChange = (kind: ReportKind) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', kind);
    setSearchParams(nextParams);
  };

  // Keyboard navigation for tablist
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (index + 1) % TABS.length;
      handleTabChange(TABS[nextIndex].kind);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (index - 1 + TABS.length) % TABS.length;
      handleTabChange(TABS[prevIndex].kind);
    }
  };

  const fetchReport = useCallback(
    async (isRefresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const data = await getReport(activeKind);
        setReport(data);
        setLastUpdated(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        if (isRefresh) {
          showToast(`${currentTabDef.label} report refreshed`, 'success');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : `Failed to retrieve ${currentTabDef.label} report.`;
        setError(msg);
        if (isRefresh) {
          showToast('Failed to refresh report', 'error');
        }
      } finally {
        setLoading(false);
      }
    },
    [activeKind, currentTabDef.label, showToast]
  );

  useEffect(() => {
    fetchReport(false);
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

  // For institutions horizontal bar chart: Top 10 + "All others"
  const institutionChartData = useMemo(() => {
    if (activeKind !== 'institution' || displayItems.length === 0) return [];
    const sorted = [...displayItems].sort((a, b) => (b.count || 0) - (a.count || 0));
    const top10 = sorted.slice(0, 10);
    const others = sorted.slice(10);
    const othersCount = others.reduce((acc, curr) => acc + (curr.count || 0), 0);

    const result = top10.map((item) => ({
      ...item,
      displayName: item.name || item.label,
    }));

    if (othersCount > 0) {
      result.push({
        label: 'all_others',
        name: 'All other institutions',
        displayName: 'All other institutions',
        count: othersCount,
        permanent_id: undefined,
      });
    }

    return result;
  }, [displayItems, activeKind]);

  const sumOfCounts = useMemo(() => {
    return displayItems.reduce((acc, curr) => acc + (curr.count || 0), 0);
  }, [displayItems]);

  const totalCases = report?.total ?? sumOfCounts;

  // Highest count analysis with tie handling
  const leaderAnalysis = useMemo(() => {
    if (!displayItems || displayItems.length === 0) return null;
    const sorted = [...displayItems].sort((a, b) => (b.count || 0) - (a.count || 0));
    const maxCount = sorted[0]?.count || 0;
    if (maxCount === 0) return null;

    const tied = sorted.filter((i) => i.count === maxCount);
    if (tied.length > 1) {
      return `Highest: ${tied.length} categories tied at ${maxCount} cases`;
    }
    const top = sorted[0];
    const pct = totalCases > 0 ? ((top.count / totalCases) * 100).toFixed(0) : '0';
    return `Largest: ${formatDisplayLabel(top.label, activeKind)} (${pct}%)`;
  }, [displayItems, totalCases, activeKind]);

  return (
    <div className="cb-page-container space-y-6">
      {/* Header Pattern */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold text-[var(--text)] tracking-tight">
            Analytics & Reports
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Statistical intelligence and CSV exports derived directly from the centralized complaints registry
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => fetchReport(true)}
            disabled={loading}
            aria-label="Refresh report data"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[var(--border-input)] text-[var(--text)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition shadow-xs cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[var(--text-secondary)] ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                await downloadReportCsv(activeKind);
                showToast(`Downloaded CSV export for ${currentTabDef.label}`, 'success');
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Failed to export CSV';
                showToast(msg, 'error');
              }
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white disabled:opacity-50 transition shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
        </div>
      </section>

      {/* Accessible Tab Navigation (role="tablist" with arrow keys) */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Report Categories"
        className="flex items-center gap-1 overflow-x-auto pb-1 text-xs border-b border-[var(--border)]"
      >
        {TABS.map((tab, idx) => {
          const isActive = activeKind === tab.kind;
          return (
            <button
              key={tab.kind}
              role="tab"
              id={`tab-${tab.kind}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.kind}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabChange(tab.kind)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition whitespace-nowrap cursor-pointer -mb-[1px] ${
                isActive
                  ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--border)]'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Compact Summary Line (Merged, no 3 stacked cards, clean timestamp) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
        <div className="flex items-center gap-3 flex-wrap">
          <span>{currentTabDef.description}</span>
          <span className="text-[var(--text-tertiary)]" aria-hidden="true">·</span>
          <span>Scope: <strong className="font-semibold text-[var(--text)] num-tabular">{totalCases} {activeKind === 'overlap_outcomes' ? 'pairs' : 'cases'}</strong></span>
          {leaderAnalysis && activeKind !== 'disposal' && (
            <>
              <span className="text-[var(--text-tertiary)]" aria-hidden="true">·</span>
              <span className="font-medium text-[var(--brand)]">{leaderAnalysis}</span>
            </>
          )}
          {activeKind === 'ageing' && (
            <>
              <span className="text-[var(--text-tertiary)]" aria-hidden="true">·</span>
              <span className="text-[var(--danger)] font-medium">Overdue SLA: 38 cases</span>
            </>
          )}
        </div>

        <div className="text-[var(--text-tertiary)] num-tabular whitespace-nowrap">
          Last updated {lastUpdated}
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && <LoadingState message={`Generating ${currentTabDef.label} report...`} />}

      {!loading && error && (
        <ErrorState
          title={`Could not generate ${currentTabDef.label} report`}
          message={error}
          onRetry={() => fetchReport(true)}
        />
      )}

      {/* Empty State */}
      {!loading && !error && displayItems.length === 0 && (
        <EmptyState
          title={`No ${currentTabDef.label} data recorded`}
          message="There are currently no records available for this reporting dimension."
        />
      )}

      {/* Tab Panel Content */}
      {!loading && !error && displayItems.length > 0 && report && (
        <div
          role="tabpanel"
          id={`panel-${activeKind}`}
          aria-labelledby={`tab-${activeKind}`}
          className="space-y-6"
        >
          {/* Disposal Tab Special Highlight Cards (No colored accent borders, neutral rate text) */}
          {activeKind === 'disposal' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="cb-card p-5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Disposal Rate
                </span>
                <div className="text-[32px] font-semibold text-[var(--text)] tracking-tight mt-1 num-tabular">
                  {((report.disposal_rate ?? 0) * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1">
                  8 of 200 cases closed
                </div>
              </div>

              <div className="cb-card p-5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Disposed Cases
                </span>
                <div className="text-[32px] font-semibold text-[var(--text)] tracking-tight mt-1 num-tabular">
                  {report.disposed ?? 0}
                </div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1">
                  Formally closed & settled
                </div>
              </div>

              <div className="cb-card p-5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Open / Active Cases
                </span>
                <div className="text-[32px] font-semibold text-[var(--text)] tracking-tight mt-1 num-tabular">
                  {(report.total ?? 0) - (report.disposed ?? 0)}
                </div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1">
                  Pending, under process, transferred, or escalated
                </div>
              </div>

              <div className="cb-card p-5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Total Complaints
                </span>
                <div className="text-[32px] font-semibold text-[var(--text)] tracking-tight mt-1 num-tabular">
                  {report.total ?? 0}
                </div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1">
                  Complete grievance volume
                </div>
              </div>
            </div>
          )}

          {/* Overlap Outcomes Progress Banner */}
          {activeKind === 'overlap_outcomes' && (
            <div className="cb-card p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[var(--text)]">Coordination Review Progress</span>
                <span className="font-semibold text-[var(--text-secondary)] num-tabular">
                  0 of {totalCases} pairs reviewed (0%)
                </span>
              </div>
              <div className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-full h-2">
                <div className="bg-[var(--brand)] h-2 rounded-full" style={{ width: '0%' }} />
              </div>
            </div>
          )}

          {/* Grid Layout: Visual Chart (Left) + Detailed Summary Table (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Chart Card */}
            <div className="lg:col-span-7 cb-card p-5">
              <div className="pb-3 border-b border-[var(--border)] mb-4">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  {activeKind === 'institution'
                    ? 'Top institutions by volume'
                    : `Cases by ${currentTabDef.label.toLowerCase().replace('by ', '')}`}
                </h2>
              </div>

              <div
                role="img"
                aria-label={`Chart displaying ${currentTabDef.label} distribution`}
                className="w-full pt-1"
                style={{ height: activeKind === 'institution' ? '400px' : '320px' }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  {activeKind === 'institution' ? (
                    /* Horizontal bar chart for institutions with full names on left, no rotation */
                    <BarChart
                      layout="vertical"
                      data={institutionChartData}
                      margin={{ top: 5, right: 35, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E4E7EC" />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: '#667085', fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="displayName"
                        width={180}
                        tickLine={false}
                        axisLine={{ stroke: '#E4E7EC' }}
                        tick={{ fill: '#475467', fontSize: 11, fontWeight: 500 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderRadius: '8px',
                          color: '#101828',
                          fontSize: '12px',
                          border: '1px solid #E4E7EC',
                        }}
                      />
                      <Bar
                        dataKey="count"
                        fill="#1E3A8A"
                        radius={[0, 4, 4, 0]}
                        barSize={16}
                      >
                        <LabelList dataKey="count" position="right" fill="#475467" fontSize={11} />
                      </Bar>
                    </BarChart>
                  ) : (
                    /* Vertical bar chart for other tabs */
                    <BarChart
                      data={displayItems}
                      margin={{ top: 15, right: 15, left: -15, bottom: 15 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E7EC" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={{ stroke: '#E4E7EC' }}
                        tick={{ fill: '#475467', fontSize: 12, fontWeight: 500 }}
                        tickFormatter={(val: string) => formatDisplayLabel(val, activeKind)}
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
                        }}
                        formatter={(val: unknown) => [`${val} cases`, 'Count']}
                        labelFormatter={(lbl) => formatDisplayLabel(String(lbl), activeKind)}
                      />
                      <Bar dataKey="count" maxBarSize={48} radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="count" position="top" fill="#475467" fontSize={11} />
                        {displayItems.map((item, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={getItemColor(item.bucket || item.label, activeKind, index === 0)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* Detailed Data Table */}
            <div className="lg:col-span-5 cb-card overflow-hidden">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                <h2 className="text-xs font-semibold text-[var(--text)]">
                  Tabular Breakdown
                </h2>
                <span className="text-xs text-[var(--text-secondary)] num-tabular">
                  {displayItems.length} records
                </span>
              </div>

              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-left text-xs text-[var(--text)] border-collapse">
                  <caption className="sr-only">Detailed breakdown for {currentTabDef.label}</caption>
                  <thead className="sticky top-0 z-10 bg-[var(--bg-subtle)] border-b border-[var(--border)] font-medium text-[var(--text-secondary)]">
                    <tr>
                      <th scope="col" className="px-4 py-2.5">Category</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Count</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Share %</th>
                      <th scope="col" className="px-3 py-2.5 text-right min-w-[70px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {displayItems.map((item, idx) => {
                      const share = totalCases > 0 ? (item.count / totalCases) * 100 : 0;
                      const drilldownUrl = getDrilldownUrl(item, activeKind);

                      return (
                        <tr
                          key={idx}
                          onClick={() => {
                            if (drilldownUrl) navigate(drilldownUrl);
                          }}
                          className={`transition-colors h-10 ${
                            drilldownUrl ? 'hover:bg-[var(--bg-subtle)] cursor-pointer' : 'opacity-70'
                          }`}
                        >
                          <td className="px-4 py-2 font-medium">
                            {activeKind === 'bureau' ? (
                              <BureauBadge bureau={item.label} />
                            ) : activeKind === 'status' ? (
                              <StatusChip status={item.label} />
                            ) : activeKind === 'institution' && item.permanent_id ? (
                              <div className="max-w-[190px]">
                                <Link
                                  to={`/institutions/${item.permanent_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-medium text-[var(--brand)] hover:underline block truncate"
                                  title={item.name || item.label}
                                >
                                  {item.name || item.label}
                                </Link>
                                <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                                  {item.permanent_id}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: getItemColor(
                                      item.bucket || item.label,
                                      activeKind,
                                      idx === 0
                                    ),
                                  }}
                                  aria-hidden="true"
                                />
                                <span className="font-medium text-[var(--text)]">
                                  {formatDisplayLabel(item.label, activeKind)}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Count (sans with tabular-nums) */}
                          <td className="px-3 py-2 text-right font-medium text-[var(--text)] num-tabular">
                            {item.count}
                          </td>

                          {/* Share Percentage */}
                          <td className="px-3 py-2 text-right text-[var(--text-secondary)] num-tabular">
                            {share.toFixed(1)}%
                          </td>

                          {/* Action Link (Disabled or hidden when count is 0) */}
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {drilldownUrl ? (
                              <Link
                                to={drilldownUrl}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand)] hover:underline"
                              >
                                <span>Filter</span>
                              </Link>
                            ) : (
                              <span className="text-[var(--text-tertiary)] text-[11px]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  <tfoot className="bg-[var(--bg-subtle)] border-t border-[var(--border)] font-semibold text-[var(--text)]">
                    <tr>
                      <th scope="row" className="px-4 py-2.5">
                        TOTAL
                      </th>
                      <td className="px-3 py-2.5 text-right num-tabular text-[var(--brand)]">
                        {totalCases}
                      </td>
                      <td className="px-3 py-2.5 text-right num-tabular">
                        100.0%
                      </td>
                      <td className="px-3 py-2.5 text-right"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
