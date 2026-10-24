import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInstitutions, type Institution } from '../api/client';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import {
  Search,
  Building2,
  MapPin,
  ChevronRight,
  Filter,
  X,
  RefreshCw,
} from 'lucide-react';

export const InstitutionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [submittedQuery, setSubmittedQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInstitutionsList = React.useCallback(async (queryToSearch: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInstitutions(queryToSearch, 1, 50);
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

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Institutions Directory
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Search and inspect AICTE affiliated institutions and their consolidated complaint records.
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-96">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name or permanent ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-xs transition cursor-pointer"
          >
            Search
          </button>
        </form>
      </div>

      {/* Result Meta & Quick Filter Info */}
      <div className="flex items-center justify-between py-2 border-b border-slate-200 mb-6 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span>
            {loading
              ? 'Searching records...'
              : submittedQuery
              ? `Found ${total} institution${total === 1 ? '' : 's'} matching "${submittedQuery}"`
              : `Showing ${total} registered institutions`}
          </span>
        </div>
        {submittedQuery && (
          <button
            onClick={handleClearSearch}
            className="text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
          >
            Clear filter
          </button>
        )}
      </div>

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
      {!loading && !error && institutions.length === 0 && (
        <EmptyState
          title={submittedQuery ? 'No institutions matched your query' : 'No institutions found'}
          message={
            submittedQuery
              ? `We couldn't find any institution with permanent ID or name containing "${submittedQuery}".`
              : 'There are currently no institutions registered in the database.'
          }
          action={
            submittedQuery ? (
              <button
                onClick={handleClearSearch}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Search</span>
              </button>
            ) : undefined
          }
        />
      )}

      {/* Institutions Table */}
      {!loading && !error && institutions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Permanent ID</th>
                  <th scope="col" className="px-6 py-3.5">Institution Name</th>
                  <th scope="col" className="px-6 py-3.5">Region</th>
                  <th scope="col" className="px-6 py-3.5">State / Address</th>
                  <th scope="col" className="px-6 py-3.5">Type</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {institutions.map((inst) => (
                  <tr
                    key={inst.id}
                    onClick={() => navigate(`/institutions/${inst.permanent_id}`)}
                    className="hover:bg-slate-50/70 transition cursor-pointer group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono font-bold text-xs text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                        {inst.permanent_id}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors flex-shrink-0" />
                        <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {inst.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                        {inst.region}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs max-w-xs truncate">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate">{inst.address || inst.state || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                      {inst.type || 'Standard'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                      <span className="inline-flex items-center gap-1 font-semibold text-indigo-600 group-hover:text-indigo-800">
                        <span>Profile & Cases</span>
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
};
