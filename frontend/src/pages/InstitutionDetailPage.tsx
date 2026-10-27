import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getInstitutionDetail,
  getCurrentUser,
  type InstitutionDetail,
  type UserPayload,
} from '../api/client';
import {
  StatusChip,
  ConfidenceBandBadge,
  BureauBadge,
} from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import { formatCategory, formatSignal } from '../utils/formatters';
import {
  Building2,
  MapPin,
  Briefcase,
  Layers,
  ArrowLeft,
  FolderOpen,
  ArrowRight,
  ExternalLink,
  GitCompare,
} from 'lucide-react';

export const InstitutionDetailPage: React.FC = () => {
  const { permanent_id } = useParams<{ permanent_id: string }>();
  const navigate = useNavigate();
  const [institution, setInstitution] = useState<InstitutionDetail | null>(null);
  const [, setCurrentUser] = useState<UserPayload | null>(() => getCurrentUser());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  const fetchDetail = useCallback(async () => {
    if (!permanent_id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getInstitutionDetail(permanent_id);
      setInstitution(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(`Failed to retrieve profile for institution "${permanent_id}".`);
      }
    } finally {
      setLoading(false);
    }
  }, [permanent_id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const openOverlaps = institution?.open_overlaps || [];
  const topOverlaps = openOverlaps.slice(0, 5);

  return (
    <div className="cb-page-container space-y-6">
      {/* Back button */}
      <div>
        <Link
          to="/institutions"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-700 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back to Institutions Directory</span>
        </Link>
      </div>

      {/* Loading state */}
      {loading && <LoadingState message={`Loading institution profile ${permanent_id}...`} />}

      {/* Error state */}
      {!loading && error && (
        <ErrorState
          title="Institution Not Found or Unavailable"
          message={error}
          onRetry={fetchDetail}
        />
      )}

      {/* Profile & Cases */}
      {!loading && !error && institution && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="cb-card p-6 bg-white border border-slate-200 shadow-xs rounded-xl">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200">
              <div className="flex items-start gap-3.5">
                <div
                  className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/20"
                  aria-hidden="true"
                >
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {institution.permanent_id}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                      {institution.region} Region
                    </span>
                    {institution.type && (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {institution.type}
                      </span>
                    )}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {institution.name}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto px-3.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-950 font-medium shadow-2xs">
                <Layers className="w-4 h-4 text-blue-700" aria-hidden="true" />
                <span>Total cases:</span>
                <strong className="text-blue-900 font-bold num-tabular">
                  {institution.cases?.length || 0}
                </strong>
              </div>
            </div>

            {/* Clean Key Facts Description List */}
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 text-xs">
              <div>
                <dt className="flex items-center gap-1.5 text-[var(--text-tertiary)] mb-1">
                  <MapPin className="w-3.5 h-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
                  <span>Location / Address</span>
                </dt>
                <dd className="font-medium text-[var(--text)]">
                  {institution.address || 'Address on file'}
                  {institution.state && <div className="text-[var(--text-secondary)] mt-0.5">{institution.state}</div>}
                </dd>
              </div>

              <div>
                <dt className="flex items-center gap-1.5 text-[var(--text-tertiary)] mb-1">
                  <Briefcase className="w-3.5 h-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
                  <span>Jurisdiction</span>
                </dt>
                <dd className="font-medium text-[var(--text)]">
                  {institution.region} Region Zonal Bureau
                </dd>
              </div>

              <div>
                <dt className="flex items-center gap-1.5 text-[var(--text-tertiary)] mb-1">
                  <Building2 className="w-3.5 h-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
                  <span>Program Standard</span>
                </dt>
                <dd className="font-medium text-[var(--text)]">
                  {institution.type || 'Technical / Professional'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Overlap Summary Card (Top 5 + Single Primary Button to Overlap Queue) */}
          {openOverlaps.length > 0 && (
            <div className="cb-card border-l-4 border-l-[var(--warning)] p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                    <GitCompare className="w-4 h-4 text-[var(--warning)]" aria-hidden="true" />
                    <span>Potential Cross-Bureau Overlaps ({openOverlaps.length})</span>
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Flagged candidate pairs for this institution requiring joint review
                  </p>
                </div>

                <Link
                  to="/overlaps"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] transition shadow-xs self-start sm:self-auto cursor-pointer"
                >
                  <span>View all {openOverlaps.length} in Overlap Queue</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>

              {/* Top 5 pairs list */}
              <div className="space-y-3">
                {topOverlaps.map((overlap) => (
                  <div
                    key={overlap.id}
                    className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-medium text-[var(--text-secondary)]">
                          Pair #{overlap.id}
                        </span>
                        <ConfidenceBandBadge band={overlap.band} />
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded border border-[var(--border)]">
                          <Link
                            to={`/cases/${overlap.case_a.case_no}`}
                            className="font-mono text-xs font-medium text-[var(--brand)] hover:underline flex items-center gap-1"
                          >
                            <FolderOpen className="w-3 h-3 text-[var(--brand)]" aria-hidden="true" />
                            <span>{overlap.case_a.case_no}</span>
                          </Link>
                          <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--neutral-bg)] text-[var(--neutral)]">
                            {overlap.case_a.bureau}
                          </span>
                          <StatusChip status={overlap.case_a.status} />
                        </div>

                        <span className="text-xs text-[var(--text-tertiary)] font-medium">and</span>

                        <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded border border-[var(--border)]">
                          <Link
                            to={`/cases/${overlap.case_b.case_no}`}
                            className="font-mono text-xs font-medium text-[var(--brand)] hover:underline flex items-center gap-1"
                          >
                            <FolderOpen className="w-3 h-3 text-[var(--brand)]" aria-hidden="true" />
                            <span>{overlap.case_b.case_no}</span>
                          </Link>
                          <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--neutral-bg)] text-[var(--neutral)]">
                            {overlap.case_b.bureau}
                          </span>
                          <StatusChip status={overlap.case_b.status} />
                        </div>
                      </div>

                      {overlap.reasons && overlap.reasons.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-xs text-[var(--text-secondary)]">
                          <span className="text-[var(--text-tertiary)]">Signals:</span>
                          {overlap.reasons.map((reason, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-[6px] bg-white text-[var(--neutral)] text-[11px] font-medium border border-[var(--border)]"
                            >
                              {formatSignal(reason)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <Link
                      to={`/overlaps#overlap-${overlap.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-[var(--radius-control)] text-xs font-medium text-[var(--brand)] bg-white border border-[var(--border-input)] hover:bg-[var(--brand-subtle)] transition shadow-2xs self-start lg:self-center"
                    >
                      <span>Review pair</span>
                      <ArrowRight className="w-3 h-3 text-[var(--brand)]" aria-hidden="true" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Associated Cases Section */}
          <div className="cb-card overflow-hidden">
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Registered Complaint Cases
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  All complaints associated with {institution.name}
                </p>
              </div>
              <span className="text-xs text-[var(--text-secondary)] num-tabular">
                {institution.cases?.length || 0} cases
              </span>
            </div>

            {(!institution.cases || institution.cases.length === 0) ? (
              <div className="p-5">
                <EmptyState
                  title="No cases registered"
                  message={`There are currently no recorded grievance cases for ${institution.name}.`}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-[var(--text)] border-collapse">
                  <caption className="sr-only">Cases registered for {institution.name}</caption>
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-xs">
                    <tr>
                      <th scope="col" className="px-4 py-3">Case Reference</th>
                      <th scope="col" className="px-3 py-3 text-center">Bureau</th>
                      <th scope="col" className="px-4 py-3">Category</th>
                      <th scope="col" className="px-4 py-3">Status</th>
                      <th scope="col" className="px-4 py-3">Received Date</th>
                      <th scope="col" className="px-4 py-3">Assigned Officer</th>
                      <th scope="col" className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {institution.cases.map((c) => (
                      <tr
                        key={c.case_no}
                        onClick={() => navigate(`/cases/${c.case_no}`)}
                        className="hover:bg-blue-50/50 transition-colors cursor-pointer h-12"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link
                            to={`/cases/${c.case_no}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono font-bold text-xs text-blue-700 hover:text-blue-900 hover:underline"
                          >
                            {c.case_no}
                          </Link>
                        </td>

                        <td className="px-3 py-3 whitespace-nowrap text-center">
                          <BureauBadge bureau={c.bureau} />
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700 font-medium">
                          {formatCategory(c.category)}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusChip status={c.status} />
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 font-medium num-tabular">
                          {c.received_date || '—'}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-800">
                          {c.assigned_officer || <span className="text-slate-400 italic font-normal">Unassigned</span>}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-right text-xs">
                          <Link
                            to={`/cases/${c.case_no}`}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`View details of case ${c.case_no}`}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-600 hover:text-white transition shadow-2xs"
                          >
                            <span>View</span>
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
