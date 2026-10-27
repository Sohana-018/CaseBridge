import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInstitutions, type Institution } from '../api/client';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import { useToast } from '../components/Toast';
import {
  Search,
  Building2,
  MapPin,
  X,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

const REGIONS = ['North', 'South', 'East', 'West', 'Central'];

export const InstitutionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [submittedQuery, setSubmittedQuery] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInstitutionsList = useCallback(async (queryToSearch: string, isRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInstitutions(queryToSearch, 1, 100);
      setInstitutions(res.items || []);
      setTotal(res.total || 0);
      if (isRefresh) {
        showToast('Institutions directory refreshed', 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch institutions';
      setError(msg);
      if (isRefresh) {
        showToast('Failed to refresh institutions', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchInstitutionsList(submittedQuery);
  }, [submittedQuery, fetchInstitutionsList]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(searchQuery.trim());
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSubmittedQuery('');
  };

  const filteredInstitutions = useMemo(() => {
    if (!selectedRegion) return institutions;
    return institutions.filter(
      (inst) => inst.region?.toLowerCase() === selectedRegion.toLowerCase()
    );
  }, [institutions, selectedRegion]);

  return (
    <div className="cb-page-container space-y-6">
      {/* Page Header Pattern */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-[28px] font-semibold text-[var(--text)] tracking-tight">
              Institutions Directory
            </h1>
            <span className="text-sm text-[var(--text-secondary)] num-tabular font-medium">
              ({total} registered)
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Search and inspect canonical institutions, permanent IDs, and consolidated cross-bureau records
          </p>
        </div>

        {/* Quick Refresh */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => fetchInstitutionsList(submittedQuery, true)}
            disabled={loading}
            aria-label="Refresh institutions directory"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[var(--border-input)] text-[var(--text)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition shadow-xs cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[var(--text-secondary)] ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section
        aria-labelledby="institutions-search-heading"
        className="cb-card p-4 space-y-3"
      >
        <h2 id="institutions-search-heading" className="sr-only">
          Search and Filter Institutions
        </h2>

        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <label htmlFor="institutions-search-input" className="sr-only">
                Search institutions by name or permanent ID
              </label>
              <Search
                className="w-4 h-4 text-[var(--text-tertiary)] absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                id="institutions-search-input"
                type="text"
                placeholder="Search by institution name or permanent ID (e.g. DEMO-1042)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-8 bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs sm:text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
              />
              {searchQuery && (
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
              className="h-10 px-4 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-[var(--radius-control)] text-xs font-semibold transition cursor-pointer shrink-0"
            >
              Search
            </button>
          </form>

          {/* Region Filter Chips (matching Cases page chip style) */}
          <div
            role="region"
            aria-label="Filter by region"
            className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 sm:pb-0"
          >
            <span className="text-xs text-[var(--text-tertiary)] font-medium mr-1 whitespace-nowrap">
              Region:
            </span>
            <button
              type="button"
              onClick={() => setSelectedRegion('')}
              className={`px-3 py-1.5 rounded-full font-medium border transition cursor-pointer whitespace-nowrap ${
                !selectedRegion
                  ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border-[#C7D7FE] font-semibold'
                  : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              All Regions
            </button>
            {REGIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRegion(selectedRegion === r ? '' : r)}
                className={`px-3 py-1.5 rounded-full font-medium border transition cursor-pointer whitespace-nowrap ${
                  selectedRegion === r
                    ? 'bg-[var(--brand-subtle)] text-[var(--brand)] border-[#C7D7FE] font-semibold'
                    : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Active Filter Summary */}
        {(submittedQuery || selectedRegion) && (
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)] flex-wrap text-xs">
            <span className="text-xs text-[var(--text-tertiary)] font-medium">Active filters:</span>
            {submittedQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] bg-[var(--neutral-bg)] text-[var(--neutral)] font-medium">
                <span>Query: "{submittedQuery}"</span>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="hover:text-[var(--danger)] cursor-pointer"
                  aria-label="Remove search query"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            )}
            {selectedRegion && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] bg-[var(--brand-subtle)] text-[var(--brand)] font-medium">
                <span>Region: {selectedRegion}</span>
                <button
                  type="button"
                  onClick={() => setSelectedRegion('')}
                  className="hover:text-[var(--danger)] cursor-pointer"
                  aria-label="Remove region filter"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                handleClearSearch();
                setSelectedRegion('');
              }}
              className="text-xs font-semibold text-[var(--brand)] hover:underline ml-auto cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        )}
      </section>

      {/* Loading state */}
      {loading && <LoadingState message="Fetching institutions from API..." />}

      {/* Error state */}
      {!loading && error && (
        <ErrorState
          title="Could not load institutions"
          message={error}
          onRetry={() => fetchInstitutionsList(submittedQuery, true)}
        />
      )}

      {/* Empty state */}
      {!loading && !error && filteredInstitutions.length === 0 && (
        <EmptyState
          title={submittedQuery || selectedRegion ? 'No institutions match your search' : 'No institutions found'}
          message={
            submittedQuery || selectedRegion
              ? `No institution matched "${submittedQuery || selectedRegion}". Try clearing your filters.`
              : 'There are currently no institutions registered in the database.'
          }
          action={
            submittedQuery || selectedRegion ? (
              <button
                type="button"
                onClick={() => {
                  handleClearSearch();
                  setSelectedRegion('');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] transition cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear Filters</span>
              </button>
            ) : undefined
          }
        />
      )}

      {/* High-Density Accessible Table */}
      {!loading && !error && filteredInstitutions.length > 0 && (
        <div className="cb-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[var(--text)] border-collapse">
              <caption className="sr-only">Canonical Institutions Directory Table</caption>
              <thead className="sticky top-0 z-10 bg-[var(--bg-subtle)] border-b border-[var(--border)] text-xs font-medium text-[var(--text-secondary)]">
                <tr>
                  <th scope="col" className="px-4 py-3">Permanent ID</th>
                  <th scope="col" className="px-4 py-3">Institution Name</th>
                  <th scope="col" className="px-4 py-3">Region</th>
                  <th scope="col" className="px-4 py-3">Location / State</th>
                  <th scope="col" className="px-4 py-3">Type</th>
                  <th scope="col" className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredInstitutions.map((inst) => (
                  <tr
                    key={inst.id}
                    onClick={() => navigate(`/institutions/${inst.permanent_id}`)}
                    className="hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer h-12"
                  >
                    {/* Permanent ID */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono font-medium text-xs text-[var(--brand)]">
                        {inst.permanent_id}
                      </span>
                    </td>

                    {/* Institution Name */}
                    <td className="px-4 py-3 max-w-sm">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg bg-[var(--brand-subtle)] text-[var(--brand)] flex items-center justify-center shrink-0 border border-[var(--border)]"
                          aria-hidden="true"
                        >
                          <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-medium text-xs sm:text-sm text-[var(--text)] truncate">
                          {inst.name}
                        </span>
                      </div>
                    </td>

                    {/* Region */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-[6px] text-xs font-medium bg-[var(--neutral-bg)] text-[var(--neutral)]">
                        {inst.region}
                      </span>
                    </td>

                    {/* Location */}
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)] max-w-xs truncate">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
                        <span className="truncate">{inst.address || inst.state || '—'}</span>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-[var(--text-secondary)]">
                      {inst.type || 'Standard'}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 whitespace-nowrap text-right text-xs">
                      <span
                        aria-label={`View profile of ${inst.name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-control)] text-xs font-medium text-[var(--brand)] bg-white border border-[var(--border-input)] hover:bg-[var(--brand-subtle)] transition shadow-2xs"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3 text-[var(--brand)]" aria-hidden="true" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          <div className="px-5 py-3.5 bg-[var(--bg-subtle)] border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>
              Showing <strong className="text-[var(--text)] font-semibold num-tabular">{filteredInstitutions.length}</strong> of{' '}
              <strong className="text-[var(--text)] font-semibold num-tabular">{total}</strong> total institutions
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
              All records indexed by canonical Permanent ID
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
