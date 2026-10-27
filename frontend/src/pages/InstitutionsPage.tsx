import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInstitutions, type Institution } from '../api/client';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import {
  Search,
  Building2,
  MapPin,
  ChevronRight,
  X,
  RefreshCw,
} from 'lucide-react';

const REGIONS = ['North', 'South', 'East', 'West', 'Central'];

export const InstitutionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [submittedQuery, setSubmittedQuery] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInstitutionsList = React.useCallback(async (queryToSearch: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInstitutions(queryToSearch, 1, 100);
      setInstitutions(res.items || []);
      setTotal(res.total || 0);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch institutions from CaseBridge API.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Filter by selected region locally for instant feedback
  const filteredInstitutions = useMemo(() => {
    if (!selectedRegion) return institutions;
    return institutions.filter(
      (inst) => inst.region?.toLowerCase() === selectedRegion.toLowerCase()
    );
  }, [institutions, selectedRegion]);

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Consistent Header matching Cases & Overview Pages */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Institutions Directory
            </h1>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-900 border border-blue-200/80 shadow-2xs">
              {total} Registered Institutions
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Search and inspect technical institutions, permanent IDs, and consolidated cross-bureau records
          </p>
        </div>

        {/* Quick Refresh Button */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={() => fetchInstitutionsList(submittedQuery)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition shadow-2xs cursor-pointer"
            title="Refresh directory records"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Directory</span>
          </button>
        </div>
      </div>

      {/* Control Room KPI Ribbon (Tax Close Reference 1 Style) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Registered Volume
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-mono">
            {total}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Institutions in system</div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Regional Bureaus
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-900 tracking-tight font-mono">
            5
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Jurisdictional zones</div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Filtered Matches
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight font-mono">
            {filteredInstitutions.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Currently listed</div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Indexing Standard
          </div>
          <div className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight mt-1 truncate">
            Permanent ID
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Single-source identifier</div>
        </div>
      </div>

      {/* Filter and Search Bar (Kalshi & VertexPoint Reference) */}
      <section
        aria-labelledby="institutions-search-heading"
        className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4"
      >
        <h2 id="institutions-search-heading" className="sr-only">
          Search Institutions
        </h2>

        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by institution name or permanent ID (e.g. DEMO-1042)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2 bg-slate-50/80 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 focus:bg-white shadow-2xs transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Clear search"
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

          {/* Region Filter Quick Pills (Kalshi Reference 2 Style) */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 sm:pb-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 whitespace-nowrap">
              Region:
            </span>
            <button
              type="button"
              onClick={() => setSelectedRegion('')}
              className={`px-3 py-1.5 rounded-full font-semibold border transition cursor-pointer whitespace-nowrap ${
                !selectedRegion
                  ? 'bg-blue-900 text-white border-blue-900 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              All Regions
            </button>
            {REGIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRegion(selectedRegion === r ? '' : r)}
                className={`px-3 py-1.5 rounded-full font-semibold border transition cursor-pointer whitespace-nowrap ${
                  selectedRegion === r
                    ? 'bg-blue-50 text-blue-900 border-blue-300 font-bold shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Active Filter Summary */}
        {(submittedQuery || selectedRegion) && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap text-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
              Active Filters:
            </span>
            {submittedQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-medium">
                <span>Query: "{submittedQuery}"</span>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedRegion && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-900 border border-blue-200 font-semibold">
                <span>Region: {selectedRegion}</span>
                <button
                  type="button"
                  onClick={() => setSelectedRegion('')}
                  className="hover:text-red-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                handleClearSearch();
                setSelectedRegion('');
              }}
              className="text-xs font-bold text-rose-600 hover:text-rose-800 ml-auto transition cursor-pointer"
            >
              Reset All
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
          onRetry={() => fetchInstitutionsList(submittedQuery)}
        />
      )}

      {/* Empty state */}
      {!loading && !error && filteredInstitutions.length === 0 && (
        <EmptyState
          title={submittedQuery || selectedRegion ? 'No institutions matched your query' : 'No institutions found'}
          message={
            submittedQuery || selectedRegion
              ? `We couldn't find any institution matching your selected search query or region filter.`
              : 'There are currently no institutions registered in the database.'
          }
          action={
            submittedQuery || selectedRegion ? (
              <button
                onClick={() => {
                  handleClearSearch();
                  setSelectedRegion('');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-blue-900 text-white hover:bg-blue-800 transition cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            ) : undefined
          }
        />
      )}

      {/* Modern High-Density Table (Reference 2 VertexPoint Style) */}
      {!loading && !error && filteredInstitutions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700 border-collapse">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Permanent ID</th>
                  <th scope="col" className="px-5 py-3.5">Institution Profile</th>
                  <th scope="col" className="px-5 py-3.5">Region</th>
                  <th scope="col" className="px-5 py-3.5">State & Location</th>
                  <th scope="col" className="px-5 py-3.5">Program / Type</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/90">
                {filteredInstitutions.map((inst) => (
                  <tr
                    key={inst.id}
                    onClick={() => navigate(`/institutions/${inst.permanent_id}`)}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                  >
                    {/* Permanent ID */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="font-mono font-bold text-xs text-blue-900 bg-blue-50/80 px-2.5 py-1 rounded-md border border-blue-200/80 shadow-2xs group-hover:border-blue-400 transition-colors">
                        {inst.permanent_id}
                      </span>
                    </td>

                    {/* Institution Name */}
                    <td className="px-5 py-3.5 max-w-sm">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center shrink-0 border border-blue-100 shadow-2xs group-hover:bg-blue-900 group-hover:text-white transition">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <div className="font-bold text-slate-900 group-hover:text-blue-900 transition-colors text-sm truncate">
                            {inst.name}
                          </div>
                          <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                            AICTE Affiliated · Approved Record
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Region */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
                        {inst.region} Region
                      </span>
                    </td>

                    {/* State & Address */}
                    <td className="px-5 py-3.5 text-slate-600 text-xs max-w-xs truncate">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{inst.address || inst.state || '—'}</span>
                      </div>
                    </td>

                    {/* Program Type */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-700">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600 font-medium">
                        {inst.type || 'Standard'}
                      </span>
                    </td>

                    {/* Action Link */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-right text-xs">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 group-hover:bg-blue-50 group-hover:text-blue-900 group-hover:border-blue-300 transition shadow-2xs">
                        <span>Profile & History</span>
                        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span>
              Showing <strong className="text-slate-900 font-semibold">{filteredInstitutions.length}</strong> of{' '}
              <strong className="text-slate-900 font-semibold">{total}</strong> total institutions
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Directory Indexed by Permanent ID
            </span>
          </div>
        </div>
      )}
    </main>
  );
};
