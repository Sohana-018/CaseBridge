import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getInstitutions,
  getCases,
  getOverlaps,
  getInstitutionDetail,
  type Institution,
  type CaseItem,
  type OverlapItem,
  type InstitutionDetail,
} from '../api/client';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import { BureauBadge, StatusChip } from '../components/Badges';
import { useToast } from '../components/Toast';
import {
  Search,
  Building2,
  RefreshCw,
  X,
  Layers,
  GitCompare,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';

const REGIONS = ['North', 'South', 'East', 'West', 'Central'];
const TYPES = ['Engineering', 'Pharmacy', 'Management', 'Science', 'Architecture', 'Polytechnic'];

// Helper to strip repetitive "(demo)" string
function cleanInstitutionName(name?: string): string {
  if (!name) return 'Institution';
  return name.replace(/\s*\(\s*demo\s*\)/gi, '').trim();
}

function getRegionBadgeClass(region?: string): string {
  const r = (region || '').toLowerCase();
  if (r.includes('north')) return 'bg-blue-50 text-blue-800 border-blue-200';
  if (r.includes('south')) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (r.includes('east')) return 'bg-purple-50 text-purple-800 border-purple-200';
  if (r.includes('west')) return 'bg-amber-50 text-amber-900 border-amber-200';
  if (r.includes('central')) return 'bg-indigo-50 text-indigo-800 border-indigo-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function getTypeBadgeClass(type?: string): string {
  const t = (type || '').toLowerCase();
  if (t.includes('engineering')) return 'bg-blue-100 text-blue-900 border-blue-300';
  if (t.includes('pharmacy')) return 'bg-emerald-100 text-emerald-900 border-emerald-300';
  if (t.includes('management')) return 'bg-purple-100 text-purple-900 border-purple-300';
  if (t.includes('science')) return 'bg-cyan-100 text-cyan-900 border-cyan-300';
  if (t.includes('polytechnic')) return 'bg-orange-100 text-orange-900 border-orange-300';
  if (t.includes('architecture')) return 'bg-teal-100 text-teal-900 border-teal-300';
  return 'bg-slate-100 text-slate-700 border-slate-300';
}

export const InstitutionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [overlaps, setOverlaps] = useState<OverlapItem[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');

  // Loading & Error States
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Inspector Master-Detail selection
  const [selectedInst, setSelectedInst] = useState<Institution | null>(null);
  const [instDetail, setInstDetail] = useState<InstitutionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // Load all directory intelligence data
  const loadDirectoryData = useCallback(async (isRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const [instRes, casesRes1, casesRes2, overlapsRes] = await Promise.all([
        getInstitutions('', 1, 100),
        getCases({ page: 1, page_size: 100 }),
        getCases({ page: 2, page_size: 100 }),
        getOverlaps({ review_status: 'open', page_size: 100 }),
      ]);

      const allInstitutions = instRes.items || [];
      const allCases = [...(casesRes1.items || []), ...(casesRes2.items || [])];
      const allOverlaps = overlapsRes.items || [];

      setInstitutions(allInstitutions);
      setCases(allCases);
      setOverlaps(allOverlaps);

      // Default select first institution if none selected
      if (allInstitutions.length > 0 && !selectedInst) {
        setSelectedInst(allInstitutions[0]);
      }

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
  }, [showToast, selectedInst]);

  useEffect(() => {
    loadDirectoryData(false);
  }, [loadDirectoryData]);

  // Load detailed institution profile when selection changes
  useEffect(() => {
    if (!selectedInst) {
      setInstDetail(null);
      return;
    }

    let isMounted = true;
    setLoadingDetail(true);

    getInstitutionDetail(selectedInst.permanent_id)
      .then((detail) => {
        if (isMounted) setInstDetail(detail);
      })
      .catch(() => {
        // Fallback silently to in-memory case lists
      })
      .finally(() => {
        if (isMounted) setLoadingDetail(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedInst]);

  // Index cases by institution permanent_id
  const casesByPID = useMemo(() => {
    const map: Record<string, CaseItem[]> = {};
    cases.forEach((c) => {
      const pid = c.institution?.permanent_id;
      if (pid) {
        if (!map[pid]) map[pid] = [];
        map[pid].push(c);
      }
    });
    return map;
  }, [cases]);

  // Index open overlaps by permanent_id
  const overlapsByPID = useMemo(() => {
    const map: Record<string, OverlapItem[]> = {};
    overlaps.forEach((item) => {
      // Look up cases involved
      const caseA = cases.find((c) => c.case_no === item.case_a.case_no);
      const caseB = cases.find((c) => c.case_no === item.case_b.case_no);
      const pidA = caseA?.institution?.permanent_id;
      const pidB = caseB?.institution?.permanent_id;

      if (pidA) {
        if (!map[pidA]) map[pidA] = [];
        map[pidA].push(item);
      }
      if (pidB && pidB !== pidA) {
        if (!map[pidB]) map[pidB] = [];
        map[pidB].push(item);
      }
    });
    return map;
  }, [overlaps, cases]);

  // Compute 4 KPI values across all institutions
  const kpiStats = useMemo(() => {
    const totalRegistered = institutions.length;

    let activeGrievances = 0;
    let crossBureauOverlaps = 0;
    let slaWatch = 0;

    institutions.forEach((inst) => {
      const instCases = casesByPID[inst.permanent_id] || [];
      const hasActive = instCases.some((c) => c.status !== 'disposed');
      if (hasActive) activeGrievances += 1;

      const hasOverlap = (overlapsByPID[inst.permanent_id] || []).length > 0;
      if (hasOverlap) crossBureauOverlaps += 1;

      const hasSLAWatch = instCases.some(
        (c) => c.status !== 'disposed' && (c.priority?.toLowerCase() === 'high' || c.overdue)
      );
      if (hasSLAWatch) slaWatch += 1;
    });

    return {
      totalRegistered,
      activeGrievances,
      crossBureauOverlaps,
      slaWatch,
    };
  }, [institutions, casesByPID, overlapsByPID]);

  // Filter institutions dynamically by search, region, and type
  const filteredInstitutions = useMemo(() => {
    return institutions.filter((inst) => {
      if (selectedRegion && inst.region?.toLowerCase() !== selectedRegion.toLowerCase()) {
        return false;
      }
      if (selectedType && inst.type?.toLowerCase() !== selectedType.toLowerCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (inst.name || '').toLowerCase().includes(q);
        const pidMatch = (inst.permanent_id || '').toLowerCase().includes(q);
        const locMatch =
          (inst.address || '').toLowerCase().includes(q) ||
          (inst.state || '').toLowerCase().includes(q);
        if (!nameMatch && !pidMatch && !locMatch) return false;
      }
      return true;
    });
  }, [institutions, selectedRegion, selectedType, searchQuery]);

  // Cases for currently selected institution in inspector
  const selectedInstCases = useMemo(() => {
    if (!selectedInst) return [];
    return instDetail?.cases || casesByPID[selectedInst.permanent_id] || [];
  }, [selectedInst, instDetail, casesByPID]);

  // Bureau breakdown for selected institution
  const bureauBreakdown = useMemo(() => {
    const counts = { RB: 0, PGRC: 0, RO: 0, OC: 0 };
    selectedInstCases.forEach((c) => {
      const b = (c.bureau || '').toUpperCase();
      if (b in counts) {
        counts[b as keyof typeof counts] += 1;
      }
    });
    return counts;
  }, [selectedInstCases]);

  const selectedInstOverlaps = useMemo(() => {
    if (!selectedInst) return [];
    return overlapsByPID[selectedInst.permanent_id] || instDetail?.open_overlaps || [];
  }, [selectedInst, overlapsByPID, instDetail]);

  return (
    <div className="cb-page-container space-y-5">
      {/* 1. COMPACT HEADER */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Institutions Directory
            </h1>
            <span className="text-xs text-slate-500 font-semibold num-tabular">
              ({institutions.length} registered)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Consolidated master registry uniting canonical IDs, cross-bureau footprints, and active complaints
          </p>
        </div>

        {/* Refresh Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => loadDirectoryData(true)}
            disabled={loading}
            aria-label="Refresh institutions directory"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition shadow-2xs cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
        </div>
      </section>

      {/* 1. 4-COLUMN KPI STRIP (Strictly solid colors, no gradients) */}
      <section aria-labelledby="institutions-kpi-heading">
        <h2 id="institutions-kpi-heading" className="sr-only">Directory Key Indicators</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {/* 1. Total Registered */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex items-start justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Total Registered
              </span>
              <div className="text-2xl font-bold text-slate-900 tracking-tight mt-1 num-tabular">
                {kpiStats.totalRegistered}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Institutions</span>
            </div>
            <div
              className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <Building2 className="w-4 h-4" />
            </div>
          </div>

          {/* 2. Active Grievances */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex items-start justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Active Grievances
              </span>
              <div className="text-2xl font-bold text-slate-900 tracking-tight mt-1 num-tabular">
                {kpiStats.activeGrievances}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Institutions with open cases</span>
            </div>
            <div
              className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <Layers className="w-4 h-4" />
            </div>
          </div>

          {/* 3. Cross-Bureau Overlaps */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex items-start justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Cross-Bureau Overlaps
              </span>
              <div className="text-2xl font-bold text-slate-900 tracking-tight mt-1 num-tabular">
                {kpiStats.crossBureauOverlaps}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Flagged in Overlap Queue</span>
            </div>
            <div
              className="w-9 h-9 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <GitCompare className="w-4 h-4" />
            </div>
          </div>

          {/* 4. High Priority / SLA Watch */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex items-start justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                High Priority / SLA Watch
              </span>
              <div className="text-2xl font-bold text-slate-900 tracking-tight mt-1 num-tabular">
                {kpiStats.slaWatch}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Overdue or high-priority inquiries</span>
            </div>
            <div
              className="w-9 h-9 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. STREAMLINED FILTER TOOLBAR */}
      <section
        aria-labelledby="filter-toolbar-heading"
        className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-xs"
      >
        <h2 id="filter-toolbar-heading" className="sr-only">Institutions Search and Filters</h2>

        {/* Live Search Input (Dynamic onChange, no manual button) */}
        <div className="relative flex-1">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="institutions-search-input"
            type="text"
            placeholder="Search by institution name, permanent ID (DEMO-1014), or state..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-8 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              aria-label="Clear search input"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Region Pills and Stream / Type Dropdown */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Region Filter Pills */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedRegion('')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${
                !selectedRegion
                  ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              All Regions
            </button>
            {REGIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRegion(selectedRegion === r ? '' : r)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${
                  selectedRegion === r
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Stream / Type Dropdown */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-stream-type" className="font-semibold text-slate-600 text-xs whitespace-nowrap">
              Stream:
            </label>
            <select
              id="filter-stream-type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="h-8 bg-slate-50 border border-slate-300 text-slate-900 rounded-lg px-2.5 text-xs font-semibold focus:bg-white cursor-pointer"
            >
              <option value="">All Types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Loading & Error States */}
      {loading && <LoadingState message="Fetching institutions and cross-bureau intelligence..." />}

      {!loading && error && (
        <ErrorState
          title="Could not load institutions"
          message={error}
          onRetry={() => loadDirectoryData(true)}
        />
      )}

      {/* Empty State */}
      {!loading && !error && filteredInstitutions.length === 0 && (
        <EmptyState
          title="No institutions match your search"
          message="No registered institutions matched the specified search query or selected region/stream."
          action={
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedRegion('');
                setSelectedType('');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
              <span>Reset Filters</span>
            </button>
          }
        />
      )}

      {/* 3 & 4. RESTRUCTURED TABLE + RIGHT-SIDE INSPECTOR PANEL (Master-Detail Layout) */}
      {!loading && !error && filteredInstitutions.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          {/* 3. RESTRUCTURED TABLE (5 High-Density Intelligence Columns) */}
          <div className="flex-1 min-w-0 w-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-900 border-collapse">
                <caption className="sr-only">Canonical Institutions Directory Table</caption>
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th scope="col" className="px-4 py-3">Institution & Permanent ID</th>
                    <th scope="col" className="px-4 py-3">Region & Stream</th>
                    <th scope="col" className="px-4 py-3">Active Cases</th>
                    <th scope="col" className="px-4 py-3">Bureau Footprint</th>
                    <th scope="col" className="px-4 py-3 text-right">Overlap Status & Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInstitutions.map((inst) => {
                    const instCases = casesByPID[inst.permanent_id] || [];
                    const activeCount = instCases.filter((c) => c.status !== 'disposed').length;

                    // Unique bureaus with active or total cases
                    const bureaus = Array.from(new Set(instCases.map((c) => (c.bureau || '').toUpperCase())));

                    // Overlaps for this institution
                    const instOverlaps = overlapsByPID[inst.permanent_id] || [];
                    const hasOverlap = instOverlaps.length > 0;

                    const isSelected = selectedInst?.id === inst.id;

                    return (
                      <tr
                        key={inst.id}
                        onClick={() => setSelectedInst(inst)}
                        className={`transition cursor-pointer group ${
                          isSelected
                            ? 'bg-blue-50/60 border-l-4 border-l-[#1E3A8A]'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* 1. Institution & Permanent ID (Two-line cell, stripped demo text) */}
                        <td className="px-4 py-3">
                          <div className="font-bold text-sm text-slate-900 group-hover:text-blue-700 leading-snug">
                            {cleanInstitutionName(inst.name)}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-slate-500 font-normal">
                            <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                              {inst.permanent_id}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-[11px] text-slate-500 truncate max-w-[200px]">
                              {inst.address || inst.state || 'India'}
                            </span>
                          </div>
                        </td>

                        {/* 2. Region & Stream */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${getRegionBadgeClass(
                                inst.region
                              )}`}
                            >
                              {inst.region}
                            </span>
                            {inst.type && (
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${getTypeBadgeClass(
                                  inst.type
                                )}`}
                              >
                                {inst.type}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 3. Active Cases */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {activeCount > 0 ? (
                            <span className="font-bold text-xs text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full num-tabular">
                              {activeCount} Active
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">0 Cases</span>
                          )}
                        </td>

                        {/* 4. Bureau Footprint (Tags for RB, PGRC, RO, OC) */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {bureaus.length > 0 ? (
                            <div className="flex items-center gap-1">
                              {bureaus.map((b) => (
                                <span
                                  key={b}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        {/* 5. Overlap Status & Action */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {hasOverlap ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-300">
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                <span>Flagged Overlap</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                                Clear
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedInst(inst);
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-blue-700 hover:text-white hover:bg-[#1E3A8A] bg-blue-50 border border-blue-200 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>Inspect</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer Count */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {filteredInstitutions.length} of {institutions.length} institutions</span>
              <span className="text-[11px] text-slate-400">Click any row to view cross-bureau breakdown</span>
            </div>
          </div>

          {/* 4. RIGHT-SIDE INSTITUTION INSPECTOR PANEL (Master-Detail Layout) */}
          {selectedInst && (
            <aside
              aria-label="Institution Inspector Panel"
              className="w-full lg:w-[400px] shrink-0 bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between sticky top-20 space-y-4"
            >
              <div className="space-y-4">
                {/* Panel Header */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
                    <h3 className="font-bold text-sm text-slate-900 tracking-tight">
                      Institution Inspector
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedInst(null)}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                    aria-label="Close inspector panel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Institution Profile Info */}
                <div className="space-y-2">
                  <h4 className="font-bold text-base text-slate-900 leading-tight">
                    {cleanInstitutionName(selectedInst.name)}
                  </h4>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                      PID: {selectedInst.permanent_id}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded border ${getRegionBadgeClass(
                        selectedInst.region
                      )}`}
                    >
                      {selectedInst.region} Region
                    </span>
                    {selectedInst.type && (
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded border ${getTypeBadgeClass(
                          selectedInst.type
                        )}`}
                      >
                        {selectedInst.type}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500">
                    Location: {selectedInst.address || selectedInst.state || 'India'}
                  </p>
                </div>

                {/* Cross-Bureau Case Breakdown */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider text-[11px]">
                    Cross-Bureau Case Breakdown
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-center">
                      <span className="text-[10px] font-bold text-blue-700 block">RB</span>
                      <span className="text-lg font-bold text-blue-900 num-tabular">
                        {bureauBreakdown.RB}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-center">
                      <span className="text-[10px] font-bold text-teal-700 block">PGRC</span>
                      <span className="text-lg font-bold text-teal-900 num-tabular">
                        {bureauBreakdown.PGRC}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-center">
                      <span className="text-[10px] font-bold text-amber-800 block">RO</span>
                      <span className="text-lg font-bold text-amber-950 num-tabular">
                        {bureauBreakdown.RO}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-center">
                      <span className="text-[10px] font-bold text-purple-700 block">OC</span>
                      <span className="text-lg font-bold text-purple-950 num-tabular">
                        {bureauBreakdown.OC}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Overlap Alert Banner if Flagged */}
                {selectedInstOverlaps.length > 0 && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-rose-900">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{selectedInstOverlaps.length} Cross-Bureau Overlap Flag(s)</span>
                    </div>
                    <p className="text-[11px] text-rose-700 leading-snug">
                      Concurrent complaints detected across different bureaus for this college.
                    </p>
                    <Link
                      to="/overlaps"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 hover:text-rose-950 underline pt-1"
                    >
                      <span>Review in Overlap Queue</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}

                {/* Active Grievances Preview */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                      Complaints ({selectedInstCases.length})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {selectedInstCases.filter((c) => c.status !== 'disposed').length} active
                    </span>
                  </div>

                  {loadingDetail ? (
                    <div className="p-4 text-center text-xs text-slate-400">Loading cases...</div>
                  ) : selectedInstCases.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 rounded-lg">
                      No complaints registered for this institution.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {selectedInstCases.slice(0, 5).map((c) => (
                        <Link
                          key={c.case_no}
                          to={`/cases/${c.case_no}`}
                          className="p-2 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-blue-50/50 hover:border-blue-300 transition block text-xs"
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-mono font-bold text-blue-700 text-xs">
                              {c.case_no}
                            </span>
                            <div className="flex items-center gap-1">
                              <BureauBadge bureau={c.bureau} />
                              <StatusChip status={c.status} />
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-600 truncate">{c.category}</p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Action: Open Full Institution Record */}
              <div className="pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => navigate(`/institutions/${selectedInst.permanent_id}`)}
                  className="w-full py-2.5 px-4 bg-[#1E3A8A] hover:bg-[#172554] text-white font-bold text-xs rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <span>Open Full Institution Record</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
};
