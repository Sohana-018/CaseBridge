import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getCases,
  getCurrentUser,
  type CaseItem,
  type CaseListResponse,
} from '../api/client';
import {
  StatusChip,
  PriorityChip,
  RestrictedBadge,
  BureauBadge,
} from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import { NewComplaintModal } from '../components/NewComplaintModal';
import { formatCategory } from '../utils/formatters';
import { useToast } from '../components/Toast';
import {
  Search,
  Calendar,
  User,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Plus,
  SlidersHorizontal,
  ArrowUpDown,
  ExternalLink,
  MapPin,
  Clock,
  ShieldAlert,
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

function calculateDaysOverdue(targetDateStr?: string | null): number | null {
  if (!targetDateStr) return null;
  try {
    const target = new Date(targetDateStr);
    const today = new Date();
    const diffTime = today.getTime() - target.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : null;
  } catch {
    return null;
  }
}

export const CasesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Read filter state from URL
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

  const [searchInput, setSearchInput] = useState<string>(searchQuery);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isNewComplaintOpen, setIsNewComplaintOpen] = useState<boolean>(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  const currentUser = getCurrentUser();
  const isReadOnly = currentUser?.role === 'senior_management' || currentUser?.role === 'administrator';

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const nextParams = new URLSearchParams(searchParams);
      if (value !== null && value !== '' && value !== undefined) {
        nextParams.set(key, value);
      } else {
        nextParams.delete(key);
      }
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

  const fetchCasesList = useCallback(async (isRefresh = false) => {
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
      if (isRefresh) {
        showToast('Cases list refreshed', 'success');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch cases from CaseBridge API.');
      }
      if (isRefresh) {
        showToast('Failed to refresh cases', 'error');
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
    showToast,
  ]);

  useEffect(() => {
    fetchCasesList();
  }, [fetchCasesList]);

  const totalPages = Math.max(1, Math.ceil(total / pageSizeParam));
  const startItem = total === 0 ? 0 : (pageParam - 1) * pageSizeParam + 1;
  const endItem = Math.min(total, pageParam * pageSizeParam);

  return (
    <div className="cb-page-container space-y-6">
      {/* Page Header */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-[28px] font-semibold text-[var(--text)] tracking-tight">
              Cases Directory
            </h1>
            <span className="text-sm text-[var(--text-secondary)] num-tabular font-medium">
              ({total} records)
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Consolidated cross-bureau complaint monitoring and tracking registry
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 shrink-0">
          {/* New Complaint Button */}
          {isReadOnly ? (
            <button
              type="button"
              disabled={true}
              title="Read-only permissions: New complaints must be registered by authorized officers or coordinators"
              aria-label="New complaint (disabled for current role)"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[var(--neutral-bg)] text-[var(--text-tertiary)] border border-[var(--border)] cursor-not-allowed shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>New complaint</span>
            </button>
          ) : (
            <button
              type="button"
              id="new-complaint-btn"
              onClick={() => setIsNewComplaintOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Register Complaint</span>
            </button>
          )}

          {/* Quick Refresh */}
          <button
            type="button"
            id="refresh-cases-btn"
            onClick={() => fetchCasesList(true)}
            disabled={loading}
            aria-label="Refresh cases records"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 disabled:opacity-50 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </section>

      {/* Quick Status Filter Tabs (Vibrant pills with clear active states) */}
      <div
        role="region"
        aria-label="Quick Status Filters"
        className="flex items-center gap-2 overflow-x-auto pb-1 text-xs"
      >
        <button
          type="button"
          onClick={() => updateFilter('status', null)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold border transition cursor-pointer whitespace-nowrap ${
            !statusFilter && !overdueFilter
              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
          }`}
        >
          <span>All Cases</span>
        </button>

        <button
          type="button"
          onClick={() => updateFilter('status', 'pending')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold border transition cursor-pointer whitespace-nowrap ${
            statusFilter === 'pending'
              ? 'bg-amber-100 text-amber-950 border-amber-400 shadow-xs'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-amber-50'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600" aria-hidden="true" />
          <span>Pending</span>
        </button>

        <button
          type="button"
          onClick={() => updateFilter('status', 'under_process')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold border transition cursor-pointer whitespace-nowrap ${
            statusFilter === 'under_process'
              ? 'bg-sky-100 text-sky-950 border-sky-400 shadow-xs'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-sky-50'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-sky-600" aria-hidden="true" />
          <span>Under Process</span>
        </button>

        <button
          type="button"
          onClick={() => updateFilter('status', 'escalated')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold border transition cursor-pointer whitespace-nowrap ${
            statusFilter === 'escalated'
              ? 'bg-purple-100 text-purple-950 border-purple-400 shadow-xs'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-purple-50'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-purple-600" aria-hidden="true" />
          <span>Escalated</span>
        </button>

        <button
          type="button"
          onClick={() => updateFilter('status', 'disposed')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold border transition cursor-pointer whitespace-nowrap ${
            statusFilter === 'disposed'
              ? 'bg-emerald-100 text-emerald-950 border-emerald-400 shadow-xs'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
          <span>Disposed</span>
        </button>

        <div className="h-4 w-px bg-slate-300 mx-1" aria-hidden="true" />

        {/* Overdue Quick Toggle */}
        <button
          type="button"
          onClick={() => updateFilter('overdue', overdueFilter ? null : 'true')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold border transition cursor-pointer whitespace-nowrap ${
            overdueFilter
              ? 'bg-rose-100 text-rose-950 border-rose-400 shadow-xs'
              : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-50'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-600" aria-hidden="true" />
          <span>Overdue SLA Only</span>
        </button>
      </div>

      {/* Filter & Search Toolbar (Single row with 40px controls) */}
      <section
        aria-labelledby="cases-filter-heading"
        className="cb-card p-4 space-y-3"
      >
        <h2 id="cases-filter-heading" className="sr-only">
          Filter Cases
        </h2>

        {/* Search bar + filter dropdowns */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input Box */}
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <label htmlFor="cases-search-input" className="sr-only">
                Search complaints
              </label>
              <Search
                className="w-4 h-4 text-[var(--text-tertiary)] absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                id="cases-search-input"
                type="text"
                placeholder="Search by case number, institution name, or permanent ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full h-10 pl-9 pr-8 bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs sm:text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text)] cursor-pointer"
                  aria-label="Clear search input"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-[var(--radius-control)] text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
            >
              Search
            </button>
          </form>

          {/* Filter Dropdowns in one row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Bureau Select */}
            <div className="relative">
              <label htmlFor="case-filter-bureau" className="sr-only">
                Filter by Bureau
              </label>
              <select
                id="case-filter-bureau"
                value={bureauFilter}
                onChange={(e) => updateFilter('bureau', e.target.value || null)}
                aria-label="Filter by Bureau"
                className={`h-10 text-xs font-medium px-3 pr-8 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-white cursor-pointer ${
                  bureauFilter ? 'font-semibold text-[var(--brand)] bg-[var(--brand-subtle)]' : 'text-[var(--text)]'
                }`}
              >
                <option value="">Bureau: All</option>
                {BUREAUS.map((b) => (
                  <option key={b} value={b}>
                    Bureau: {b}
                  </option>
                ))}
              </select>
            </div>

            {/* Region Select */}
            <div className="relative">
              <label htmlFor="case-filter-region" className="sr-only">
                Filter by Region
              </label>
              <select
                id="case-filter-region"
                value={regionFilter}
                onChange={(e) => updateFilter('region', e.target.value || null)}
                aria-label="Filter by Region"
                className={`h-10 text-xs font-medium px-3 pr-8 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-white cursor-pointer ${
                  regionFilter ? 'font-semibold text-[var(--brand)] bg-[var(--brand-subtle)]' : 'text-[var(--text)]'
                }`}
              >
                <option value="">Region: All</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    Region: {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Select */}
            <div className="relative">
              <label htmlFor="case-filter-category" className="sr-only">
                Filter by Category
              </label>
              <select
                id="case-filter-category"
                value={categoryFilter}
                onChange={(e) => updateFilter('category', e.target.value || null)}
                aria-label="Filter by Category"
                className={`h-10 text-xs font-medium px-3 pr-8 rounded-[var(--radius-control)] border border-[var(--border-input)] bg-white cursor-pointer ${
                  categoryFilter ? 'font-semibold text-[var(--brand)] bg-[var(--brand-subtle)]' : 'text-[var(--text)]'
                }`}
              >
                <option value="">Category: All</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {formatCategory(c)}
                  </option>
                ))}
              </select>
            </div>

            {/* Toggle Dates */}
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              aria-label="Toggle date range filter"
              className={`h-10 inline-flex items-center gap-1.5 px-3 rounded-[var(--radius-control)] text-xs font-medium border border-[var(--border-input)] transition cursor-pointer ${
                showAdvancedFilters || dateFromFilter || dateToFilter
                  ? 'bg-[var(--brand-subtle)] text-[var(--brand)] font-semibold'
                  : 'bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{showAdvancedFilters ? 'Hide Dates' : 'Date Range'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Date Range Sub-Bar */}
        {showAdvancedFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-[var(--border)] text-xs">
            <div>
              <label htmlFor="case-filter-date-from" className="block text-[var(--text-secondary)] font-medium mb-1">
                Received From
              </label>
              <input
                type="date"
                id="case-filter-date-from"
                value={dateFromFilter}
                onChange={(e) => updateFilter('date_from', e.target.value || null)}
                className="w-full h-10 bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] px-3 text-[var(--text)] text-xs"
              />
            </div>

            <div>
              <label htmlFor="case-filter-date-to" className="block text-[var(--text-secondary)] font-medium mb-1">
                Received To
              </label>
              <input
                type="date"
                id="case-filter-date-to"
                value={dateToFilter}
                onChange={(e) => updateFilter('date_to', e.target.value || null)}
                className="w-full h-10 bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] px-3 text-[var(--text)] text-xs"
              />
            </div>
          </div>
        )}

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)] flex-wrap text-xs">
            <span className="text-xs text-[var(--text-tertiary)] font-medium">Active filters:</span>

            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] bg-[var(--neutral-bg)] text-[var(--neutral)] font-medium">
                <span>Query: "{searchQuery}"</span>
                <button
                  type="button"
                  onClick={() => updateFilter('search', null)}
                  className="hover:text-[var(--danger)] cursor-pointer"
                  aria-label="Remove search filter"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            )}

            {bureauFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium">
                <span>Bureau: {bureauFilter}</span>
                <button
                  type="button"
                  onClick={() => updateFilter('bureau', null)}
                  className="hover:text-[var(--danger)] cursor-pointer"
                  aria-label="Remove bureau filter"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            )}

            {regionFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] bg-[var(--neutral-bg)] text-[var(--neutral)] font-medium">
                <span>Region: {regionFilter}</span>
                <button
                  type="button"
                  onClick={() => updateFilter('region', null)}
                  className="hover:text-[var(--danger)] cursor-pointer"
                  aria-label="Remove region filter"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            )}

            {categoryFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] bg-[var(--neutral-bg)] text-[var(--neutral)] font-medium">
                <span>Category: {formatCategory(categoryFilter)}</span>
                <button
                  type="button"
                  onClick={() => updateFilter('category', null)}
                  className="hover:text-[var(--danger)] cursor-pointer"
                  aria-label="Remove category filter"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            )}

            {statusFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] bg-[var(--neutral-bg)] text-[var(--neutral)] font-medium">
                <span>Status: {statusFilter.replace('_', ' ')}</span>
                <button
                  type="button"
                  onClick={() => updateFilter('status', null)}
                  className="hover:text-[var(--danger)] cursor-pointer"
                  aria-label="Remove status filter"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            )}

            {overdueFilter && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] bg-[var(--danger-bg)] text-[var(--danger)] font-medium">
                <span>Overdue SLA</span>
                <button
                  type="button"
                  onClick={() => updateFilter('overdue', null)}
                  className="hover:text-[var(--danger)] cursor-pointer"
                  aria-label="Remove overdue filter"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={handleClearAllFilters}
              className="text-xs font-semibold text-[var(--brand)] hover:underline ml-auto cursor-pointer"
            >
              Clear filters
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
          onRetry={() => fetchCasesList(true)}
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] transition cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear All Filters</span>
              </button>
            ) : undefined
          }
        />
      )}

      {/* High-Density Accessible Table */}
      {!loading && !error && cases.length > 0 && (
        <div className="cb-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[var(--text)] border-collapse">
              <caption className="sr-only">Regulatory Complaints Case Directory</caption>
              <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-xs">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    <button
                      type="button"
                      aria-label="Sort by case reference"
                      aria-sort="none"
                      className="flex items-center gap-1.5 font-bold text-slate-800 hover:text-blue-700 cursor-pointer"
                    >
                      <span>Case Reference</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3">Institution & Region</th>
                  <th scope="col" className="px-3 py-3 text-center">Bureau</th>
                  <th scope="col" className="px-4 py-3">Category</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Priority</th>
                  <th scope="col" className="px-4 py-3">Assigned Officer</th>
                  <th scope="col" className="px-4 py-3">Target SLA</th>
                  <th scope="col" className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {cases.map((c) => {
                  const initials = getInitials(c.assigned_officer);
                  const daysOverdue = c.overdue ? calculateDaysOverdue(c.expected_disposal_date) : null;
                  const avatarBg =
                    c.bureau === 'RB'
                      ? 'bg-blue-100 text-blue-900 border-blue-300'
                      : c.bureau === 'PGRC'
                      ? 'bg-teal-100 text-teal-900 border-teal-300'
                      : c.bureau === 'RO'
                      ? 'bg-amber-100 text-amber-950 border-amber-300'
                      : 'bg-purple-100 text-purple-950 border-purple-300';

                  return (
                    <tr
                      key={c.case_no}
                      onClick={() => navigate(`/cases/${c.case_no}`)}
                      className="hover:bg-blue-50/50 transition-colors cursor-pointer h-12"
                    >
                      {/* Case Number & Date Received */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link
                          to={`/cases/${c.case_no}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono font-bold text-xs text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1.5"
                        >
                          <span>{c.case_no}</span>
                        </Link>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />
                          <span>Recv: {c.received_date}</span>
                        </div>
                      </td>

                      {/* Institution Name & Permanent ID & Region */}
                      <td className="px-4 py-3 max-w-sm">
                        {c.institution ? (
                          <div>
                            <Link
                              to={`/institutions/${c.institution.permanent_id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-slate-900 hover:text-blue-700 hover:underline truncate block text-xs sm:text-sm"
                              title={c.institution.name}
                            >
                              <span className="truncate">{c.institution.name}</span>
                            </Link>
                            <div className="text-[11px] text-slate-600 flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono font-medium text-slate-500">{c.institution.permanent_id}</span>
                              <span aria-hidden="true">·</span>
                              <span className="flex items-center gap-0.5 text-slate-600">
                                <MapPin className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />
                                {c.institution.region}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <RestrictedBadge />
                        )}
                      </td>

                      {/* Bureau Badge with distinct colorful branding */}
                      <td className="px-3 py-3 whitespace-nowrap text-center">
                        <BureauBadge bureau={c.bureau} />
                      </td>

                      {/* Category (plain formatted text) */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700 font-medium">
                        {formatCategory(c.category)}
                      </td>

                      {/* Status badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusChip status={c.status} />
                      </td>

                      {/* Priority */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.priority && <PriorityChip priority={c.priority} />}
                      </td>

                      {/* Assigned Officer with Bureau-Tinted Avatar */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {c.assigned_officer ? (
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] border shrink-0 ${avatarBg}`}
                              aria-hidden="true"
                            >
                              {initials}
                            </div>
                            <span className="font-semibold text-slate-800">
                              {c.assigned_officer}
                            </span>
                          </div>
                        ) : !c.institution ? (
                          <RestrictedBadge />
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-400 italic text-xs">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                            <span>Unassigned</span>
                          </div>
                        )}
                      </td>

                      {/* Expected Disposal Date & SLA status */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {c.expected_disposal_date ? (
                          <div>
                            <div className="flex items-center gap-1">
                              <Clock className={`w-3.5 h-3.5 shrink-0 ${c.overdue ? 'text-rose-600' : 'text-slate-400'}`} aria-hidden="true" />
                              <span className="text-slate-800 font-medium num-tabular">
                                {c.expected_disposal_date}
                              </span>
                            </div>
                            {c.overdue && (
                              <div className="text-[11px] font-bold text-rose-600 mt-0.5">
                                {daysOverdue ? `${daysOverdue} days overdue` : 'Overdue target'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="px-4 py-3 whitespace-nowrap text-right text-xs">
                        <Link
                          to={`/cases/${c.case_no}`}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`View details for case ${c.case_no}`}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-600 hover:text-white transition shadow-2xs"
                        >
                          <span>View</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Accessible Pagination Footer */}
          <div className="px-5 py-3.5 bg-[var(--bg-subtle)] border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
            <div className="flex items-center gap-4 flex-wrap">
              <span>
                Showing <strong className="text-[var(--text)] font-semibold num-tabular">{startItem}</strong> to{' '}
                <strong className="text-[var(--text)] font-semibold num-tabular">{endItem}</strong> of{' '}
                <strong className="text-[var(--text)] font-semibold num-tabular">{total}</strong> total cases
              </span>

              {/* Page size select */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="cases-page-size" className="text-[var(--text-secondary)]">Per page:</label>
                <select
                  id="cases-page-size"
                  value={pageSizeParam}
                  onChange={(e) => updateFilter('page_size', e.target.value)}
                  aria-label="Select number of cases per page"
                  className="bg-white border border-[var(--border-input)] rounded-md px-2 py-1 text-[var(--text)] text-xs font-medium focus:ring-1 focus:ring-[var(--focus)] cursor-pointer"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </div>
            </div>

            {/* Pagination buttons */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="text-[var(--text-tertiary)] mr-1">
                Page <strong className="text-[var(--text)] num-tabular">{pageParam}</strong> of{' '}
                <strong className="text-[var(--text)] num-tabular">{totalPages}</strong>
              </span>

              <button
                type="button"
                onClick={() => updateFilter('page', (pageParam - 1).toString())}
                disabled={pageParam <= 1}
                aria-label="Go to previous page"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-input)] bg-white text-[var(--text)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed font-medium transition cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Prev</span>
              </button>

              <button
                type="button"
                onClick={() => updateFilter('page', (pageParam + 1).toString())}
                disabled={pageParam >= totalPages}
                aria-label="Go to next page"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-input)] bg-white text-[var(--text)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed font-medium transition cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
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
    </div>
  );
};
