import React, { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getCases,
  getCurrentUser,
  type CaseItem,
  type CaseListResponse,
} from '../api/client';
import {
  StatusChip,
  BureauBadge,
  PriorityChip,
  OverdueBadge,
  RestrictedBadge,
} from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import { NewComplaintModal } from '../components/NewComplaintModal';
import {
  Search,
  Building2,
  Calendar,
  User,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  AlertOctagon,
  Clock,
  Plus,
  SlidersHorizontal,
  ArrowUpDown,
  ExternalLink,
  MapPin,
  CheckCircle2,
  Flame,
} from 'lucide-react';

const BUREAUS = ['RB', 'PGRC', 'RO', 'OC'];
const REGIONS = ['North', 'South', 'East', 'West', 'Central'];
const CATEGORIES = [
  'infrastructure',
  'faculty',
  'fee_refund',
  'admission',
  'approval',
  'examination',
  'other',
];

function getInitials(name?: string | null): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(name?: string | null): string {
  if (!name) return 'bg-slate-100 text-slate-500 border-slate-200';
  const colors = [
    'bg-blue-100 text-blue-800 border-blue-200',
    'bg-indigo-100 text-indigo-800 border-indigo-200',
    'bg-teal-100 text-teal-800 border-teal-200',
    'bg-purple-100 text-purple-800 border-purple-200',
    'bg-amber-100 text-amber-800 border-amber-200',
    'bg-rose-100 text-rose-800 border-rose-200',
    'bg-emerald-100 text-emerald-800 border-emerald-200',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

export const CasesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read current filter state from URL search params
  const searchQuery = searchParams.get('search') || searchParams.get('query') || '';
  const bureauFilter = searchParams.get('bureau') || '';
  const regionFilter = searchParams.get('region') || '';
  const categoryFilter = searchParams.get('category') || '';
  const statusFilter = searchParams.get('status') || '';
  const dateFromFilter = searchParams.get('date_from') || '';
  const dateToFilter = searchParams.get('date_to') || '';
  const overdueFilter = searchParams.get('overdue') === 'true';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const pageSizeParam = parseInt(searchParams.get('page_size') || '20', 10);

  // Local state for search input text before submission
  const [searchInput, setSearchInput] = useState<string>(searchQuery);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isNewComplaintOpen, setIsNewComplaintOpen] = useState<boolean>(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  const currentUser = getCurrentUser();
  const isReadOnly = currentUser?.role === 'senior_management' || currentUser?.role === 'administrator';

  // Keep search input in sync if URL changes externally
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  // Update query params helper
  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const nextParams = new URLSearchParams(searchParams);
      if (value !== null && value !== '' && value !== undefined) {
        nextParams.set(key, value);
      } else {
        nextParams.delete(key);
      }
      // Always reset page to 1 when changing a filter (unless changing page itself)
      if (key !== 'page' && key !== 'page_size') {
        nextParams.set('page', '1');
      }
      setSearchParams(nextParams);
    },
    [searchParams, setSearchParams]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter('search', searchInput.trim() || null);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    updateFilter('search', null);
  };

  const handleClearAllFilters = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters = Boolean(
    searchQuery ||
    bureauFilter ||
    regionFilter ||
    categoryFilter ||
    statusFilter ||
    dateFromFilter ||
    dateToFilter ||
    overdueFilter
  );

  // Fetch cases from API
  const fetchCasesList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: CaseListResponse = await getCases({
        search: searchQuery || undefined,
        bureau: bureauFilter || undefined,
        region: regionFilter || undefined,
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
        date_from: dateFromFilter || undefined,
        date_to: dateToFilter || undefined,
        overdue: overdueFilter ? true : undefined,
        page: pageParam,
        page_size: pageSizeParam,
      });
      setCases(res.items || []);
      setTotal(res.total || 0);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch cases from CaseBridge API.');
      }
    } finally {
      setLoading(false);
    }
  }, [
    searchQuery,
    bureauFilter,
    regionFilter,
    categoryFilter,
    statusFilter,
    dateFromFilter,
    dateToFilter,
    overdueFilter,
    pageParam,
    pageSizeParam,
  ]);

  useEffect(() => {
    fetchCasesList();
  }, [fetchCasesList]);

  const totalPages = Math.max(1, Math.ceil(total / pageSizeParam));

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner & Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Cases Directory
            </h1>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-900 border border-blue-200/80 shadow-2xs">
              {total} Total Records
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Consolidated cross-bureau complaint monitoring and tracking registry
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap self-start md:self-auto">
          {/* New Complaint Button */}
          {isReadOnly ? (
            <div className="inline-flex items-center gap-1.5" title="read-only for this role">
              <button
                type="button"
                disabled={true}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-80 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 text-slate-400" />
                <span>New complaint</span>
              </button>
              <span className="text-[11px] text-slate-400 italic">
                (read-only for this role)
              </span>
            </div>
          ) : (
            <button
              type="button"
              id="new-complaint-btn"
              onClick={() => setIsNewComplaintOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-blue-900 hover:bg-blue-800 text-white transition shadow-sm hover:shadow cursor-pointer"
            >
              <Plus className="w-4 h-4 text-blue-200" />
              <span>Register Complaint</span>
            </button>
          )}

          {/* Quick Refresh */}
          <button
            type="button"
            id="refresh-cases-btn"
            onClick={fetchCasesList}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition shadow-xs cursor-pointer"
            title="Refresh case records"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Quick Status Filter Tabs (Reference 1 & Reference 2 hybrid) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => updateFilter('status', null)}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full font-semibold border transition cursor-pointer whitespace-nowrap ${
            !statusFilter
              ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          <span>All Cases</span>
        </button>

        <button
          type="button"
          onClick={() => updateFilter('status', 'pending')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium border transition cursor-pointer whitespace-nowrap ${
            statusFilter === 'pending'
              ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50/60'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          <span>Pending</span>
        </button>

        <button
          type="button"
          onClick={() => updateFilter('status', 'under_process')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium border transition cursor-pointer whitespace-nowrap ${
            statusFilter === 'under_process'
              ? 'bg-blue-100 text-blue-900 border-blue-300 font-bold shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-blue-50/60'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
          <span>Under Process</span>
        </button>

        <button
          type="button"
          onClick={() => updateFilter('status', 'escalated')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium border transition cursor-pointer whitespace-nowrap ${
            statusFilter === 'escalated'
              ? 'bg-purple-100 text-purple-900 border-purple-300 font-bold shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-purple-50/60'
          }`}
        >
          <Flame className="w-3 h-3 text-purple-600" />
          <span>Escalated</span>
        </button>

        <button
          type="button"
          onClick={() => updateFilter('status', 'disposed')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium border transition cursor-pointer whitespace-nowrap ${
            statusFilter === 'disposed'
              ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold shadow-2xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50/60'
          }`}
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>Disposed</span>
        </button>

        <div className="h-4 w-px bg-slate-200 mx-1"></div>

        {/* Overdue Quick Toggle */}
        <button
          type="button"
          onClick={() => updateFilter('overdue', overdueFilter ? null : 'true')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium border transition cursor-pointer whitespace-nowrap ${
            overdueFilter
              ? 'bg-rose-100 text-rose-900 border-rose-300 font-bold shadow-2xs ring-2 ring-rose-400/30'
              : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
          }`}
        >
          <AlertOctagon className="w-3 h-3 text-rose-600" />
          <span>Overdue SLA Only</span>
        </button>
      </div>

      {/* Filter & Search Toolbar (Reference 2 VertexPoint Style) */}
      <section
        aria-labelledby="cases-filter-heading"
        className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4"
      >
        <h2 id="cases-filter-heading" className="sr-only">
          Filter Cases
        </h2>

        {/* Primary Row: Search Bar + Filter Pill Controls */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input Box */}
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by case number, institution name, or permanent ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-9 py-2 bg-slate-50/80 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 focus:bg-white shadow-2xs transition"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Clear search text"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
            >
              Search
            </button>
          </form>

          {/* Quick Filter Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Bureau Select Pill */}
            <div className="relative">
              <select
                id="case-filter-bureau"
                value={bureauFilter}
                onChange={(e) => updateFilter('bureau', e.target.value || null)}
                className={`text-xs font-semibold px-3 py-2 pr-7 rounded-lg border appearance-none transition cursor-pointer ${
                  bureauFilter
                    ? 'bg-blue-50 text-blue-900 border-blue-300 font-bold shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <option value="">Bureau: All</option>
                {BUREAUS.map((b) => (
                  <option key={b} value={b}>
                    Bureau: {b}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">
                ▼
              </div>
            </div>

            {/* Region Select Pill */}
            <div className="relative">
              <select
                id="case-filter-region"
                value={regionFilter}
                onChange={(e) => updateFilter('region', e.target.value || null)}
                className={`text-xs font-semibold px-3 py-2 pr-7 rounded-lg border appearance-none transition cursor-pointer ${
                  regionFilter
                    ? 'bg-blue-50 text-blue-900 border-blue-300 font-bold shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <option value="">Region: All</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    Region: {r}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">
                ▼
              </div>
            </div>

            {/* Category Select Pill */}
            <div className="relative">
              <select
                id="case-filter-category"
                value={categoryFilter}
                onChange={(e) => updateFilter('category', e.target.value || null)}
                className={`text-xs font-semibold px-3 py-2 pr-7 rounded-lg border appearance-none capitalize transition cursor-pointer ${
                  categoryFilter
                    ? 'bg-blue-50 text-blue-900 border-blue-300 font-bold shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <option value="">Category: All</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace('_', ' ')}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">
                ▼
              </div>
            </div>

            {/* Toggle Dates & More Filters */}
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                showAdvancedFilters || dateFromFilter || dateToFilter
                  ? 'bg-slate-100 text-slate-900 border-slate-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>{showAdvancedFilters ? 'Hide Dates' : 'Date Range'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Date Range Sub-Bar */}
        {showAdvancedFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
            <div>
              <label htmlFor="case-filter-date-from" className="block text-slate-500 font-semibold mb-1">
                Received From
              </label>
              <input
                type="date"
                id="case-filter-date-from"
                value={dateFromFilter}
                onChange={(e) => updateFilter('date_from', e.target.value || null)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:ring-1 focus:ring-blue-900 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="case-filter-date-to" className="block text-slate-500 font-semibold mb-1">
                Received To
              </label>
              <input
                type="date"
                id="case-filter-date-to"
                value={dateToFilter}
                onChange={(e) => updateFilter('date_to', e.target.value || null)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:ring-1 focus:ring-blue-900 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Active Filter Chips Bar (Reference 2 VertexPoint Style) */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap text-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
              Active Filters:
            </span>

            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-medium">
                <span>Query: "{searchQuery}"</span>
                <button
                  type="button"
                  onClick={() => updateFilter('search', null)}
                  className="hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {bureauFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-900 border border-blue-200 font-semibold">
                <span>Bureau: {bureauFilter}</span>
                <button
                  type="button"
                  onClick={() => updateFilter('bureau', null)}
                  className="hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {regionFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-medium">
                <span>Region: {regionFilter}</span>
                <button
                  type="button"
                  onClick={() => updateFilter('region', null)}
                  className="hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {categoryFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-medium capitalize">
                <span>Category: {categoryFilter.replace('_', ' ')}</span>
                <button
                  type="button"
                  onClick={() => updateFilter('category', null)}
                  className="hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {statusFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-medium capitalize">
                <span>Status: {statusFilter.replace('_', ' ')}</span>
                <button
                  type="button"
                  onClick={() => updateFilter('status', null)}
                  className="hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {overdueFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
                <span>Overdue SLA</span>
                <button
                  type="button"
                  onClick={() => updateFilter('overdue', null)}
                  className="hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {dateFromFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-medium">
                <span>From: {dateFromFilter}</span>
                <button
                  type="button"
                  onClick={() => updateFilter('date_from', null)}
                  className="hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {dateToFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-medium">
                <span>To: {dateToFilter}</span>
                <button
                  type="button"
                  onClick={() => updateFilter('date_to', null)}
                  className="hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={handleClearAllFilters}
              className="text-xs font-bold text-rose-600 hover:text-rose-800 ml-auto transition cursor-pointer"
            >
              Reset All
            </button>
          </div>
        )}
      </section>

      {/* Loading state */}
      {loading && <LoadingState message="Loading case records..." />}

      {/* Error state */}
      {!loading && error && (
        <ErrorState
          title="Could not load cases"
          message={error}
          onRetry={fetchCasesList}
        />
      )}

      {/* Empty state */}
      {!loading && !error && cases.length === 0 && (
        <EmptyState
          title="No cases match your filters"
          message={
            hasActiveFilters
              ? 'No complaint cases match your selected filter criteria. Try adjusting or clearing your filters.'
              : 'There are currently no cases registered in the system.'
          }
          action={
            hasActiveFilters ? (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-blue-900 text-white hover:bg-blue-800 transition cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Clear All Filters</span>
              </button>
            ) : undefined
          }
        />
      )}

      {/* High-Density Modern Enterprise Table (Reference 2 VertexPoint Style) */}
      {!loading && !error && cases.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700 border-collapse">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <span>Case Reference</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th scope="col" className="px-5 py-3.5">Institution & Region</th>
                  <th scope="col" className="px-4 py-3.5 text-center">Bureau</th>
                  <th scope="col" className="px-5 py-3.5">Category</th>
                  <th scope="col" className="px-5 py-3.5">Status & Priority</th>
                  <th scope="col" className="px-5 py-3.5">Assigned Officer</th>
                  <th scope="col" className="px-5 py-3.5">Target SLA</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/90">
                {cases.map((c) => {
                  const avatarColor = getAvatarColor(c.assigned_officer);
                  const initials = getInitials(c.assigned_officer);

                  return (
                    <tr
                      key={c.case_no}
                      className="hover:bg-blue-50/40 transition-colors group"
                    >
                      {/* Case Number & Date Received */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <Link
                          to={`/cases/${c.case_no}`}
                          className="font-mono font-bold text-xs text-blue-900 group-hover:text-blue-700 group-hover:underline flex items-center gap-1.5"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-blue-700/60 group-hover:text-blue-900 shrink-0" />
                          <span>{c.case_no}</span>
                        </Link>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>Recv: {c.received_date}</span>
                        </div>
                      </td>

                      {/* Institution Name & Permanent ID & Region */}
                      <td className="px-5 py-3.5 max-w-sm">
                        {c.institution ? (
                          <div>
                            <Link
                              to={`/institutions/${c.institution.permanent_id}`}
                              className="font-semibold text-slate-900 hover:text-blue-900 hover:underline flex items-center gap-1.5 truncate text-xs sm:text-sm"
                              title={c.institution.name}
                            >
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{c.institution.name}</span>
                            </Link>
                            <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span className="font-semibold text-slate-700">{c.institution.permanent_id}</span>
                              <span>·</span>
                              <span className="flex items-center gap-0.5 text-slate-500">
                                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                {c.institution.region}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <RestrictedBadge />
                        )}
                      </td>

                      {/* Bureau */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-center">
                        <BureauBadge bureau={c.bureau} />
                      </td>

                      {/* Category */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 border border-slate-200/80 text-slate-700 capitalize">
                          {c.category?.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Status Chip & Priority */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusChip status={c.status} />
                          {c.priority && <PriorityChip priority={c.priority} />}
                        </div>
                      </td>

                      {/* Assigned Officer with Initials Avatar (Reference 2 style) */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-xs">
                        {c.assigned_officer ? (
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] border shrink-0 ${avatarColor}`}
                            >
                              {initials}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800 leading-tight">
                                {c.assigned_officer}
                              </div>
                              <div className="text-[10px] text-slate-400 leading-tight">
                                Officer
                              </div>
                            </div>
                          </div>
                        ) : !c.institution ? (
                          <RestrictedBadge />
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400 italic text-[11px]">
                            <User className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                            <span>Unassigned</span>
                          </div>
                        )}
                      </td>

                      {/* Expected Disposal Date & SLA status */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-xs">
                        {c.expected_disposal_date ? (
                          <div>
                            <div className="flex items-center gap-1">
                              <Clock className={`w-3 h-3 shrink-0 ${c.overdue ? 'text-rose-500' : 'text-slate-400'}`} />
                              <span
                                className={`font-mono ${
                                  c.overdue ? 'text-rose-700 font-bold' : 'text-slate-700'
                                }`}
                              >
                                {c.expected_disposal_date}
                              </span>
                            </div>
                            {c.overdue && (
                              <div className="mt-1">
                                <OverdueBadge />
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right text-xs">
                        <Link
                          to={`/cases/${c.case_no}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-900 hover:border-blue-300 transition shadow-2xs group-hover:border-blue-300"
                        >
                          <span>View</span>
                          <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-900" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="px-5 py-4 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-4 flex-wrap">
              <span>
                Showing <strong className="text-slate-900 font-semibold">{cases.length}</strong> of{' '}
                <strong className="text-slate-900 font-semibold">{total}</strong> total cases
              </span>

              {/* Page size select */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Per page:</span>
                <select
                  value={pageSizeParam}
                  onChange={(e) => updateFilter('page_size', e.target.value)}
                  className="bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-800 text-xs font-semibold focus:ring-1 focus:ring-blue-900 focus:outline-none cursor-pointer shadow-2xs"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </div>
            </div>

            {/* Pagination buttons */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="text-slate-500 mr-1">
                Page <strong className="text-slate-900">{pageParam}</strong> of{' '}
                <strong className="text-slate-900">{totalPages}</strong>
              </span>

              <button
                type="button"
                onClick={() => updateFilter('page', (pageParam - 1).toString())}
                disabled={pageParam <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold shadow-2xs transition cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <button
                type="button"
                onClick={() => updateFilter('page', (pageParam + 1).toString())}
                disabled={pageParam >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold shadow-2xs transition cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Complaint Modal */}
      <NewComplaintModal
        isOpen={isNewComplaintOpen}
        onClose={() => setIsNewComplaintOpen(false)}
        onSuccess={() => {
          fetchCasesList();
        }}
      />
    </main>
  );
};
