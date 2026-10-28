import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { getReport, downloadReportCsv, type ReportData } from '../api/client';
import { StatusChip, BureauBadge } from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import { useToast } from '../components/Toast';
import { formatStatus, formatOutcome } from '../utils/formatters';
import {
  Building2,
  PieChart as PieChartIcon,
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
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
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
    icon: PieChartIcon,
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

// Curated vibrant color palettes for categorical dimensions
const VIBRANT_PALETTE = [
  '#2563EB', // Royal Blue
  '#0D9488', // Emerald Teal
  '#D97706', // Warm Amber
  '#7C3AED', // Vivid Purple
  '#E11D48', // Rose Coral
  '#0284C7', // Sky Blue
  '#059669', // Mint Emerald
  '#4F46E5', // Deep Indigo
];

// Single source of truth color tokens per specification with vibrant, high-contrast colors
function getSliceColor(
  item: { label: string; bucket?: string },
  index: number,
  kind: ReportKind
): string {
  const norm = (item.bucket || item.label || '').toLowerCase().trim();

  // Status colors: Pending amber, Under Process sky/teal, Escalated purple, Transferred indigo, Disposed emerald
  if (kind === 'status') {
    if (norm === 'pending') return '#D97706';
    if (norm === 'under_process') return '#0284C7';
    if (norm === 'escalated') return '#7C3AED';
    if (norm === 'transferred') return '#4F46E5';
    if (norm === 'disposed') return '#059669';
    return '#64748B';
  }

  // Ageing: 0-7 days cool slate, 8-30 brand blue, 31-90 amber, 90+ danger red
  if (kind === 'ageing') {
    if (norm.startsWith('0-7')) return '#64748B';
    if (norm.startsWith('8-30')) return '#2563EB';
    if (norm.startsWith('31-90')) return '#D97706';
    if (norm.startsWith('90')) return '#DC2626';
    return '#64748B';
  }

  // Disposal (2 slices): Disposed vibrant emerald green, Open bright blue
  if (kind === 'disposal') {
    return norm === 'disposed' ? '#059669' : '#3B82F6';
  }

  // Overlap Outcomes: Open slate, Related blue, Duplicate red, Not Related dark slate, Needs Review amber
  if (kind === 'overlap_outcomes') {
    if (norm === 'open') return '#64748B';
    if (norm === 'related') return '#2563EB';
    if (norm === 'duplicate') return '#DC2626';
    if (norm === 'not_related') return '#475569';
    if (norm === 'needs_review') return '#D97706';
    return '#64748B';
  }

  // By Bureau: distinctive bureau brand colors matching BureauBadge
  if (kind === 'bureau') {
    if (norm === 'rb') return '#2563EB'; // Royal Blue
    if (norm === 'pgrc') return '#0D9488'; // Teal
    if (norm === 'ro') return '#D97706'; // Amber
    if (norm === 'oc') return '#7C3AED'; // Purple
    return VIBRANT_PALETTE[index % VIBRANT_PALETTE.length];
  }

  // By Region: vibrant, distinctive categorical colors
  if (kind === 'region') {
    return VIBRANT_PALETTE[index % VIBRANT_PALETTE.length];
  }

  // By Institution: Top institutions in distinct vibrant colors
  if (kind === 'institution') {
    if (norm === 'all_others') return '#94A3B8';
    return VIBRANT_PALETTE[index % VIBRANT_PALETTE.length];
  }

  return VIBRANT_PALETTE[index % VIBRANT_PALETTE.length];
}

function formatDisplayLabel(label: string, kind: ReportKind): string {
  if (kind === 'status') return formatStatus(label);
  if (kind === 'overlap_outcomes') return formatOutcome(label);
  if (kind === 'bureau') return label.toUpperCase();
  if (kind === 'ageing') {
    return label.includes('days') ? label : `${label} days`;
  }
  if (label === 'all_others') return 'All other institutions';
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

// Custom Accessible Tooltip for Pie Charts
interface CustomPieTooltipProps {
  active?: boolean;
  payload?: any[];
  activeKind: ReportKind;
  totalCases: number;
}

const CustomPieTooltip: React.FC<CustomPieTooltipProps> = ({
  active,
  payload,
  activeKind,
  totalCases,
}) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const count = data.count || 0;
  const pct = totalCases > 0 ? ((count / totalCases) * 100).toFixed(1) : '0';
  const label = data.displayName || formatDisplayLabel(data.label, activeKind);

  return (
    <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-md text-xs space-y-1 z-30">
      <div className="font-bold text-slate-900">{label}</div>
      <div className="text-slate-600 flex items-center justify-between gap-4">
        <span>Count:</span>
        <span className="font-bold text-slate-900 num-tabular">{count}</span>
      </div>
      <div className="text-slate-600 flex items-center justify-between gap-4">
        <span>Share:</span>
        <span className="font-bold text-blue-700 num-tabular">{pct}%</span>
      </div>
    </div>
  );
};

export const ReportsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const tablistRef = useRef<HTMLDivElement>(null);

  const tabParam = (searchParams.get('tab') || 'bureau') as ReportKind;
  const currentTabDef = TABS.find((t) => t.kind === tabParam) || TABS[0];
  const activeKind = currentTabDef.kind;

  // Custom slice label renderer: denotes the category name on slices with 5% or more
  const renderCustomizedLabel = useCallback(
    (props: any) => {
      const { cx, cy, midAngle, innerRadius, outerRadius, percent, payload, name } = props;
      if (!percent || percent < 0.05) return null;

      const item = payload || {};
      const displayName = item.name || formatDisplayLabel(item.label || name || '', activeKind);
      if (!displayName) return null;

      const RADIAN = Math.PI / 180;
      // Position label at 58% radius between inner and outer edge
      const radius = innerRadius + (outerRadius - innerRadius) * 0.58;
      const x = cx + radius * Math.cos(-midAngle * RADIAN);
      const y = cy + radius * Math.sin(-midAngle * RADIAN);

      // If label has two words and is longer than 8 chars, split across 2 lines for clean spacing
      const words = displayName.split(' ');
      if (words.length === 2 && displayName.length > 8) {
        return (
          <text
            x={x}
            y={y}
            fill="#FFFFFF"
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[11px] font-bold select-none pointer-events-none drop-shadow-xs"
          >
            <tspan x={x} dy="-0.55em">{words[0]}</tspan>
            <tspan x={x} dy="1.15em">{words[1]}</tspan>
          </text>
        );
      }

      return (
        <text
          x={x}
          y={y}
          fill="#FFFFFF"
          textAnchor="middle"
          dominantBaseline="central"
          className="text-[11px] font-bold select-none pointer-events-none drop-shadow-xs"
        >
          {displayName}
        </text>
      );
    },
    [activeKind]
  );

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  const handleTabChange = (kind: ReportKind) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', kind);
    setSearchParams(nextParams);
    setHoveredLabel(null);
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

  const sumOfCounts = useMemo(() => {
    return displayItems.reduce((acc, curr) => acc + (curr.count || 0), 0);
  }, [displayItems]);

  const totalCases = report?.total ?? sumOfCounts;

  // For institutions horizontal bar chart: Top 10 + "All others" (original)
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
        displayName: 'All others',
        count: othersCount,
      });
    }
    return result;
  }, [displayItems, activeKind]);

  // Process and sort chart slices from largest to smallest clockwise (for non-institution tabs)
  const { chartSlices, legendItems } = useMemo(() => {
    if (!displayItems || displayItems.length === 0 || activeKind === 'institution') {
      return { chartSlices: [], legendItems: [] };
    }

    // Other tabs: order largest to smallest clockwise
    const sorted = [...displayItems].sort((a, b) => (b.count || 0) - (a.count || 0));
    const drawable = sorted.filter((s) => (s.count || 0) > 0);
    return { chartSlices: drawable, legendItems: sorted };
  }, [displayItems, activeKind]);

  // Dynamic review progress metrics for Overlap Outcomes report
  const overlapReviewStats = useMemo(() => {
    if (activeKind !== 'overlap_outcomes' || !displayItems) return null;
    const openItem = displayItems.find((i) => i.label?.toLowerCase() === 'open');
    const openCount = openItem ? (openItem.count || 0) : 0;
    const totalPairs = report?.total ?? sumOfCounts;
    const reviewedCount = Math.max(0, totalPairs - openCount);
    const reviewedPct = totalPairs > 0 ? Math.round((reviewedCount / totalPairs) * 100) : 0;
    return { totalPairs, reviewedCount, openCount, reviewedPct };
  }, [activeKind, displayItems, report, sumOfCounts]);

  // Accessible chart summary for role="img"
  const chartAriaSummary = useMemo(() => {
    if (activeKind === 'institution') {
      return 'Horizontal bar chart displaying top institutions by volume';
    }
    if (chartSlices.length === 0) return 'No data recorded for this category';
    const parts = chartSlices.map((item) => {
      const pct = totalCases > 0 ? Math.round(((item.count || 0) / totalCases) * 100) : 0;
      const name = item.name || formatDisplayLabel(item.label, activeKind);
      return `${name} ${pct}%`;
    });
    return `Cases by ${currentTabDef.label.toLowerCase().replace('by ', '')}: ${parts.join(', ')}`;
  }, [chartSlices, totalCases, activeKind, currentTabDef.label]);

  // Check if only one outcome has data (e.g. 535 open, 0 reviewed in overlap outcomes)
  const isSingleOutcome = activeKind === 'overlap_outcomes' && chartSlices.length === 1;
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
        </div>
      </section>

      {/* Accessible Tab Navigation */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Report Categories"
        className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-b border-slate-300"
      >
        {TABS.map((tab, idx) => {
          const isActive = activeKind === tab.kind;
          const Icon = tab.icon;
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
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs rounded-lg transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-700 font-semibold hover:text-slate-900 hover:bg-slate-200/70'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Compact Summary Line */}
      <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-blue-950 shadow-2xs">
        <div className="flex items-center gap-3 flex-wrap font-medium">
          <span>{currentTabDef.description}</span>
          <span className="text-blue-300" aria-hidden="true">·</span>
          <span>
            Scope:{' '}
            <strong className="font-bold text-blue-900 num-tabular">
              {totalCases} {activeKind === 'overlap_outcomes' ? 'pairs' : 'cases'}
            </strong>
          </span>
          {leaderAnalysis && activeKind !== 'disposal' && (
            <>
              <span className="text-blue-300" aria-hidden="true">·</span>
              <span className="font-bold text-blue-700">{leaderAnalysis}</span>
            </>
          )}
          {activeKind === 'ageing' && (
            <>
              <span className="text-blue-300" aria-hidden="true">·</span>
              <span className="text-rose-600 font-bold">Overdue SLA: 38 cases</span>
            </>
          )}
        </div>

        <div className="text-slate-500 font-medium num-tabular whitespace-nowrap text-[11px]">
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
          {/* Disposal Tab Special Highlight Cards */}
          {activeKind === 'disposal' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="cb-card p-5 bg-white border border-slate-200 shadow-xs hover:border-slate-300 transition rounded-xl">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Disposal Rate
                </span>
                <div className="text-[32px] font-bold text-slate-900 tracking-tight mt-1 num-tabular">
                  {((report.disposal_rate ?? 0) * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-slate-500 mt-1 font-medium">
                  {report.disposed ?? 0} of {report.total ?? 0} cases closed
                </div>
              </div>

              <div className="cb-card p-5 bg-white border border-slate-200 shadow-xs hover:border-slate-300 transition rounded-xl">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Disposed Cases
                </span>
                <div className="text-[32px] font-bold text-slate-900 tracking-tight mt-1 num-tabular">
                  {report.disposed ?? 0}
                </div>
                <div className="text-xs text-slate-500 mt-1 font-medium">
                  Formally closed & settled
                </div>
              </div>

              <div className="cb-card p-5 bg-white border border-slate-200 shadow-xs hover:border-slate-300 transition rounded-xl">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Open / Active Cases
                </span>
                <div className="text-[32px] font-bold text-slate-900 tracking-tight mt-1 num-tabular">
                  {(report.total ?? 0) - (report.disposed ?? 0)}
                </div>
                <div className="text-xs text-slate-500 mt-1 font-medium">
                  Pending, under process, transferred, or escalated
                </div>
              </div>

              <div className="cb-card p-5 bg-white border border-slate-200 shadow-xs hover:border-slate-300 transition rounded-xl">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total Complaints
                </span>
                <div className="text-[32px] font-bold text-slate-900 tracking-tight mt-1 num-tabular">
                  {report.total ?? 0}
                </div>
                <div className="text-xs text-slate-500 mt-1 font-medium">
                  Complete grievance volume
                </div>
              </div>
            </div>
          )}

          {/* Overlap Outcomes Progress Banner */}
          {activeKind === 'overlap_outcomes' && overlapReviewStats && (
            <div className="cb-card p-4 space-y-2.5 bg-white border border-slate-200 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                  <span>Coordination Review Progress</span>
                </span>
                <span className="font-bold text-slate-700 num-tabular">
                  {overlapReviewStats.reviewedCount} of {overlapReviewStats.totalPairs} pairs reviewed ({overlapReviewStats.reviewedPct}%)
                </span>
              </div>
              <div className="w-full bg-slate-100 border border-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, overlapReviewStats.reviewedPct))}%` }}
                />
              </div>
            </div>
          )}

          {/* Two-Column Grid: Pie Chart with Legend (Left) + Detailed Summary Table (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Pie Chart Card */}
            <div className="lg:col-span-7 cb-card p-5 min-h-[460px] flex flex-col justify-between bg-white border border-slate-200 rounded-xl shadow-xs">
              <div>
                <div className="pb-3 border-b border-slate-200 mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">
                    {activeKind === 'institution'
                      ? 'Top Institutions by Volume'
                      : `Cases by ${currentTabDef.label.toLowerCase().replace('by ', '')}`}
                  </h2>
                  <span className="text-xs text-slate-500 font-medium">
                    {chartSlices.length} active {chartSlices.length === 1 ? 'slice' : 'slices'}
                  </span>
                </div>

                {activeKind === 'institution' ? (
                  /* Original horizontal bar chart for institutions */
                  <div
                    role="img"
                    aria-label={chartAriaSummary}
                    className="w-full h-[360px] pt-1"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={institutionChartData}
                        margin={{ top: 5, right: 35, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                        <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748B', fontSize: 11 }} />
                        <YAxis
                          type="category"
                          dataKey="displayName"
                          width={180}
                          tickLine={false}
                          axisLine={{ stroke: '#E2E8F0' }}
                          tick={{ fill: '#334155', fontSize: 11, fontWeight: 500 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '8px',
                            color: '#0F172A',
                            fontSize: '12px',
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          }}
                          formatter={(val: unknown) => [`${val} cases`, 'Count']}
                        />
                        <Bar
                          dataKey="count"
                          fill="#1E3A8A"
                          radius={[0, 4, 4, 0]}
                          barSize={16}
                        >
                          <LabelList dataKey="count" position="right" fill="#475569" fontSize={11} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <>
                    {/* 300px Square Pie Chart Centered */}
                    <div
                      role="img"
                      aria-label={chartAriaSummary}
                      className="w-[300px] h-[300px] mx-auto relative flex items-center justify-center my-2"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Tooltip
                            content={
                              <CustomPieTooltip activeKind={activeKind} totalCases={totalCases} />
                            }
                          />
                          <Pie
                            data={chartSlices}
                            dataKey="count"
                            nameKey="label"
                            startAngle={90}
                            endAngle={-270}
                            cx="50%"
                            cy="50%"
                            innerRadius={isSingleOutcome ? 55 : activeKind === 'disposal' ? 50 : 0}
                            outerRadius={112}
                            labelLine={false}
                            label={renderCustomizedLabel}
                            onMouseEnter={(_, index) => {
                              const item = chartSlices[index];
                              if (item) setHoveredLabel(item.label);
                            }}
                            onMouseLeave={() => setHoveredLabel(null)}
                          >
                            {chartSlices.map((item, index) => {
                              const isHovered = hoveredLabel === item.label;
                              const drilldownUrl = getDrilldownUrl(item, activeKind);

                              return (
                                <Cell
                                  key={`slice-${index}`}
                                  fill={getSliceColor(item, index, activeKind)}
                                  stroke="#FFFFFF"
                                  strokeWidth={2}
                                  className={drilldownUrl ? 'cursor-pointer' : ''}
                                  opacity={hoveredLabel ? (isHovered ? 1 : 0.45) : 1}
                                  onClick={() => {
                                    if (drilldownUrl) navigate(drilldownUrl);
                                  }}
                                />
                              );
                            })}
                          </Pie>
                        </RechartsPieChart>
                      </ResponsiveContainer>

                      {/* Single outcome center note for overlap outcomes */}
                      {isSingleOutcome && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                          <span className="text-xs font-bold text-slate-800">0 of {totalCases}</span>
                          <span className="text-[10px] text-slate-500 font-medium">reviewed</span>
                        </div>
                      )}
                    </div>

                    {/* Note banner when only 1 outcome exists */}
                    {isSingleOutcome && (
                      <p className="text-center text-xs text-slate-500 font-medium bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 max-w-xs mx-auto mb-2">
                        0 of {totalCases} reviewed
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Pie Chart Legend with Swatches, Names, Counts, and Hover Sync */}
              {activeKind !== 'institution' && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    {legendItems.map((item, idx) => {
                      const isHovered = hoveredLabel === item.label;
                      const isZero = (item.count || 0) === 0;
                      const color = getSliceColor(item, idx, activeKind);
                      const drilldownUrl = getDrilldownUrl(item, activeKind);

                      return (
                        <button
                          key={item.label}
                          type="button"
                          disabled={!drilldownUrl}
                          onClick={() => drilldownUrl && navigate(drilldownUrl)}
                          onMouseEnter={() => setHoveredLabel(item.label)}
                          onMouseLeave={() => setHoveredLabel(null)}
                          className={`flex items-center justify-between gap-1.5 p-1.5 rounded-md text-left transition select-none ${
                            isZero
                              ? 'opacity-40 cursor-default'
                              : drilldownUrl
                              ? 'cursor-pointer hover:bg-slate-100'
                              : 'cursor-default'
                          } ${isHovered ? 'bg-blue-50 ring-1 ring-blue-300' : ''}`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: isZero ? '#CBD5E1' : color }}
                              aria-hidden="true"
                            />
                            <span className="text-slate-700 truncate font-medium text-[11px]">
                              {item.name || formatDisplayLabel(item.label, activeKind)}
                            </span>
                          </div>
                          <span className="text-slate-900 font-bold num-tabular text-[11px] shrink-0 ml-1">
                            {item.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Detailed Data Table (Right Column) */}
            <div className="lg:col-span-5 cb-card overflow-hidden min-h-[460px] flex flex-col justify-between bg-white border border-slate-200 rounded-xl shadow-xs">
              <div>
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-xs font-bold text-slate-900">
                    Tabular Breakdown
                  </h2>
                  <span className="text-xs text-slate-500 num-tabular font-medium">
                    {displayItems.length} records
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[360px]">
                  <table className="w-full text-left text-xs text-slate-900 border-collapse">
                    <caption className="sr-only">Detailed breakdown for {currentTabDef.label}</caption>
                    <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                      <tr>
                        <th scope="col" className="px-4 py-2.5">Category</th>
                        <th scope="col" className="px-3 py-2.5 text-right">Count</th>
                        <th scope="col" className="px-3 py-2.5 text-right">Share %</th>
                        <th scope="col" className="px-3 py-2.5 text-right min-w-[70px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayItems.map((item, idx) => {
                        const share = totalCases > 0 ? ((item.count || 0) / totalCases) * 100 : 0;
                        const drilldownUrl = getDrilldownUrl(item, activeKind);
                        const isHovered = hoveredLabel === item.label;

                        return (
                          <tr
                            key={idx}
                            onMouseEnter={() => setHoveredLabel(item.label)}
                            onMouseLeave={() => setHoveredLabel(null)}
                            onClick={() => {
                              if (drilldownUrl) navigate(drilldownUrl);
                            }}
                            className={`transition-colors h-10 ${
                              drilldownUrl ? 'hover:bg-slate-50 cursor-pointer' : 'opacity-70'
                            } ${isHovered ? 'bg-blue-50/70 font-semibold' : ''}`}
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
                                    className="font-medium text-blue-700 hover:underline block truncate"
                                    title={item.name || item.label}
                                  >
                                    {item.name || item.label}
                                  </Link>
                                  <span className="font-mono text-[10px] text-slate-400">
                                    {item.permanent_id}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                                    style={{
                                      backgroundColor: getSliceColor(
                                        item,
                                        idx,
                                        activeKind
                                      ),
                                    }}
                                    aria-hidden="true"
                                  />
                                  <span className="font-medium text-slate-800">
                                    {formatDisplayLabel(item.label, activeKind)}
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Count (sans with tabular-nums) */}
                            <td className="px-3 py-2 text-right font-semibold text-slate-900 num-tabular">
                              {item.count}
                            </td>

                            {/* Share Percentage */}
                            <td className="px-3 py-2 text-right text-slate-600 num-tabular">
                              {share.toFixed(1)}%
                            </td>

                            {/* Action Link (Disabled or hidden when count is 0) */}
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {drilldownUrl ? (
                                <Link
                                  to={drilldownUrl}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  <span>Filter</span>
                                </Link>
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table Footer Total */}
              <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex items-center justify-between font-bold text-xs text-slate-900">
                <span>TOTAL</span>
                <div className="flex items-center gap-6">
                  <span className="text-blue-700 num-tabular">{totalCases}</span>
                  <span className="num-tabular text-slate-600">100.0%</span>
                  <span className="w-8"></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
