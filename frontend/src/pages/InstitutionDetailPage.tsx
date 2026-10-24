import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getInstitutionDetail, type InstitutionDetail } from '../api/client';
import { StatusChip, BureauBadge, OverdueBadge, PriorityChip } from '../components/Badges';
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
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition"
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
        <div className="space-y-8">
          {/* Profile Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-100">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 shadow-xs">
                  <Building2 className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono font-bold text-xs px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {institution.permanent_id}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                      Region: {institution.region}
                    </span>
                    {institution.type && (
                      <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                        {institution.type}
                      </span>
                    )}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {institution.name}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-xs">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span className="text-slate-600 font-medium">Total Cases:</span>
                <span className="font-bold text-slate-900">{institution.cases?.length || 0}</span>
              </div>
            </div>

            {/* Profile Meta Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 font-medium mb-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>ADDRESS / LOCATION</span>
                </div>
                <div className="font-semibold text-slate-800 text-sm">
                  {institution.address || 'Address on file'}
                </div>
                {institution.state && (
                  <div className="text-slate-500 mt-0.5">{institution.state}</div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 font-medium mb-1">
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>AICTE REGION</span>
                </div>
                <div className="font-semibold text-slate-800 text-sm">{institution.region} Region</div>
                <div className="text-slate-500 mt-0.5">Jurisdiction Area</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-400 font-medium mb-1">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>INSTITUTION CATEGORY</span>
                </div>
                <div className="font-semibold text-slate-800 text-sm">{institution.type || 'Engineering & Technology'}</div>
                <div className="text-slate-500 mt-0.5">Permanent ID: {institution.permanent_id}</div>
              </div>
            </div>
          </div>

          {/* Associated Cases Section */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Consolidated Complaint Cases
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  All cases linked to {institution.name} across AICTE bureaus
                </p>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                {institution.cases?.length || 0} Cases
              </span>
            </div>

            {(!institution.cases || institution.cases.length === 0) ? (
              <EmptyState
                title="No cases registered"
                message={`There are currently no recorded grievance or complaint cases for ${institution.name}.`}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th scope="col" className="px-5 py-3">Case Number</th>
                      <th scope="col" className="px-5 py-3">Bureau</th>
                      <th scope="col" className="px-5 py-3">Category</th>
                      <th scope="col" className="px-5 py-3">Status</th>
                      <th scope="col" className="px-5 py-3">Received Date</th>
                      <th scope="col" className="px-5 py-3">Assigned Officer</th>
                      <th scope="col" className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {institution.cases.map((c) => (
                      <tr key={c.case_no} className="hover:bg-slate-50/70 transition group">
                        <td className="px-5 py-4 whitespace-nowrap">
                          <Link
                            to={`/cases/${c.case_no}`}
                            className="font-mono font-bold text-xs text-indigo-600 group-hover:text-indigo-800 hover:underline flex items-center gap-1.5"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600" />
                            <span>{c.case_no}</span>
                          </Link>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <BureauBadge bureau={c.bureau} />
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap capitalize text-xs text-slate-700">
                          {c.category}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <StatusChip status={c.status} />
                            {c.priority && <PriorityChip priority={c.priority} />}
                            {c.overdue && <OverdueBadge />}
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{c.received_date}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-600">
                          {c.assigned_officer ? (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              <span>{c.assigned_officer}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-right text-xs">
                          <Link
                            to={`/cases/${c.case_no}`}
                            className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800"
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
