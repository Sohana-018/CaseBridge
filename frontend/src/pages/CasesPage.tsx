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
} from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import { NewComplaintModal } from '../components/NewComplaintModal';
import {
  Search,
  Building2,
  Calendar,
  User,
  Filter,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  AlertOctagon,
  Clock,
  Plus,
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
const STATUSES = ['pending', 'under_process', 'disposed', 'transferred', 'escalated'];

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
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Cases Directory
            </h1>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
              {total} Total
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Search, filter, and track all institution grievance complaints across AICTE Bureaus.
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-80 shadow-xs"
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold bg-blue-900 text-white hover:bg-blue-800 transition shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New complaint</span>
            </button>
          )}

          {/* Quick Refresh */}
          <button
            type="button"
            id="refresh-cases-btn"
            onClick={fetchCasesList}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar (Combinable & Clearable) */}
      <section
        aria-labelledby="cases-filter-heading"
        className="bg-white rounded-lg border border-slate-200 p-4 sm:p-5 mb-6 shadow-xs"
      >
        <h2 id="cases-filter-heading" className="sr-only">
          Filter Cases
        </h2>

        {/* Search Bar Row */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by case number, institution name, or permanent ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-900 focus:border-blue-900 focus:bg-white shadow-xs transition"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search text"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-md text-sm font-semibold shadow-xs transition cursor-pointer"
          >
            Search
          </button>
        </form>

        {/* Combinable Filter Selects */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-100 text-xs">
          {/* Bureau Filter */}
          <div>
            <label htmlFor="case-filter-bureau" className="block text-slate-500 font-semibold mb-1">
              Bureau
            </label>
            <select
              id="case-filter-bureau"
              value={bureauFilter}
              onChange={(e) => updateFilter('bureau', e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 focus:ring-1 focus:ring-blue-900 focus:outline-none cursor-pointer"
            >
              <option value="">All Bureaus</option>
              {BUREAUS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Region Filter */}
          <div>
            <label htmlFor="case-filter-region" className="block text-slate-500 font-semibold mb-1">
              Region
            </label>
            <select
              id="case-filter-region"
              value={regionFilter}
              onChange={(e) => updateFilter('region', e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 focus:ring-1 focus:ring-blue-900 focus:outline-none cursor-pointer"
            >
              <option value="">All Regions</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label htmlFor="case-filter-category" className="block text-slate-500 font-semibold mb-1">
              Category
            </label>
            <select
              id="case-filter-category"
              value={categoryFilter}
              onChange={(e) => updateFilter('category', e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 focus:ring-1 focus:ring-blue-900 focus:outline-none cursor-pointer capitalize"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label htmlFor="case-filter-status" className="block text-slate-500 font-semibold mb-1">
              Status
            </label>
            <select
              id="case-filter-status"
              value={statusFilter}
              onChange={(e) => updateFilter('status', e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 focus:ring-1 focus:ring-blue-900 focus:outline-none cursor-pointer capitalize"
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Date From Filter */}
          <div>
            <label htmlFor="case-filter-date-from" className="block text-slate-500 font-semibold mb-1">
              Received From
            </label>
            <input
              type="date"
              id="case-filter-date-from"
              value={dateFromFilter}
              onChange={(e) => updateFilter('date_from', e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-2 py-1.5 text-slate-800 focus:ring-1 focus:ring-blue-900 focus:outline-none"
            />
          </div>

          {/* Date To Filter */}
          <div>
            <label htmlFor="case-filter-date-to" className="block text-slate-500 font-semibold mb-1">
              Received To
            </label>
            <input
              type="date"
              id="case-filter-date-to"
              value={dateToFilter}
              onChange={(e) => updateFilter('date_to', e.target.value || null)}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-2 py-1.5 text-slate-800 focus:ring-1 focus:ring-blue-900 focus:outline-none"
            />
          </div>
        </div>

        {/* Filter Summary & Overdue Toggle Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Overdue Toggle Button */}
            <button
              type="button"
              onClick={() => updateFilter('overdue', overdueFilter ? null : 'true')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold border transition cursor-pointer ${
                overdueFilter
                  ? 'bg-red-50 text-red-800 border-red-300 ring-1 ring-red-400'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <AlertOctagon className={`w-3.5 h-3.5 ${overdueFilter ? 'text-red-600' : 'text-slate-400'}`} />
              <span>Overdue Only</span>
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>

          {/* Result Count */}
          <div className="flex items-center gap-2 text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {loading
                ? 'Loading records...'
                : `Showing ${cases.length} of ${total} matching case${total === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold bg-blue-900 text-white hover:bg-blue-950 transition cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Clear All Filters</span>
              </button>
            ) : undefined
          }
        />
      )}

      {/* Cases Table */}
      {!loading && !error && cases.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-4 py-3">Case Number</th>
                  <th scope="col" className="px-4 py-3">Institution</th>
                  <th scope="col" className="px-4 py-3">Bureau</th>
                  <th scope="col" className="px-4 py-3">Category</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Assigned Officer</th>
                  <th scope="col" className="px-4 py-3">Received</th>
                  <th scope="col" className="px-4 py-3">Target Disposal</th>
                  <th scope="col" className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c, index) => (
                  <tr
                    key={c.case_no}
                    className={`${
                      index % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'
                    } hover:bg-blue-50/40 transition-colors group`}
                  >
                    {/* Case Number (link to /cases/:case_no) */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <Link
                        to={`/cases/${c.case_no}`}
                        className="font-mono font-semibold text-xs text-blue-900 group-hover:underline flex items-center gap-1.5"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-900" />
                        <span>{c.case_no}</span>
                      </Link>
                    </td>

                    {/* Institution Name (link to /institutions/:permanent_id) */}
                    <td className="px-4 py-3.5 max-w-xs">
                      {c.institution ? (
                        <div>
                          <Link
                            to={`/institutions/${c.institution.permanent_id}`}
                            className="font-medium text-slate-900 hover:text-blue-900 hover:underline flex items-center gap-1.5 truncate"
                          >
                            <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="truncate">{c.institution.name}</span>
                          </Link>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {c.institution.permanent_id} · {c.institution.region}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">Details restricted to the owning bureau</span>
                      )}
                    </td>

                    {/* Bureau */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <BureauBadge bureau={c.bureau} />
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3.5 whitespace-nowrap capitalize text-xs text-slate-700 font-medium">
                      {c.category?.replace('_', ' ')}
                    </td>

                    {/* Status Chip & Overdue Marker */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusChip status={c.status} />
                        {c.priority && <PriorityChip priority={c.priority} />}
                        {c.overdue && <OverdueBadge />}
                      </div>
                    </td>

                    {/* Assigned Officer */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">
                      {c.assigned_officer ? (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{c.assigned_officer}</span>
                        </div>
                      ) : !c.institution ? (
                        <span className="text-slate-400 italic text-[11px]">Details restricted to the owning bureau</span>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Received Date */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{c.received_date}</span>
                      </div>
                    </td>

                    {/* Expected Disposal Date */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                      {c.expected_disposal_date ? (
                        <div className="flex items-center gap-1">
                          <Clock className={`w-3 h-3 ${c.overdue ? 'text-red-500' : 'text-slate-400'}`} />
                          <span className={c.overdue ? 'text-red-700 font-semibold' : 'text-slate-600'}>
                            {c.expected_disposal_date}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">—</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-right text-xs">
                      <Link
                        to={`/cases/${c.case_no}`}
                        className="inline-flex items-center gap-1 font-semibold text-blue-900 hover:text-blue-700"
                      >
                        <span>View</span>
                        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="px-4 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-3">
              <span>
                Page <strong className="text-slate-900">{pageParam}</strong> of{' '}
                <strong className="text-slate-900">{totalPages}</strong>
              </span>

              {/* Page size select */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Per page:</span>
                <select
                  value={pageSizeParam}
                  onChange={(e) => updateFilter('page_size', e.target.value)}
                  className="bg-white border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:ring-1 focus:ring-blue-900 focus:outline-none cursor-pointer"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </div>
            </div>

            {/* Pagination buttons */}
            <div className="flex items-center space-x-1.5 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => updateFilter('page', (pageParam - 1).toString())}
                disabled={pageParam <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium shadow-xs transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <button
                type="button"
                onClick={() => updateFilter('page', (pageParam + 1).toString())}
                disabled={pageParam >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium shadow-xs transition"
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
