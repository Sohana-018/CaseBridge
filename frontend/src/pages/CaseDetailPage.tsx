import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getCaseDetail,
  getCaseEvents,
  type CaseItem,
  type CaseEvent,
} from '../api/client';
import { StatusChip, BureauBadge, PriorityChip, OverdueBadge } from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  User,
  AlertCircle,
  FileText,
  Activity,
  ArrowRight,
  ShieldAlert,
  GitCommit,
  Tag,
  CheckCircle,
} from 'lucide-react';

export const CaseDetailPage: React.FC = () => {
  const { case_no } = useParams<{ case_no: string }>();
  const [caseItem, setCaseItem] = useState<CaseItem | null>(null);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCaseAndEvents = React.useCallback(async () => {
    if (!case_no) return;
    setLoading(true);
    setError(null);
    try {
      const [caseData, eventsData] = await Promise.all([
        getCaseDetail(case_no),
        getCaseEvents(case_no),
      ]);
      setCaseItem(caseData);
      setEvents(eventsData || []);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(`Failed to retrieve case details for ${case_no}.`);
      }
    } finally {
      setLoading(false);
    }
  }, [case_no]);

  useEffect(() => {
    fetchCaseAndEvents();
  }, [fetchCaseAndEvents]);

  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return '—';
    try {
      const dt = new Date(ts);
      return dt.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  const renderEventTypeBadge = (eventType: string) => {
    const norm = (eventType || '').toLowerCase();
    switch (norm) {
      case 'created':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle className="w-3 h-3" />
            Created
          </span>
        );
      case 'status_change':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Activity className="w-3 h-3" />
            Status Change
          </span>
        );
      case 'transfer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <ArrowRight className="w-3 h-3" />
            Transfer
          </span>
        );
      case 'escalation':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            Escalation
          </span>
        );
      case 'remark':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Tag className="w-3 h-3" />
            Remark
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {eventType}
          </span>
        );
    }
  };

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back button */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          to={caseItem?.institution?.permanent_id ? `/institutions/${caseItem.institution.permanent_id}` : '/institutions'}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>
            {caseItem?.institution?.name
              ? `Back to ${caseItem.institution.name}`
              : 'Back to Directory'}
          </span>
        </Link>
      </div>

      {/* Loading state */}
      {loading && <LoadingState message={`Fetching case ${case_no} and timeline events...`} />}

      {/* Error state */}
      {!loading && error && (
        <ErrorState
          title="Case Not Found or Error"
          message={error}
          onRetry={fetchCaseAndEvents}
        />
      )}

      {/* Case Details & Timeline */}
      {!loading && !error && caseItem && (
        <div className="space-y-8">
          {/* Top Banner: Case Header */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="font-mono font-bold text-sm px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {caseItem.case_no}
                  </span>
                  <BureauBadge bureau={caseItem.bureau} />
                  <StatusChip status={caseItem.status} />
                  <PriorityChip priority={caseItem.priority} />
                  {caseItem.overdue && <OverdueBadge />}
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Case Record {caseItem.case_no}
                </h1>
              </div>

              {caseItem.overdue && (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2.5 rounded-xl text-xs font-medium self-start sm:self-auto">
                  <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>SLA deadline exceeded. Priority follow-up required.</span>
                </div>
              )}
            </div>

            {/* Institution Card Link */}
            {caseItem.institution && (
              <div className="my-6 p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Affiliated Institution
                    </span>
                    <div className="font-bold text-slate-900 text-sm">
                      {caseItem.institution.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      Permanent ID: <span className="font-mono font-semibold">{caseItem.institution.permanent_id}</span> · Region: {caseItem.institution.region}
                    </div>
                  </div>
                </div>

                <Link
                  to={`/institutions/${caseItem.institution.permanent_id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 transition self-start sm:self-auto shadow-xs"
                >
                  <span>View Institution Profile</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

            {/* Complaint Description */}
            <div className="mb-6">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>Complaint Summary & Description</span>
              </h2>
              <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-100 text-sm text-slate-700 leading-relaxed font-normal">
                {caseItem.description || 'No detailed description provided for this case record.'}
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs pt-4 border-t border-slate-100">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-slate-400 font-medium mb-1">GRIEVANCE CATEGORY</div>
                <div className="font-bold text-slate-800 text-sm capitalize">{caseItem.category}</div>
                <div className="text-slate-500 mt-0.5">Classification type</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-slate-400 font-medium mb-1 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  <span>ASSIGNED OFFICER</span>
                </div>
                <div className="font-bold text-slate-800 text-sm">
                  {caseItem.assigned_officer || 'Unassigned'}
                </div>
                <div className="text-slate-500 mt-0.5">Handling official</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-slate-400 font-medium mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>RECEIVED DATE</span>
                </div>
                <div className="font-bold text-slate-800 text-sm">{caseItem.received_date}</div>
                <div className="text-slate-500 mt-0.5">Initial intake date</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-slate-400 font-medium mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>EXPECTED DISPOSAL</span>
                </div>
                <div className={`font-bold text-sm ${caseItem.overdue ? 'text-rose-600' : 'text-slate-800'}`}>
                  {caseItem.expected_disposal_date || 'Not scheduled'}
                </div>
                <div className="text-slate-500 mt-0.5">
                  {caseItem.overdue ? 'Overdue' : 'Target resolution SLA'}
                </div>
              </div>
            </div>

            {/* Next Action & Last Action Info */}
            {(caseItem.next_action || caseItem.last_action) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mt-4">
                {caseItem.last_action && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-slate-400 font-medium mb-1">LAST ACTION RECORDED</div>
                    <div className="font-semibold text-slate-800">{caseItem.last_action}</div>
                    {caseItem.last_action_date && (
                      <div className="text-slate-500 mt-0.5">On {caseItem.last_action_date}</div>
                    )}
                  </div>
                )}
                {caseItem.next_action && (
                  <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100">
                    <div className="text-indigo-600 font-semibold mb-1">PLANNED NEXT ACTION</div>
                    <div className="font-semibold text-indigo-950">{caseItem.next_action}</div>
                    <div className="text-indigo-500 mt-0.5">Awaiting execution</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Timeline Section (Oldest First) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <GitCommit className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Case Event Timeline</h2>
                  <p className="text-xs text-slate-500">
                    Chronological audit history (oldest first) showing who, when, event type, and remarks
                  </p>
                </div>
              </div>

              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                {events.length} Events
              </span>
            </div>

            {events.length === 0 ? (
              <EmptyState
                title="No events logged"
                message="No chronological events have been appended to this case yet."
              />
            ) : (
              <div className="relative pl-6 sm:pl-8 border-l-2 border-indigo-100 space-y-8 my-4 ml-3 sm:ml-4">
                {events.map((evt, idx) => (
                  <div key={evt.id || idx} className="relative group">
                    {/* Circle Node */}
                    <div className="absolute -left-[31px] sm:-left-[39px] top-1 w-6 h-6 rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center text-[10px] font-bold text-indigo-700 shadow-xs">
                      {idx + 1}
                    </div>

                    {/* Event Content Card */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 hover:bg-slate-50 hover:border-slate-300 transition">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {renderEventTypeBadge(evt.event_type)}
                          <BureauBadge bureau={evt.bureau} />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatTimestamp(evt.ts)}</span>
                        </div>
                      </div>

                      {/* Who (Actor) */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-2">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-800">{evt.actor}</span>
                        <span className="text-slate-400">({evt.bureau})</span>
                      </div>

                      {/* State transitions (if any) */}
                      {(evt.from_status || evt.to_status || evt.from_bureau || evt.to_bureau) && (
                        <div className="flex items-center gap-3 my-2 text-xs flex-wrap">
                          {evt.to_status && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-700">
                              <span className="text-slate-400">Status:</span>
                              {evt.from_status && <span className="line-through text-slate-400">{evt.from_status}</span>}
                              <ArrowRight className="w-3 h-3 text-indigo-500" />
                              <span className="font-bold text-indigo-700">{evt.to_status}</span>
                            </div>
                          )}
                          {evt.to_bureau && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white border border-slate-200 text-slate-700">
                              <span className="text-slate-400">Bureau:</span>
                              {evt.from_bureau && <span className="line-through text-slate-400">{evt.from_bureau}</span>}
                              <ArrowRight className="w-3 h-3 text-indigo-500" />
                              <span className="font-bold text-indigo-700">{evt.to_bureau}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Remarks */}
                      <div className="mt-2 text-xs sm:text-sm text-slate-700 font-medium leading-relaxed bg-white p-3 rounded-xl border border-slate-100">
                        {evt.remarks ? (
                          <p>{evt.remarks}</p>
                        ) : (
                          <p className="text-slate-400 italic">No additional remarks provided.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
};
