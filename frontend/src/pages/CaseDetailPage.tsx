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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-900 border border-blue-200">
            <CheckCircle className="w-3 h-3" />
            Created
          </span>
        );
      case 'status_change':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-300">
            <Activity className="w-3 h-3" />
            Status Change
          </span>
        );
      case 'transfer':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <ArrowRight className="w-3 h-3" />
            Transfer
          </span>
        );
      case 'escalation':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
            <AlertCircle className="w-3 h-3 text-purple-600" />
            Escalation
          </span>
        );
      case 'remark':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
            <Tag className="w-3 h-3" />
            Remark
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
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
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-blue-900 transition"
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
        <div className="space-y-6">
          {/* Header Card with key facts in a neat grid */}
          <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="font-mono font-bold text-sm px-2.5 py-1 rounded bg-blue-50 text-blue-900 border border-blue-200">
                    {caseItem.case_no}
                  </span>
                  <BureauBadge bureau={caseItem.bureau} />
                  <StatusChip status={caseItem.status} />
                  <PriorityChip priority={caseItem.priority} />
                  {caseItem.overdue && <OverdueBadge />}
                </div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Case File {caseItem.case_no}
                </h1>
              </div>

              {caseItem.overdue && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 px-3.5 py-2 rounded-md text-xs font-medium self-start sm:self-auto">
                  <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>SLA target exceeded. Operational escalation active.</span>
                </div>
              )}
            </div>

            {/* Institution Affiliation Link Card */}
            {caseItem.institution && (
              <div className="my-5 p-3.5 rounded-md bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-blue-100 text-blue-900 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Affiliated Institution
                    </span>
                    <div className="font-bold text-slate-900 text-sm">
                      {caseItem.institution.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      ID: <span className="font-mono font-semibold">{caseItem.institution.permanent_id}</span> · Region: {caseItem.institution.region}
                    </div>
                  </div>
                </div>

                <Link
                  to={`/institutions/${caseItem.institution.permanent_id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white border border-slate-300 text-blue-900 hover:bg-slate-50 transition self-start sm:self-auto shadow-xs"
                >
                  <span>Institution Profile</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

            {/* Complaint Description */}
            <div className="mb-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Grievance Summary & Description</span>
              </h2>
              <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 text-sm text-slate-800 leading-relaxed font-normal">
                {caseItem.description || 'No detailed description recorded.'}
              </div>
            </div>

            {/* Neat Key Facts Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-4 border-t border-slate-100">
              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-medium mb-1">GRIEVANCE CATEGORY</div>
                <div className="font-bold text-slate-800 text-sm capitalize">{caseItem.category}</div>
                <div className="text-slate-500 mt-0.5">Classification</div>
              </div>

              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-medium mb-1 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>ASSIGNED OFFICER</span>
                </div>
                <div className="font-bold text-slate-800 text-sm">
                  {caseItem.assigned_officer || 'Unassigned'}
                </div>
                <div className="text-slate-500 mt-0.5">Handling official</div>
              </div>

              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-medium mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>RECEIVED DATE</span>
                </div>
                <div className="font-bold text-slate-800 text-sm">{caseItem.received_date}</div>
                <div className="text-slate-500 mt-0.5">Intake date</div>
              </div>

              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-medium mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>EXPECTED DISPOSAL</span>
                </div>
                <div className={`font-bold text-sm ${caseItem.overdue ? 'text-red-700' : 'text-slate-800'}`}>
                  {caseItem.expected_disposal_date || 'Not scheduled'}
                </div>
                <div className="text-slate-500 mt-0.5">
                  {caseItem.overdue ? 'Overdue target' : 'Target SLA deadline'}
                </div>
              </div>
            </div>

            {/* Action History Row */}
            {(caseItem.next_action || caseItem.last_action) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mt-3">
                {caseItem.last_action && (
                  <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                    <div className="text-slate-500 font-medium mb-1">LAST ACTION RECORDED</div>
                    <div className="font-semibold text-slate-800">{caseItem.last_action}</div>
                    {caseItem.last_action_date && (
                      <div className="text-slate-500 mt-0.5">On {caseItem.last_action_date}</div>
                    )}
                  </div>
                )}
                {caseItem.next_action && (
                  <div className="p-3 rounded-md bg-blue-50/60 border border-blue-200">
                    <div className="text-blue-900 font-semibold mb-1">PLANNED NEXT ACTION</div>
                    <div className="font-semibold text-slate-900">{caseItem.next_action}</div>
                    <div className="text-slate-500 mt-0.5">Pending follow-up</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Timeline Section: vertical line with dots, event-type chips, actor/time in muted text */}
          <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-6">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-900 flex items-center justify-center">
                  <GitCommit className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Case Event Timeline</h2>
                  <p className="text-xs text-slate-500">
                    Chronological audit history (oldest first)
                  </p>
                </div>
              </div>

              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                {events.length} Events
              </span>
            </div>

            {events.length === 0 ? (
              <EmptyState
                title="No events logged"
                message="No chronological events have been appended to this case yet."
              />
            ) : (
              <div className="relative pl-6 border-l-2 border-slate-300 space-y-6 my-4 ml-4">
                {events.map((evt, idx) => (
                  <div key={evt.id || idx} className="relative">
                    {/* Vertical line dot */}
                    <div className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full bg-blue-900 border-2 border-white ring-2 ring-slate-300" />

                    {/* Event Entry */}
                    <div className="p-4 rounded-md bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {renderEventTypeBadge(evt.event_type)}
                          <BureauBadge bureau={evt.bureau} />
                        </div>
                        {/* Time in muted text */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatTimestamp(evt.ts)}</span>
                        </div>
                      </div>

                      {/* Actor in muted text */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-2">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-800">{evt.actor}</span>
                        <span className="text-slate-400">· {evt.bureau} Bureau</span>
                      </div>

                      {/* State transitions (if any) */}
                      {(evt.from_status || evt.to_status || evt.from_bureau || evt.to_bureau) && (
                        <div className="flex items-center gap-2 my-2 text-xs flex-wrap">
                          {evt.to_status && (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                              <span className="text-slate-500">Status:</span>
                              {evt.from_status && <span className="line-through text-slate-400">{evt.from_status}</span>}
                              <ArrowRight className="w-3 h-3 text-blue-900" />
                              <span className="font-semibold text-slate-900">{evt.to_status}</span>
                            </div>
                          )}
                          {evt.to_bureau && (
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                              <span className="text-slate-500">Bureau:</span>
                              {evt.from_bureau && <span className="line-through text-slate-400">{evt.from_bureau}</span>}
                              <ArrowRight className="w-3 h-3 text-blue-900" />
                              <span className="font-semibold text-slate-900">{evt.to_bureau}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Remarks */}
                      <div className="mt-2 text-xs sm:text-sm text-slate-700 font-normal leading-relaxed bg-white p-3 rounded border border-slate-200">
                        {evt.remarks ? (
                          <p>{evt.remarks}</p>
                        ) : (
                          <p className="text-slate-400 italic">No additional remarks recorded.</p>
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
