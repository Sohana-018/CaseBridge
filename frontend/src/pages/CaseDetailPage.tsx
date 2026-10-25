import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getCaseDetail,
  getCaseEvents,
  postCaseEvent,
  patchCase,
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
  CheckCircle2,
  ArrowRightLeft,
  Flame,
  MessageSquare,
  Edit3,
  X,
  AlertTriangle,
  Lock,
} from 'lucide-react';

const ALL_STATUSES = ['pending', 'under_process', 'disposed', 'transferred', 'escalated'];
const ALL_BUREAUS = ['RB', 'PGRC', 'RO', 'OC'];
const PRIORITIES: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

export const CaseDetailPage: React.FC = () => {
  const { case_no } = useParams<{ case_no: string }>();
  const [caseItem, setCaseItem] = useState<CaseItem | null>(null);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Actions dialog states
  const [activeDialog, setActiveDialog] = useState<
    'status' | 'transfer' | 'escalate' | 'remark' | 'edit_details' | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form field states
  const [newStatus, setNewStatus] = useState<string>('');
  const [statusRemarks, setStatusRemarks] = useState<string>('');

  const [newBureau, setNewBureau] = useState<string>('');
  const [transferRemarks, setTransferRemarks] = useState<string>('');

  const [escalateRemarks, setEscalateRemarks] = useState<string>('');

  const [remarkText, setRemarkText] = useState<string>('');

  const [patchNextAction, setPatchNextAction] = useState<string>('');
  const [patchExpectedDate, setPatchExpectedDate] = useState<string>('');
  const [patchOfficer, setPatchOfficer] = useState<string>('');
  const [patchPriority, setPatchPriority] = useState<'low' | 'medium' | 'high'>('medium');

  const fetchCaseAndEvents = useCallback(async () => {
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

  // Open dialog and pre-populate defaults based on current case state
  const openDialog = (type: 'status' | 'transfer' | 'escalate' | 'remark' | 'edit_details') => {
    setDialogError(null);
    if (!caseItem) return;

    if (type === 'status') {
      const available = ALL_STATUSES.filter((s) => s !== caseItem.status);
      setNewStatus(available[0] || 'under_process');
      setStatusRemarks('');
    } else if (type === 'transfer') {
      const available = ALL_BUREAUS.filter((b) => b !== caseItem.bureau);
      setNewBureau(available[0] || 'RB');
      setTransferRemarks('');
    } else if (type === 'escalate') {
      setEscalateRemarks('');
    } else if (type === 'remark') {
      setRemarkText('');
    } else if (type === 'edit_details') {
      setPatchNextAction(caseItem.next_action || '');
      setPatchExpectedDate(caseItem.expected_disposal_date || '');
      setPatchOfficer(caseItem.assigned_officer || '');
      const currentPri = (caseItem.priority?.toLowerCase() as 'low' | 'medium' | 'high') || 'medium';
      setPatchPriority(PRIORITIES.includes(currentPri) ? currentPri : 'medium');
    }

    setActiveDialog(type);
  };

  // Close dialog handler
  const closeDialog = () => {
    if (isSubmitting) return;
    setActiveDialog(null);
    setDialogError(null);
  };

  // 1. Submit Status Change
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!case_no || !newStatus) return;
    setIsSubmitting(true);
    setDialogError(null);
    try {
      await postCaseEvent(case_no, {
        event_type: 'status_change',
        to_status: newStatus,
        remarks: statusRemarks.trim() || undefined,
      });
      setActiveDialog(null);
      setActionSuccess(`Case status updated to ${newStatus.replace('_', ' ')}.`);
      await fetchCaseAndEvents();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Failed to change status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Submit Bureau Transfer
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!case_no || !newBureau) return;
    setIsSubmitting(true);
    setDialogError(null);
    try {
      await postCaseEvent(case_no, {
        event_type: 'transfer',
        to_bureau: newBureau,
        remarks: transferRemarks.trim() || undefined,
      });
      setActiveDialog(null);
      setActionSuccess(`Case successfully transferred to ${newBureau} Bureau.`);
      await fetchCaseAndEvents();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Failed to transfer case.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Submit Escalation
  const handleEscalateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!case_no) return;
    if (!escalateRemarks.trim()) {
      setDialogError('Escalation reason is required.');
      return;
    }
    setIsSubmitting(true);
    setDialogError(null);
    try {
      await postCaseEvent(case_no, {
        event_type: 'escalation',
        remarks: escalateRemarks.trim(),
      });
      setActiveDialog(null);
      setActionSuccess('Case escalated and priority coordination alert triggered.');
      await fetchCaseAndEvents();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Failed to escalate case.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Submit Remark
  const handleRemarkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!case_no) return;
    if (!remarkText.trim()) {
      setDialogError('Remark text is required.');
      return;
    }
    setIsSubmitting(true);
    setDialogError(null);
    try {
      await postCaseEvent(case_no, {
        event_type: 'remark',
        remarks: remarkText.trim(),
      });
      setActiveDialog(null);
      setActionSuccess('Official remark added to case timeline.');
      await fetchCaseAndEvents();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Failed to append remark.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Submit Edit Details
  const handleEditDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!case_no) return;
    setIsSubmitting(true);
    setDialogError(null);
    try {
      await patchCase(case_no, {
        next_action: patchNextAction.trim() || null,
        expected_disposal_date: patchExpectedDate || null,
        assigned_officer: patchOfficer.trim() || null,
        priority: patchPriority || 'medium',
      });
      setActiveDialog(null);
      setActionSuccess('Case schedule and assignment details updated.');
      await fetchCaseAndEvents();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Failed to update case details.');
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const isDisposed = caseItem?.status === 'disposed';

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back button */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          to={caseItem?.institution?.permanent_id ? `/institutions/${caseItem.institution.permanent_id}` : '/cases'}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-blue-900 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>
            {caseItem?.institution?.name
              ? `Back to ${caseItem.institution.name}`
              : 'Back to Cases'}
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

          {/* Actions Panel */}
          <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-900" />
                  <span>Case Actions & Operations</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Execute workflow operations, cross-bureau transfers, priority escalations, or edit case attributes.
                </p>
              </div>

              {isDisposed && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold self-start sm:self-auto">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Disposed Case · Only Remarks Allowed</span>
                </div>
              )}
            </div>

            {/* Action Success Alert Banner */}
            {actionSuccess && (
              <div
                role="status"
                className="mb-5 p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-3 shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{actionSuccess}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActionSuccess(null)}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Action Buttons Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* 1. Change Status */}
              <button
                type="button"
                onClick={() => openDialog('status')}
                disabled={isDisposed}
                title={isDisposed ? 'Disposed cases cannot change status.' : 'Change case workflow status'}
                className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-md text-xs font-semibold border transition shadow-xs ${
                  isDisposed
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                    : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-blue-900 hover:text-blue-900 cursor-pointer'
                }`}
              >
                <Activity className="w-4 h-4 text-blue-700" />
                <span>Change Status</span>
              </button>

              {/* 2. Transfer */}
              <button
                type="button"
                onClick={() => openDialog('transfer')}
                disabled={isDisposed}
                title={isDisposed ? 'Disposed cases cannot be transferred.' : 'Transfer to another Bureau'}
                className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-md text-xs font-semibold border transition shadow-xs ${
                  isDisposed
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                    : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-blue-900 hover:text-blue-900 cursor-pointer'
                }`}
              >
                <ArrowRightLeft className="w-4 h-4 text-teal-700" />
                <span>Transfer Bureau</span>
              </button>

              {/* 3. Escalate */}
              <button
                type="button"
                onClick={() => openDialog('escalate')}
                disabled={isDisposed}
                title={isDisposed ? 'Disposed cases cannot be escalated.' : 'Escalate case to senior management'}
                className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-md text-xs font-semibold border transition shadow-xs ${
                  isDisposed
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                    : 'bg-white border-slate-300 text-purple-900 hover:bg-purple-50 hover:border-purple-600 cursor-pointer'
                }`}
              >
                <Flame className="w-4 h-4 text-purple-600" />
                <span>Escalate</span>
              </button>

              {/* 4. Add Remark */}
              <button
                type="button"
                onClick={() => openDialog('remark')}
                title="Append an official note or remark to timeline"
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-md text-xs font-semibold bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-blue-900 hover:text-blue-900 transition shadow-xs cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 text-slate-600" />
                <span>Add Remark</span>
              </button>

              {/* 5. Edit Details */}
              <button
                type="button"
                onClick={() => openDialog('edit_details')}
                disabled={isDisposed}
                title={isDisposed ? 'Disposed cases cannot be modified.' : 'Directly patch schedule, officer, and priority'}
                className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-md text-xs font-semibold border transition shadow-xs ${
                  isDisposed
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                    : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-blue-900 hover:text-blue-900 cursor-pointer'
                }`}
              >
                <Edit3 className="w-4 h-4 text-amber-700" />
                <span>Edit Details</span>
              </button>
            </div>
          </div>

          {/* Timeline Section */}
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

      {/* ========================================================================= */}
      {/* ACTION DIALOGS MODAL */}
      {/* ========================================================================= */}
      {activeDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) closeDialog();
          }}
        >
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                {activeDialog === 'status' && <Activity className="w-4 h-4 text-blue-700" />}
                {activeDialog === 'transfer' && <ArrowRightLeft className="w-4 h-4 text-teal-700" />}
                {activeDialog === 'escalate' && <Flame className="w-4 h-4 text-purple-600" />}
                {activeDialog === 'remark' && <MessageSquare className="w-4 h-4 text-slate-700" />}
                {activeDialog === 'edit_details' && <Edit3 className="w-4 h-4 text-amber-700" />}

                <span>
                  {activeDialog === 'status' && 'Change Case Status'}
                  {activeDialog === 'transfer' && 'Transfer to Another Bureau'}
                  {activeDialog === 'escalate' && 'Escalate Case'}
                  {activeDialog === 'remark' && 'Add Official Remark'}
                  {activeDialog === 'edit_details' && 'Edit Case Details'}
                </span>
              </h3>

              <button
                type="button"
                onClick={closeDialog}
                disabled={isSubmitting}
                className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition disabled:opacity-50 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* In-Dialog Error Notice from Shared Error Format */}
            {dialogError && (
              <div className="mx-5 mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{dialogError}</div>
              </div>
            )}

            {/* Modal Body / Form */}
            {/* 1. Change Status Form */}
            {activeDialog === 'status' && (
              <form onSubmit={handleStatusSubmit} className="p-5 space-y-4">
                <div className="text-xs text-slate-600">
                  Current status:{' '}
                  <span className="font-semibold capitalize text-slate-900">
                    {caseItem?.status?.replace('_', ' ')}
                  </span>
                </div>

                <div>
                  <label htmlFor="select-new-status" className="block text-xs font-semibold text-slate-700 mb-1">
                    New Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="select-new-status"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
                  >
                    {ALL_STATUSES.filter((s) => s !== caseItem?.status).map((s) => (
                      <option key={s} value={s}>
                        {s.replace('_', ' ').toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="status-remarks" className="block text-xs font-semibold text-slate-700 mb-1">
                    Notes / Remarks
                  </label>
                  <textarea
                    id="status-remarks"
                    rows={3}
                    value={statusRemarks}
                    onChange={(e) => setStatusRemarks(e.target.value)}
                    placeholder="Provide context or explanation for this status transition..."
                    disabled={isSubmitting}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newStatus}
                    className="px-4 py-1.5 rounded-md text-xs font-semibold bg-blue-900 text-white hover:bg-blue-800 transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Updating Status...' : 'Confirm Status Change'}
                  </button>
                </div>
              </form>
            )}

            {/* 2. Transfer Bureau Form */}
            {activeDialog === 'transfer' && (
              <form onSubmit={handleTransferSubmit} className="p-5 space-y-4">
                <div className="text-xs text-slate-600">
                  Current handling bureau:{' '}
                  <span className="font-semibold font-mono text-slate-900">{caseItem?.bureau}</span>
                </div>

                <div>
                  <label htmlFor="select-new-bureau" className="block text-xs font-semibold text-slate-700 mb-1">
                    Transfer To Bureau <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="select-new-bureau"
                    value={newBureau}
                    onChange={(e) => setNewBureau(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900 font-mono"
                  >
                    {ALL_BUREAUS.filter((b) => b !== caseItem?.bureau).map((b) => (
                      <option key={b} value={b}>
                        {b} Bureau
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Per PRD rules, a case cannot be transferred to the same bureau.
                  </p>
                </div>

                <div>
                  <label htmlFor="transfer-remarks" className="block text-xs font-semibold text-slate-700 mb-1">
                    Transfer Instructions / Notes
                  </label>
                  <textarea
                    id="transfer-remarks"
                    rows={3}
                    value={transferRemarks}
                    onChange={(e) => setTransferRemarks(e.target.value)}
                    placeholder="Specify transfer rationale and handover instructions..."
                    disabled={isSubmitting}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newBureau}
                    className="px-4 py-1.5 rounded-md text-xs font-semibold bg-teal-800 text-white hover:bg-teal-700 transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Transferring...' : 'Confirm Bureau Transfer'}
                  </button>
                </div>
              </form>
            )}

            {/* 3. Escalate Form */}
            {activeDialog === 'escalate' && (
              <form onSubmit={handleEscalateSubmit} className="p-5 space-y-4">
                <div className="p-3 rounded-md bg-purple-50 border border-purple-200 text-purple-900 text-xs">
                  <span className="font-bold">Operational Escalation: </span>
                  Escalating updates this case status to <em>Escalated</em> and triggers an in-app priority alert for coordinating officials.
                </div>

                <div>
                  <label htmlFor="escalate-remarks" className="block text-xs font-semibold text-slate-700 mb-1">
                    Escalation Reason <span className="text-red-500">* (Required)</span>
                  </label>
                  <textarea
                    id="escalate-remarks"
                    rows={3}
                    value={escalateRemarks}
                    onChange={(e) => setEscalateRemarks(e.target.value)}
                    placeholder="Provide explicit reasons for escalation (e.g. repeated complaints, non-responsiveness, serious violation)..."
                    required
                    disabled={isSubmitting}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-900"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !escalateRemarks.trim()}
                    className="px-4 py-1.5 rounded-md text-xs font-semibold bg-purple-800 text-white hover:bg-purple-700 transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Escalating...' : 'Confirm Escalation'}
                  </button>
                </div>
              </form>
            )}

            {/* 4. Add Remark Form */}
            {activeDialog === 'remark' && (
              <form onSubmit={handleRemarkSubmit} className="p-5 space-y-4">
                <div>
                  <label htmlFor="remark-text" className="block text-xs font-semibold text-slate-700 mb-1">
                    Remark Text <span className="text-red-500">* (Required)</span>
                  </label>
                  <textarea
                    id="remark-text"
                    rows={4}
                    value={remarkText}
                    onChange={(e) => setRemarkText(e.target.value)}
                    placeholder="Enter official remark, note of phone conversation, or audit observation..."
                    required
                    disabled={isSubmitting}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !remarkText.trim()}
                    className="px-4 py-1.5 rounded-md text-xs font-semibold bg-blue-900 text-white hover:bg-blue-800 transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Appending...' : 'Append Remark'}
                  </button>
                </div>
              </form>
            )}

            {/* 5. Edit Details Form */}
            {activeDialog === 'edit_details' && (
              <form onSubmit={handleEditDetailsSubmit} className="p-5 space-y-3.5">
                <div>
                  <label htmlFor="patch-next-action" className="block text-xs font-semibold text-slate-700 mb-1">
                    Planned Next Action
                  </label>
                  <input
                    id="patch-next-action"
                    type="text"
                    value={patchNextAction}
                    onChange={(e) => setPatchNextAction(e.target.value)}
                    placeholder="e.g. Await institution reply, Schedule hearing..."
                    disabled={isSubmitting}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div>
                  <label htmlFor="patch-expected-date" className="block text-xs font-semibold text-slate-700 mb-1">
                    Expected Disposal Date
                  </label>
                  <input
                    id="patch-expected-date"
                    type="date"
                    value={patchExpectedDate}
                    onChange={(e) => setPatchExpectedDate(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div>
                  <label htmlFor="patch-officer" className="block text-xs font-semibold text-slate-700 mb-1">
                    Assigned Officer
                  </label>
                  <input
                    id="patch-officer"
                    type="text"
                    value={patchOfficer}
                    onChange={(e) => setPatchOfficer(e.target.value)}
                    placeholder="e.g. A. Rao (demo)"
                    disabled={isSubmitting}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div>
                  <label htmlFor="patch-priority" className="block text-xs font-semibold text-slate-700 mb-1">
                    Priority Level
                  </label>
                  <select
                    id="patch-priority"
                    value={patchPriority}
                    onChange={(e) => setPatchPriority(e.target.value as 'low' | 'medium' | 'high')}
                    disabled={isSubmitting}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900 uppercase"
                  >
                    <option value="low">LOW</option>
                    <option value="medium">MEDIUM</option>
                    <option value="high">HIGH</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded-md text-xs font-semibold bg-amber-700 text-white hover:bg-amber-600 transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving Details...' : 'Save Case Details'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
};
