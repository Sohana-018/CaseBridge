import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getInstitutionDetail, type InstitutionDetail } from '../api/client';
import {
  StatusChip,
  BureauBadge,
  OverdueBadge,
  PriorityChip,
  ConfidenceBandBadge,
} from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import {
  Building2,
  MapPin,
  Calendar,
  User,
  ArrowLeft,
  ChevronRight,
  FolderOpen,
  Briefcase,
  Layers,
  AlertTriangle,
  GitCompare,
  ArrowRight,
} from 'lucide-react';

export const InstitutionDetailPage: React.FC = () => {
  const { permanent_id } = useParams<{ permanent_id: string }>();
  const [institution, setInstitution] = useState<InstitutionDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = React.useCallback(async () => {
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

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back button */}
      <div className="mb-6">
        <Link
          to="/institutions"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-blue-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Institutions Directory</span>
        </Link>
      </div>

      {/* Loading state */}
      {loading && <LoadingState message={`Loading institution ${permanent_id}...`} />}

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
          {/* Header Card with key facts in a neat grid */}
          <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-100">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono font-semibold text-xs px-2.5 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
                      {institution.permanent_id}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium border border-slate-200">
                      {institution.region} Region
                    </span>
                    {institution.type && (
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium border border-slate-200">
                        {institution.type}
                      </span>
                    )}
                  </div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                    {institution.name}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200 text-xs">
                <Layers className="w-4 h-4 text-blue-900" />
                <span className="text-slate-600">Total Cases:</span>
                <span className="font-bold text-slate-900">{institution.cases?.length || 0}</span>
              </div>
            </div>

            {/* Neat Grid of Key Facts */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5 text-xs">
              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 font-medium mb-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>LOCATION / ADDRESS</span>
                </div>
                <div className="font-semibold text-slate-800 text-sm">
                  {institution.address || 'Address on file'}
                </div>
                {institution.state && (
                  <div className="text-slate-500 mt-0.5">{institution.state}</div>
                )}
              </div>

              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 font-medium mb-1">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  <span>REGIONAL JURISDICTION</span>
                </div>
                <div className="font-semibold text-slate-800 text-sm">{institution.region} Region</div>
                <div className="text-slate-500 mt-0.5">AICTE Zonal Bureau</div>
              </div>

              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 font-medium mb-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>PROGRAM TYPE</span>
                </div>
                <div className="font-semibold text-slate-800 text-sm">{institution.type || 'Technical / Professional'}</div>
                <div className="text-slate-500 mt-0.5">ID: {institution.permanent_id}</div>
              </div>
            </div>
          </div>

          {/* Open Overlaps Section - Coordination Required (hidden if none) */}
          {institution.open_overlaps && institution.open_overlaps.length > 0 && (
            <div className="bg-white rounded-lg border border-amber-200 overflow-hidden shadow-xs">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50/40 px-6 py-4 border-b border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Potential Overlapping Cases – Coordination Required
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Cross-bureau complaint cases identified for this institution requiring joint review.
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 self-start sm:self-auto">
                  {institution.open_overlaps.length} {institution.open_overlaps.length === 1 ? 'Open Overlap' : 'Open Overlaps'}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {institution.open_overlaps.map((overlap) => (
                  <div
                    key={overlap.id}
                    className="p-5 sm:p-6 hover:bg-slate-50/60 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wide">
                          Pair #{overlap.id}
                        </span>
                        <ConfidenceBandBadge band={overlap.band} />
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        {/* Case A */}
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-md border border-slate-200">
                          <Link
                            to={`/cases/${overlap.case_a.case_no}`}
                            className="font-mono font-bold text-xs text-blue-900 hover:underline flex items-center gap-1.5"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-blue-800" />
                            <span>{overlap.case_a.case_no}</span>
                          </Link>
                          <BureauBadge bureau={overlap.case_a.bureau} />
                          <StatusChip status={overlap.case_a.status} />
                        </div>

                        <div className="flex items-center text-slate-400 font-bold text-xs">
                          <GitCompare className="w-4 h-4 mx-auto rotate-90 sm:rotate-0 text-slate-400" />
                        </div>

                        {/* Case B */}
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-md border border-slate-200">
                          <Link
                            to={`/cases/${overlap.case_b.case_no}`}
                            className="font-mono font-bold text-xs text-blue-900 hover:underline flex items-center gap-1.5"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-blue-800" />
                            <span>{overlap.case_b.case_no}</span>
                          </Link>
                          <BureauBadge bureau={overlap.case_b.bureau} />
                          <StatusChip status={overlap.case_b.status} />
                        </div>
                      </div>

                      {/* Overlap Reasons / Signals */}
                      {overlap.reasons && overlap.reasons.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-600">Signals:</span>
                          {overlap.reasons.map((reason, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] border border-slate-200"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Link to Overlap Queue entry */}
                    <div className="lg:self-center flex-shrink-0">
                      <Link
                        to={`/overlaps#overlap-${overlap.id}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold bg-blue-900 text-white hover:bg-blue-800 transition shadow-xs"
                      >
                        <span>Review in Overlap Queue</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Associated Cases Section */}
          <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Consolidated Complaint Cases
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  All active and historical cases linked to {institution.name}
                </p>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                {institution.cases?.length || 0} Records
              </span>
            </div>

            {(!institution.cases || institution.cases.length === 0) ? (
              <EmptyState
                title="No cases registered"
                message={`There are currently no recorded grievance or complaint cases for ${institution.name}.`}
              />
            ) : (
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th scope="col" className="px-4 py-3">Case Number</th>
                      <th scope="col" className="px-4 py-3">Bureau</th>
                      <th scope="col" className="px-4 py-3">Category</th>
                      <th scope="col" className="px-4 py-3">Status</th>
                      <th scope="col" className="px-4 py-3">Received Date</th>
                      <th scope="col" className="px-4 py-3">Assigned Officer</th>
                      <th scope="col" className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {institution.cases.map((c, index) => (
                      <tr
                        key={c.case_no}
                        className={`${
                          index % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'
                        } hover:bg-blue-50/40 transition-colors group`}
                      >
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <Link
                            to={`/cases/${c.case_no}`}
                            className="font-mono font-semibold text-xs text-blue-900 group-hover:underline flex items-center gap-1.5"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-900" />
                            <span>{c.case_no}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <BureauBadge bureau={c.bureau} />
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap capitalize text-xs text-slate-700 font-medium">
                          {c.category}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <StatusChip status={c.status} />
                            {c.priority && <PriorityChip priority={c.priority} />}
                            {c.overdue && <OverdueBadge />}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{c.received_date}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-600">
                          {c.assigned_officer ? (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              <span>{c.assigned_officer}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right text-xs">
                          <Link
                            to={`/cases/${c.case_no}`}
                            className="inline-flex items-center gap-1 font-semibold text-blue-900 hover:text-blue-700"
                          >
                            <span>View Case</span>
                            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
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
    </main>
  );
};
