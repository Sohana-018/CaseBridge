import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getCaseDetail,
  getCaseEvents,
  postCaseEvent,
  patchCase,
  getCurrentUser,
  type CaseItem,
  type CaseEvent,
  type UserPayload,
} from '../api/client';
import { StatusChip, PriorityChip, RestrictedBadge } from '../components/Badges';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';
import { formatCategory, formatStatus } from '../utils/formatters';
import { useToast } from '../components/Toast';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  User,
  Activity,
  ArrowRight,
  ShieldAlert,
  GitCommit,
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

function computeSlaExplanation(c: CaseItem): { text: string; isDanger: boolean } | null {
  if (!c.expected_disposal_date) return null;
  const target = new Date(c.expected_disposal_date).getTime();

  if (c.status === 'disposed') {
    // If last action date or disposal date exists
    const closedDate = c.last_action_date ? new Date(c.last_action_date).getTime() : new Date().getTime();
    const diffDays = Math.round((closedDate - target) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      return { text: `Disposed ${diffDays} days after SLA target`, isDanger: false };
    }
    return { text: 'Closed on time within SLA', isDanger: false };
  }

  const now = new Date().getTime();
  const diffDays = Math.round((now - target) / (1000 * 60 * 60 * 24));
  if (diffDays > 0) {
    return { text: `${diffDays} days overdue past SLA target`, isDanger: true };
  }
  return { text: `Due in ${Math.abs(diffDays)} days`, isDanger: false };
}

export const CaseDetailPage: React.FC = () => {
  const { case_no } = useParams<{ case_no: string }>();
  const { showToast } = useToast();
  const [caseItem, setCaseItem] = useState<CaseItem | null>(null);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [currentUser, setCurrentUser] = useState<UserPayload | null>(() => getCurrentUser());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  // Action Dialog States
  const [activeDialog, setActiveDialog] = useState<
    'status' | 'transfer' | 'escalate' | 'remark' | 'edit_details' | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Form Fields
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

  const closeDialog = () => {
    if (isSubmitting) return;
    setActiveDialog(null);
    setDialogError(null);
  };

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
      closeDialog();
      showToast(`Case status transitioned to ${formatStatus(newStatus)}`, 'success');
      fetchCaseAndEvents();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Failed to update case status.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
      closeDialog();
      showToast(`Case reallocated to ${newBureau} Bureau`, 'success');
      fetchCaseAndEvents();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Failed to transfer case.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEscalateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!case_no || !escalateRemarks.trim()) return;
    setIsSubmitting(true);
    setDialogError(null);
    try {
      await postCaseEvent(case_no, {
        event_type: 'escalation',
        remarks: escalateRemarks.trim(),
      });
      closeDialog();
      showToast('Case escalated to senior coordination desk', 'success');
      fetchCaseAndEvents();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Failed to escalate case.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemarkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!case_no || !remarkText.trim()) return;
    setIsSubmitting(true);
    setDialogError(null);
    try {
      await postCaseEvent(case_no, {
        event_type: 'remark',
        remarks: remarkText.trim(),
      });
      closeDialog();
      showToast('Audit remark appended to timeline', 'success');
      fetchCaseAndEvents();
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Failed to append remark.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!case_no) return;
    setIsSubmitting(true);
    setDialogError(null);
    try {
      await patchCase(case_no, {
        next_action: patchNextAction.trim() || undefined,
        expected_disposal_date: patchExpectedDate || undefined,
        assigned_officer: patchOfficer.trim() || undefined,
        priority: patchPriority,
      });
      closeDialog();
      showToast('Case details successfully updated', 'success');
      fetchCaseAndEvents();
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

  const isDisposed = caseItem?.status === 'disposed';
  const isReadOnlyRole = currentUser?.role === 'senior_management' || currentUser?.role === 'administrator';
  const isOfficerDiffBureau =
    currentUser?.role === 'bureau_officer' &&
    Boolean(currentUser?.bureau && caseItem?.bureau && currentUser.bureau.toUpperCase() !== caseItem.bureau.toUpperCase());
  const isRestricted = isOfficerDiffBureau;

  const prefixBureau = caseItem?.case_no.split('-')[0];
  const hasBureauTransferDifference = prefixBureau && caseItem?.bureau && prefixBureau !== caseItem.bureau;
  const slaInfo = caseItem ? computeSlaExplanation(caseItem) : null;

  return (
    <div className="cb-page-container space-y-6">
      {/* Back button */}
      <div>
        <Link
          to={caseItem?.institution?.permanent_id ? `/institutions/${caseItem.institution.permanent_id}` : '/cases'}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--brand)] transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {caseItem?.institution?.name
              ? `Back to ${caseItem.institution.name}`
              : 'Back to Cases Directory'}
          </span>
        </Link>
      </div>

      {/* Loading & Error States */}
      {loading && <LoadingState message={`Fetching case ${case_no} and timeline...`} />}

      {!loading && error && (
        <ErrorState
          title="Case Not Found or Error"
          message={error}
          onRetry={fetchCaseAndEvents}
        />
      )}

      {/* Main Two-Column Layout */}
      {!loading && !error && caseItem && (
        <div className="space-y-6">
          {/* Title Row: Single H1 with reference in mono + badges underneath */}
          <div className="pb-4 border-b border-[var(--border)]">
            <h1 className="text-2xl sm:text-[28px] font-semibold text-[var(--text)] tracking-tight font-mono">
              {caseItem.case_no}
            </h1>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <StatusChip status={caseItem.status} />
              <span className="px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-[var(--neutral-bg)] text-[var(--neutral)] border border-[var(--border)]">
                Bureau: {caseItem.bureau}
              </span>
              {caseItem.priority && <PriorityChip priority={caseItem.priority} />}
              {caseItem.overdue && !isDisposed && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--danger-bg)] text-[var(--danger)] border border-[#FECDCA]">
                  <ShieldAlert className="w-3 h-3 text-[var(--danger)] shrink-0" aria-hidden="true" />
                  <span>SLA Overdue</span>
                </span>
              )}
            </div>

            {hasBureauTransferDifference && (
              <p className="text-xs text-[var(--text-secondary)] mt-2">
                Note: Originally registered in <strong className="font-semibold">{prefixBureau}</strong>, transferred to <strong className="font-semibold">{caseItem.bureau}</strong>.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Main Column (8 cols): Summary, Metadata Description List, Timeline */}
            <div className="lg:col-span-8 space-y-6">
              {/* Affiliated Institution Link */}
              <div className="cb-card p-5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Affiliated Institution
                </span>
                {caseItem.institution ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-lg bg-[var(--brand-subtle)] border border-[var(--border)] text-[var(--brand)] flex items-center justify-center shrink-0"
                        aria-hidden="true"
                      >
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <Link
                          to={`/institutions/${caseItem.institution.permanent_id}`}
                          className="font-semibold text-sm text-[var(--text)] hover:text-[var(--brand)] hover:underline"
                        >
                          {caseItem.institution.name}
                        </Link>
                        <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                          PID: <span className="font-mono text-[var(--text-tertiary)]">{caseItem.institution.permanent_id}</span> · Region: {caseItem.institution.region}
                        </div>
                      </div>
                    </div>

                    <Link
                      to={`/institutions/${caseItem.institution.permanent_id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] hover:underline shrink-0"
                    >
                      <span>Institution profile</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-[var(--text-tertiary)] italic">
                    Institution details restricted to owning bureau
                  </div>
                )}
              </div>

              {/* Grievance Description */}
              <div className="cb-card p-5">
                <h2 className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                  Grievance Summary & Description
                </h2>
                <div className="text-sm text-[var(--text)] leading-relaxed">
                  {caseItem.description || (
                    <span className="italic text-[var(--text-tertiary)]">
                      Details restricted to the owning bureau
                    </span>
                  )}
                </div>
              </div>

              {/* Clean Description List (No Boxed Tiles) */}
              <div className="cb-card p-5">
                <h2 className="text-xs font-medium text-[var(--text-secondary)] mb-4">
                  Case Metadata
                </h2>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <dt className="text-[var(--text-tertiary)] mb-1">Category</dt>
                    <dd className="font-semibold text-[var(--text)]">
                      {formatCategory(caseItem.category)}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[var(--text-tertiary)] mb-1">Assigned Officer</dt>
                    <dd className="font-semibold text-[var(--text)]">
                      {caseItem.assigned_officer || (isRestricted ? 'Restricted' : 'Unassigned')}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[var(--text-tertiary)] mb-1">Received Date</dt>
                    <dd className="font-semibold text-[var(--text)] num-tabular">
                      {caseItem.received_date || '—'}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[var(--text-tertiary)] mb-1">Target SLA Date</dt>
                    <dd className={`font-semibold num-tabular ${caseItem.overdue && !isDisposed ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>
                      {caseItem.expected_disposal_date || '—'}
                    </dd>
                  </div>
                </dl>

                {/* Planned Next Action (Hidden or Relabeled if Disposed) */}
                {!isDisposed && caseItem.next_action && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)] text-xs">
                    <span className="text-[var(--text-tertiary)]">Planned Next Action:</span>
                    <p className="font-medium text-[var(--text)] mt-0.5">{caseItem.next_action}</p>
                  </div>
                )}
              </div>

              {/* Chronological Timeline Section (Clean vertical line) */}
              <div className="cb-card p-5">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4">
                  <div className="flex items-center gap-2">
                    <GitCommit className="w-4 h-4 text-[var(--brand)]" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-[var(--text)]">Event Timeline</h2>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)] num-tabular">
                    {events.length} events
                  </span>
                </div>

                {events.length === 0 ? (
                  <EmptyState
                    title="No events logged"
                    message={
                      isRestricted
                        ? 'Details restricted to the owning bureau.'
                        : 'No events have been appended to this case yet.'
                    }
                  />
                ) : (
                  <div className="relative pl-5 border-l-2 border-[var(--border)] space-y-5 my-2 ml-2">
                    {events.map((evt, idx) => {
                      const isInitialRegistration = idx === 0 && evt.event_type === 'created';
                      return (
                        <div key={evt.id || idx} className="relative">
                          {/* Dot on line */}
                          <div
                            className="absolute -left-[27px] top-1.5 w-2.5 h-2.5 rounded-full bg-[var(--brand)] border-2 border-white"
                            aria-hidden="true"
                          />

                          <div className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-[var(--text)]">
                                  {isInitialRegistration
                                    ? 'Registered'
                                    : evt.event_type === 'status_change'
                                    ? 'Status Updated'
                                    : evt.event_type === 'transfer'
                                    ? 'Transferred'
                                    : evt.event_type === 'escalation'
                                    ? 'Escalated'
                                    : evt.event_type === 'review'
                                    ? 'Review Decision'
                                    : 'Remark Appended'}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-[var(--border)] text-[var(--neutral)]">
                                  {evt.bureau}
                                </span>
                              </div>
                              <span
                                className="text-[11px] text-[var(--text-tertiary)] num-tabular"
                                title={evt.ts || ''}
                              >
                                {formatTimestamp(evt.ts)}
                              </span>
                            </div>

                            <div className="text-[11px] text-[var(--text-secondary)] mb-2">
                              Recorded by <strong className="font-semibold text-[var(--text)]">{evt.actor}</strong>
                            </div>

                            {/* State transitions */}
                            {!isInitialRegistration && (evt.from_status || evt.to_status || evt.from_bureau || evt.to_bureau) && (
                              <div className="flex items-center gap-2 my-1.5 flex-wrap">
                                {evt.to_status && (
                                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-[var(--border)] text-[var(--text)]">
                                    <span className="text-[var(--text-tertiary)]">Status:</span>
                                    {evt.from_status && (
                                      <>
                                        <span className="text-[var(--text-secondary)]">
                                          {formatStatus(evt.from_status)}
                                        </span>
                                        <ArrowRight className="w-3 h-3 text-[var(--brand)]" aria-hidden="true" />
                                      </>
                                    )}
                                    <span className="font-semibold text-[var(--brand)]">
                                      {formatStatus(evt.to_status)}
                                    </span>
                                  </div>
                                )}
                                {evt.to_bureau && (
                                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-[var(--border)] text-[var(--text)]">
                                    <span className="text-[var(--text-tertiary)]">Bureau:</span>
                                    {evt.from_bureau && (
                                      <>
                                        <span className="text-[var(--text-secondary)]">{evt.from_bureau}</span>
                                        <ArrowRight className="w-3 h-3 text-[var(--brand)]" aria-hidden="true" />
                                      </>
                                    )}
                                    <span className="font-semibold text-[var(--brand)]">{evt.to_bureau}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Remarks */}
                            {evt.remarks && (
                              <p className="mt-2 text-xs text-[var(--text)] bg-white p-2.5 rounded border border-[var(--border)] leading-relaxed">
                                {evt.remarks}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Sticky Right Sidebar (4 cols): Status, SLA, Actions Panel */}
            <div className="lg:col-span-4 sticky top-20 space-y-5">
              {/* SLA & Status Overview */}
              <div className="cb-card p-5 space-y-3">
                <h2 className="text-xs font-medium text-[var(--text-secondary)]">
                  SLA Target & Disposal Status
                </h2>

                {slaInfo && (
                  <div
                    className={`p-3 rounded-lg border text-xs font-medium ${
                      slaInfo.isDanger
                        ? 'bg-[var(--danger-bg)] border-[#FECDCA] text-[var(--danger)]'
                        : 'bg-[var(--success-bg)] border-[#A6F4C5] text-[var(--success)]'
                    }`}
                  >
                    {slaInfo.text}
                  </div>
                )}

                <div className="pt-2 text-xs text-[var(--text-secondary)] space-y-1.5">
                  <div className="flex justify-between">
                    <span>Target Date:</span>
                    <strong className="font-semibold text-[var(--text)] num-tabular">
                      {caseItem.expected_disposal_date || '—'}
                    </strong>
                  </div>
                  {caseItem.last_action_date && (
                    <div className="flex justify-between">
                      <span>Last Activity:</span>
                      <strong className="font-semibold text-[var(--text)] num-tabular">
                        {caseItem.last_action_date}
                      </strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions & Operations Card */}
              <div className="cb-card p-5 space-y-3">
                <h2 className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[var(--brand)]" aria-hidden="true" />
                  <span>Case Operations</span>
                </h2>

                {/* Read-only role notification */}
                {isReadOnlyRole ? (
                  <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] text-xs text-[var(--text-secondary)] flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
                    <span>Read-only permissions for {currentUser?.role?.replace('_', ' ')}.</span>
                  </div>
                ) : isOfficerDiffBureau ? (
                  <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] text-xs text-[var(--text-secondary)] flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
                    <span>Operations restricted to owning bureau ({caseItem.bureau}).</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pt-1">
                    {/* 1. Change Status */}
                    <button
                      type="button"
                      onClick={() => openDialog('status')}
                      disabled={isDisposed}
                      className="w-full h-9 inline-flex items-center justify-center gap-2 px-3 rounded-[var(--radius-control)] text-xs font-semibold bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] disabled:bg-[var(--neutral-bg)] disabled:text-[var(--text-tertiary)] disabled:cursor-not-allowed transition cursor-pointer shadow-xs"
                    >
                      <Activity className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Change Status</span>
                    </button>

                    {/* 2. Transfer Bureau */}
                    <button
                      type="button"
                      onClick={() => openDialog('transfer')}
                      disabled={isDisposed}
                      className="w-full h-9 inline-flex items-center justify-center gap-2 px-3 rounded-[var(--radius-control)] text-xs font-semibold bg-white border border-[var(--border-input)] text-[var(--text)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Transfer Bureau</span>
                    </button>

                    {/* 3. Escalate */}
                    <button
                      type="button"
                      onClick={() => openDialog('escalate')}
                      disabled={isDisposed}
                      className="w-full h-9 inline-flex items-center justify-center gap-2 px-3 rounded-[var(--radius-control)] text-xs font-semibold bg-white border border-[var(--border-input)] text-[var(--escalated)] hover:bg-[var(--escalated-bg)] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      <Flame className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Escalate Case</span>
                    </button>

                    {/* 4. Append Remark */}
                    <button
                      type="button"
                      onClick={() => openDialog('remark')}
                      className="w-full h-9 inline-flex items-center justify-center gap-2 px-3 rounded-[var(--radius-control)] text-xs font-semibold bg-white border border-[var(--border-input)] text-[var(--text)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Add Audit Remark</span>
                    </button>

                    {/* 5. Edit Details */}
                    <button
                      type="button"
                      onClick={() => openDialog('edit_details')}
                      disabled={isDisposed}
                      className="w-full h-9 inline-flex items-center justify-center gap-2 px-3 rounded-[var(--radius-control)] text-xs font-semibold bg-white border border-[var(--border-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Edit Details</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
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
          aria-labelledby="dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) closeDialog();
          }}
        >
          <div className="bg-white rounded-xl shadow-xl border border-[var(--border)] w-full max-w-lg overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-[var(--bg-subtle)] border-b border-[var(--border)] flex items-center justify-between">
              <h2 id="dialog-title" className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                {activeDialog === 'status' && <Activity className="w-4 h-4 text-[var(--brand)]" aria-hidden="true" />}
                {activeDialog === 'transfer' && <ArrowRightLeft className="w-4 h-4 text-[var(--brand)]" aria-hidden="true" />}
                {activeDialog === 'escalate' && <Flame className="w-4 h-4 text-[var(--escalated)]" aria-hidden="true" />}
                {activeDialog === 'remark' && <MessageSquare className="w-4 h-4 text-[var(--brand)]" aria-hidden="true" />}
                {activeDialog === 'edit_details' && <Edit3 className="w-4 h-4 text-[var(--brand)]" aria-hidden="true" />}

                <span>
                  {activeDialog === 'status' && 'Change Case Status'}
                  {activeDialog === 'transfer' && 'Transfer to Another Bureau'}
                  {activeDialog === 'escalate' && 'Escalate Case'}
                  {activeDialog === 'remark' && 'Add Remark'}
                  {activeDialog === 'edit_details' && 'Edit Case Details'}
                </span>
              </h2>

              <button
                type="button"
                onClick={closeDialog}
                disabled={isSubmitting}
                className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-[var(--bg-subtle)] transition disabled:opacity-50 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* In-Dialog Error Notice */}
            {dialogError && (
              <div className="mx-5 mt-4 p-3 rounded-lg bg-[var(--danger-bg)] border border-[#FECDCA] text-[var(--danger)] text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 font-medium">{dialogError}</div>
              </div>
            )}

            {/* Modal Forms */}
            {activeDialog === 'status' && (
              <form onSubmit={handleStatusSubmit} className="p-5 space-y-4">
                <div className="text-xs text-[var(--text-secondary)]">
                  Current status:{' '}
                  <strong className="font-semibold text-[var(--text)]">
                    {formatStatus(caseItem?.status)}
                  </strong>
                </div>

                <div>
                  <label htmlFor="select-new-status" className="block text-xs font-semibold text-[var(--text)] mb-1">
                    New Status <span className="text-[var(--danger)]">*</span>
                  </label>
                  <select
                    id="select-new-status"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="w-full text-xs bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] px-3 py-2 text-[var(--text)]"
                  >
                    {ALL_STATUSES.filter((s) => s !== caseItem?.status).map((s) => (
                      <option key={s} value={s}>
                        {formatStatus(s)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="status-remarks" className="block text-xs font-semibold text-[var(--text)] mb-1">
                    Notes / Remarks
                  </label>
                  <textarea
                    id="status-remarks"
                    rows={3}
                    value={statusRemarks}
                    onChange={(e) => setStatusRemarks(e.target.value)}
                    placeholder="Provide context or explanation for this status transition..."
                    disabled={isSubmitting}
                    className="w-full text-xs bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] p-2.5 text-[var(--text)] placeholder:text-[var(--text-tertiary)]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                    className="px-3.5 py-1.5 rounded-[var(--radius-control)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newStatus}
                    className="px-4 py-1.5 rounded-[var(--radius-control)] text-xs font-semibold bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Updating...' : 'Confirm Status Change'}
                  </button>
                </div>
              </form>
            )}

            {activeDialog === 'transfer' && (
              <form onSubmit={handleTransferSubmit} className="p-5 space-y-4">
                <div className="text-xs text-[var(--text-secondary)]">
                  Current handling bureau:{' '}
                  <strong className="font-semibold text-[var(--text)]">{caseItem?.bureau}</strong>
                </div>

                <div>
                  <label htmlFor="select-new-bureau" className="block text-xs font-semibold text-[var(--text)] mb-1">
                    Transfer To Bureau <span className="text-[var(--danger)]">*</span>
                  </label>
                  <select
                    id="select-new-bureau"
                    value={newBureau}
                    onChange={(e) => setNewBureau(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="w-full text-xs bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] px-3 py-2 text-[var(--text)]"
                  >
                    {ALL_BUREAUS.filter((b) => b !== caseItem?.bureau).map((b) => (
                      <option key={b} value={b}>
                        {b} Bureau
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="transfer-remarks" className="block text-xs font-semibold text-[var(--text)] mb-1">
                    Transfer Instructions
                  </label>
                  <textarea
                    id="transfer-remarks"
                    rows={3}
                    value={transferRemarks}
                    onChange={(e) => setTransferRemarks(e.target.value)}
                    placeholder="Specify transfer rationale and handover instructions..."
                    disabled={isSubmitting}
                    className="w-full text-xs bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] p-2.5 text-[var(--text)] placeholder:text-[var(--text-tertiary)]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                    className="px-3.5 py-1.5 rounded-[var(--radius-control)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newBureau}
                    className="px-4 py-1.5 rounded-[var(--radius-control)] text-xs font-semibold bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Transferring...' : 'Confirm Bureau Transfer'}
                  </button>
                </div>
              </form>
            )}

            {activeDialog === 'escalate' && (
              <form onSubmit={handleEscalateSubmit} className="p-5 space-y-4">
                <div className="p-3 rounded-lg bg-[var(--escalated-bg)] border border-[#E9D7FE] text-[var(--escalated)] text-xs">
                  <span className="font-semibold">Operational Escalation: </span>
                  Escalating updates this case status to <em>Escalated</em> and creates a high-priority alert for review.
                </div>

                <div>
                  <label htmlFor="escalate-remarks" className="block text-xs font-semibold text-[var(--text)] mb-1">
                    Escalation Reason <span className="text-[var(--danger)]">*</span>
                  </label>
                  <textarea
                    id="escalate-remarks"
                    rows={3}
                    value={escalateRemarks}
                    onChange={(e) => setEscalateRemarks(e.target.value)}
                    placeholder="Provide explicit reasons for escalation..."
                    required
                    disabled={isSubmitting}
                    className="w-full text-xs bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] p-2.5 text-[var(--text)] placeholder:text-[var(--text-tertiary)]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                    className="px-3.5 py-1.5 rounded-[var(--radius-control)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !escalateRemarks.trim()}
                    className="px-4 py-1.5 rounded-[var(--radius-control)] text-xs font-semibold bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Escalating...' : 'Confirm Escalation'}
                  </button>
                </div>
              </form>
            )}

            {activeDialog === 'remark' && (
              <form onSubmit={handleRemarkSubmit} className="p-5 space-y-4">
                <div>
                  <label htmlFor="remark-text" className="block text-xs font-semibold text-[var(--text)] mb-1">
                    Remark Text <span className="text-[var(--danger)]">*</span>
                  </label>
                  <textarea
                    id="remark-text"
                    rows={4}
                    value={remarkText}
                    onChange={(e) => setRemarkText(e.target.value)}
                    placeholder="Enter remark, note of phone conversation, or audit observation..."
                    required
                    disabled={isSubmitting}
                    className="w-full text-xs bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] p-2.5 text-[var(--text)] placeholder:text-[var(--text-tertiary)]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                    className="px-3.5 py-1.5 rounded-[var(--radius-control)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !remarkText.trim()}
                    className="px-4 py-1.5 rounded-[var(--radius-control)] text-xs font-semibold bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Appending...' : 'Append Remark'}
                  </button>
                </div>
              </form>
            )}

            {activeDialog === 'edit_details' && (
              <form onSubmit={handleEditDetailsSubmit} className="p-5 space-y-3.5">
                <div>
                  <label htmlFor="patch-next-action" className="block text-xs font-semibold text-[var(--text)] mb-1">
                    Planned Next Action
                  </label>
                  <input
                    id="patch-next-action"
                    type="text"
                    value={patchNextAction}
                    onChange={(e) => setPatchNextAction(e.target.value)}
                    placeholder="e.g. Await institution reply, Schedule hearing..."
                    disabled={isSubmitting}
                    className="w-full h-9 text-xs bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] px-3 text-[var(--text)]"
                  />
                </div>

                <div>
                  <label htmlFor="patch-expected-date" className="block text-xs font-semibold text-[var(--text)] mb-1">
                    Expected Disposal Date
                  </label>
                  <input
                    id="patch-expected-date"
                    type="date"
                    value={patchExpectedDate}
                    onChange={(e) => setPatchExpectedDate(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full h-9 text-xs bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] px-3 text-[var(--text)]"
                  />
                </div>

                <div>
                  <label htmlFor="patch-officer" className="block text-xs font-semibold text-[var(--text)] mb-1">
                    Assigned Officer
                  </label>
                  <input
                    id="patch-officer"
                    type="text"
                    value={patchOfficer}
                    onChange={(e) => setPatchOfficer(e.target.value)}
                    placeholder="e.g. A. Rao"
                    disabled={isSubmitting}
                    className="w-full h-9 text-xs bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] px-3 text-[var(--text)]"
                  />
                </div>

                <div>
                  <label htmlFor="patch-priority" className="block text-xs font-semibold text-[var(--text)] mb-1">
                    Priority Level
                  </label>
                  <select
                    id="patch-priority"
                    value={patchPriority}
                    onChange={(e) => setPatchPriority(e.target.value as 'low' | 'medium' | 'high')}
                    disabled={isSubmitting}
                    className="w-full h-9 text-xs bg-white border border-[var(--border-input)] rounded-[var(--radius-control)] px-3 text-[var(--text)] uppercase"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                    className="px-3.5 py-1.5 rounded-[var(--radius-control)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded-[var(--radius-control)] text-xs font-semibold bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Details'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
