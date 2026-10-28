import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  createCase,
  scanOverlaps,
  getOverlaps,
  getInstitutions,
  getDashboardSummary,
  getCurrentUser,
  type CaseItem,
  type Institution,
  type OverlapItem,
} from '../api/client';
import { ConfidenceBandBadge } from './Badges';
import { formatSignal } from '../utils/formatters';
import {
  X,
  Building2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Loader2,
  ExternalLink,
  FilePlus,
  RefreshCw,
} from 'lucide-react';

export type OverlapEvaluationStatus =
  | 'idle'
  | 'checking'
  | 'completed'
  | 'failed'
  | 'forbidden';

function isPermissionDenied(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    if (anyErr.status === 403 || anyErr.statusCode === 403 || anyErr.status_code === 403) {
      return true;
    }
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('403') ||
      msg.includes('forbidden') ||
      msg.includes('not permitted') ||
      msg.includes('permission')
    ) {
      return true;
    }
  }
  return false;
}

interface NewComplaintModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newCase: CaseItem) => void;
}

const CATEGORIES = [
  { value: 'infrastructure', label: 'Infrastructure & Facilities' },
  { value: 'faculty', label: 'Faculty & Staff Issues' },
  { value: 'fee_refund', label: 'Fee & Refund Dispute' },
  { value: 'admission', label: 'Admission Irregularities' },
  { value: 'approval', label: 'Approval & Norms' },
  { value: 'examination', label: 'Examination & Grading' },
  { value: 'other', label: 'Other Governance Grievance' },
];

const BUREAUS = [
  { value: 'RB', label: 'RB – Regulation Bureau' },
  { value: 'PGRC', label: 'PGRC – Public Grievance Redressal Cell' },
  { value: 'RO', label: 'RO – Regional Office' },
  { value: 'OC', label: 'OC – Other Cell' },
];

export const NewComplaintModal: React.FC<NewComplaintModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const currentUser = getCurrentUser();
  const isOfficer = currentUser?.role === 'bureau_officer';
  const officerBureau = currentUser?.bureau || 'RB';

  // Form State
  const [permanentId, setPermanentId] = useState('');
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [bureau, setBureau] = useState<string>(isOfficer ? officerBureau : 'RB');
  const [category, setCategory] = useState<string>('infrastructure');
  const [description, setDescription] = useState('');
  const [assignedOfficer, setAssignedOfficer] = useState('');
  const [expectedDisposalDate, setExpectedDisposalDate] = useState('');
  const [complainantName, setComplainantName] = useState('');
  const [complainantEmail, setComplainantEmail] = useState('');

  // Institution Search State
  const [instSearchQuery, setInstSearchQuery] = useState('');
  const [instResults, setInstResults] = useState<Institution[]>([]);
  const [instLoading, setInstLoading] = useState(false);
  const [isSearchingInst, setIsSearchingInst] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Form Submission & Saved State
  const [submitting, setSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [registeredCase, setRegisteredCase] = useState<CaseItem | null>(null);

  // Decoupled Overlap Evaluation State
  const [overlapStatus, setOverlapStatus] = useState<OverlapEvaluationStatus>('idle');
  const [overlapMatches, setOverlapMatches] = useState<OverlapItem[]>([]);
  const [overlapError, setOverlapError] = useState<string | null>(null);

  // Request sequencing ref to safely ignore stale responses from closed modals or earlier cases
  const requestSeqRef = useRef<number>(0);

  const handleClose = useCallback(() => {
    requestSeqRef.current += 1;
    onClose();
  }, [onClose]);

  const handleResetForm = () => {
    requestSeqRef.current += 1;
    setRegisteredCase(null);
    setOverlapStatus('idle');
    setOverlapMatches([]);
    setOverlapError(null);
    setPermanentId('');
    setSelectedInstitution(null);
    setDescription('');
    setAssignedOfficer('');
    setExpectedDisposalDate('');
    setComplainantName('');
    setComplainantEmail('');
    setIsSearchingInst(true);
    setFormErrors({});
    setSubmitError(null);
    setSubmitStep('');
  };

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      requestSeqRef.current += 1;
      const initBureau = isOfficer ? officerBureau : 'RB';
      setBureau(initBureau);
      setPermanentId('');
      setSelectedInstitution(null);
      setCategory('infrastructure');
      setDescription('');
      setAssignedOfficer('');
      setExpectedDisposalDate('');
      setComplainantName('');
      setComplainantEmail('');
      setInstSearchQuery('');
      setInstResults([]);
      setIsSearchingInst(true);
      setSubmitting(false);
      setSubmitStep('');
      setSubmitError(null);
      setFormErrors({});
      setRegisteredCase(null);
      setOverlapStatus('idle');
      setOverlapMatches([]);
      setOverlapError(null);

      // Fetch initial institutions
      getInstitutions(undefined, 1, 8)
        .then((res) => setInstResults(res.items || []))
        .catch(() => {});
    }
  }, [isOpen, isOfficer, officerBureau]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      requestSeqRef.current += 1;
    };
  }, []);

  // Search institutions on query change with debounce
  useEffect(() => {
    if (!isOpen || !isSearchingInst) return;

    const timer = setTimeout(() => {
      setInstLoading(true);
      getInstitutions(instSearchQuery.trim() || undefined, 1, 8)
        .then((res) => {
          setInstResults(res.items || []);
        })
        .catch(() => {
          setInstResults([]);
        })
        .finally(() => {
          setInstLoading(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [isOpen, instSearchQuery, isSearchingInst]);

  // Escape key closes modal (never blocked by scan)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectInstitution = (inst: Institution) => {
    setSelectedInstitution(inst);
    setPermanentId(inst.permanent_id);
    setIsSearchingInst(false);
    setFormErrors((prev) => ({ ...prev, permanentId: '' }));
  };

  const handleClearInstitution = () => {
    setSelectedInstitution(null);
    setPermanentId('');
    setIsSearchingInst(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  /**
   * Run overlap evaluation separately from complaint creation.
   * Scans across bureaus and retrieves matching pairs for caseNo without delaying confirmation.
   */
  const evaluateOverlaps = async (caseNo: string) => {
    const seq = ++requestSeqRef.current;
    setOverlapStatus('checking');
    setOverlapError(null);
    setOverlapMatches([]);

    try {
      // 1. Run overlap detection scan
      try {
        await scanOverlaps();
      } catch (scanErr: unknown) {
        if (seq !== requestSeqRef.current) return;
        if (isPermissionDenied(scanErr)) {
          setOverlapStatus('forbidden');
          return;
        }
        const msg = scanErr instanceof Error ? scanErr.message : 'Scan request failed';
        setOverlapStatus('failed');
        setOverlapError(msg);
        return;
      }

      if (seq !== requestSeqRef.current) return;

      // 2. Fetch overlap items (preserve existing pagination and filter logic)
      let matchingOverlaps: OverlapItem[] = [];
      const overlapsRes = await getOverlaps({ page: 1, page_size: 100 });
      let allItems = overlapsRes.items || [];
      const totalItems = overlapsRes.total || allItems.length;
      const totalPages = Math.ceil(totalItems / 100);

      if (totalPages > 1) {
        for (let p = 2; p <= totalPages; p++) {
          if (seq !== requestSeqRef.current) return;
          const nextRes = await getOverlaps({ page: p, page_size: 100 });
          if (nextRes.items && nextRes.items.length > 0) {
            allItems = allItems.concat(nextRes.items);
          }
        }
      }

      if (seq !== requestSeqRef.current) return;

      matchingOverlaps = allItems.filter(
        (o) => o.case_a?.case_no === caseNo || o.case_b?.case_no === caseNo
      );

      setOverlapMatches(matchingOverlaps);
      setOverlapStatus('completed');
    } catch (fetchErr: unknown) {
      if (seq !== requestSeqRef.current) return;
      if (isPermissionDenied(fetchErr)) {
        setOverlapStatus('forbidden');
      } else {
        const msg = fetchErr instanceof Error ? fetchErr.message : 'Failed to retrieve overlap results';
        setOverlapStatus('failed');
        setOverlapError(msg);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const errors: Record<string, string> = {};

    if (!permanentId.trim()) {
      errors.permanentId = 'Please select an institution';
    }
    if (!description.trim()) {
      errors.description = 'Complaint description is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitStep('Registering complaint in database...');

    const submitSeq = ++requestSeqRef.current;
    let created: CaseItem;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const targetBureau = isOfficer ? officerBureau : bureau;

      created = await createCase({
        permanent_id: permanentId.trim(),
        bureau: targetBureau,
        category,
        description: description.trim(),
        received_date: todayStr,
        assigned_officer: assignedOfficer.trim() || null,
        expected_disposal_date: expectedDisposalDate || null,
        priority: 'medium',
        complainant_name: complainantName.trim() || null,
        complainant_email: complainantEmail.trim() || null,
      });
    } catch (err: unknown) {
      if (submitSeq !== requestSeqRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to register complaint.';
      setSubmitError(msg);
      setSubmitting(false);
      setSubmitStep('');
      return;
    }

    // If modal was closed or reset while createCase was in-flight, ignore modal updates
    if (submitSeq !== requestSeqRef.current) {
      try {
        const maybePromise = onSuccess?.(created);
        if (maybePromise && typeof (maybePromise as Promise<unknown>).catch === 'function') {
          (maybePromise as Promise<unknown>).catch((err) => {
            console.warn('Parent onSuccess promise rejection (modal closed):', err);
          });
        }
      } catch (err) {
        console.warn('Parent onSuccess error (modal closed):', err);
      }

      getDashboardSummary()
        .then(() => {
          window.dispatchEvent(new CustomEvent('casebridge:refresh-counts'));
        })
        .catch((err) => {
          console.warn('Dashboard count refresh failed:', err);
        });
      return;
    }

    // IMMEDIATELY establish saved state for current modal session
    setSubmitting(false);
    setSubmitStep('');
    setRegisteredCase(created);

    // Safely invoke parent notification without blocking confirmation or unhandled rejection
    try {
      const maybePromise = onSuccess?.(created);
      if (maybePromise && typeof (maybePromise as Promise<unknown>).catch === 'function') {
        (maybePromise as Promise<unknown>).catch((err) => {
          console.warn('Parent onSuccess promise rejection:', err);
        });
      }
    } catch (err) {
      console.warn('Parent onSuccess error:', err);
    }

    // Refresh Overview counts in background without blocking or failing confirmation
    getDashboardSummary()
      .then(() => {
        window.dispatchEvent(new CustomEvent('casebridge:refresh-counts'));
      })
      .catch((err) => {
        console.warn('Dashboard count refresh failed:', err);
      });

    // Run overlap evaluation separately
    evaluateOverlaps(created.case_no);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-complaint-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] shadow-[var(--shadow-card)] w-full max-w-2xl overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 bg-[var(--bg-subtle)] border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--brand)] text-white flex items-center justify-center">
              <FilePlus className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <div>
              <h2 id="new-complaint-title" className="text-base font-semibold text-[var(--text)] tracking-tight">
                {registeredCase ? 'Complaint Registration Status' : 'Register New Complaint'}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {registeredCase
                  ? 'Complaint saved; overlap-check status is shown below.'
                  : 'Record a new grievance complaint into the centralized registry'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-[var(--neutral-bg)] transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto max-h-[calc(85vh-120px)] bg-[var(--bg-surface)]">
          {/* Result Panel State */}
          {registeredCase ? (
            <div className="space-y-4">
              {/* Complaint Registered Banner - Confirmed Immediately */}
              <div className="p-4 rounded-lg bg-[var(--success-bg)] border border-[var(--success)]/30">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[var(--success)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-[var(--success)]">
                      Complaint registered: {registeredCase.case_no}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      The complaint has been successfully created and an initial case event was appended.
                    </p>
                    <div className="mt-2.5 pt-2 border-t border-[var(--success)]/20 flex items-center gap-3 flex-wrap text-xs">
                      <div>
                        <span className="text-[var(--text-secondary)]">Bureau: </span>
                        <strong className="text-[var(--text)]">{registeredCase.bureau}</strong>
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)]">Category: </span>
                        <strong className="text-[var(--text)] capitalize">{registeredCase.category}</strong>
                      </div>
                      {registeredCase.institution && (
                        <div>
                          <span className="text-[var(--text-secondary)]">Institution: </span>
                          <strong className="text-[var(--text)]">{registeredCase.institution.name}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Overlap Detection Evaluation Section */}
              {/* 1. Checking State */}
              {overlapStatus === 'checking' && (
                <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)] flex items-center gap-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--brand)] flex-shrink-0" aria-hidden="true" />
                  <div>
                    <span className="font-semibold text-[var(--text)]">Checking for overlapping complaints...</span>
                    <p className="text-[var(--text-secondary)] mt-0.5">
                      Scanning across bureaus for potential duplicate or related grievances.
                    </p>
                  </div>
                </div>
              )}

              {/* 2. Completed with Matches */}
              {overlapStatus === 'completed' && overlapMatches.length > 0 && (
                <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-bg)] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--warning)] flex-shrink-0" aria-hidden="true" />
                    <h4 className="text-sm font-semibold text-[var(--warning)]">
                      Potential Overlapping Cases – Coordination Required
                    </h4>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Detection engine identified <strong className="text-[var(--text)]">{overlapMatches.length}</strong> candidate overlapping case pair(s) concerning this institution across bureaus:
                  </p>

                  <div className="space-y-2 mt-2">
                    {overlapMatches.map((item) => {
                      const otherCase =
                        item.case_a.case_no === registeredCase.case_no ? item.case_b : item.case_a;

                      return (
                        <div
                          key={item.id}
                          className="p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-[var(--text)]">Pair #{item.id}</span>
                              <ConfidenceBandBadge band={item.band} />
                              <span className="text-[var(--text-secondary)]">Overlaps with:</span>
                              <span className="font-mono font-medium text-[var(--brand)]">{otherCase.case_no}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--neutral-bg)] text-[var(--neutral)] border border-[var(--border)]">
                                {otherCase.bureau}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              <span className="text-xs text-[var(--text-secondary)]">Why flagged:</span>
                              {item.reasons && item.reasons.length > 0 ? (
                                item.reasons.map((r, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-[var(--neutral-bg)] text-[var(--neutral)] border border-[var(--border)]"
                                  >
                                    {formatSignal(r)}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-[var(--text-tertiary)] italic">Same-institution match</span>
                              )}
                            </div>
                          </div>

                          <Link
                            to={`/overlaps#overlap-${item.id}`}
                            onClick={handleClose}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] hover:underline shrink-0"
                          >
                            <span>View in Queue</span>
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Completed without Matches */}
              {overlapStatus === 'completed' && overlapMatches.length === 0 && (
                <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)] flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[var(--success)] flex-shrink-0" aria-hidden="true" />
                  <div>
                    <span className="font-semibold text-[var(--text)]">No overlaps found. </span>
                    <span>No cross-bureau duplicates or related grievances were detected for this institution.</span>
                  </div>
                </div>
              )}

              {/* 4. Overlap Check Failed (Allows Retrying Only the Overlap Check) */}
              {overlapStatus === 'failed' && (
                <div className="p-4 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-bg)] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-[var(--warning)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <span className="font-semibold text-[var(--text)]">Complaint saved, but the overlap check failed</span>
                      <p className="text-[var(--text-secondary)] mt-0.5">
                        {overlapError || 'Could not complete the automated overlap scan.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => registeredCase && evaluateOverlaps(registeredCase.case_no)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-input)] text-[var(--text)] hover:bg-[var(--bg-subtle)] transition shrink-0 cursor-pointer self-start sm:self-auto"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Retry</span>
                  </button>
                </div>
              )}

              {/* 5. Permission Denied (403) */}
              {overlapStatus === 'forbidden' && (
                <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)] flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <span className="font-semibold text-[var(--text)]">Complaint saved. </span>
                    <span>Your role cannot run an overlap scan; a coordinator can run it from the Overlap Queue.</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="text-xs font-medium text-[var(--brand)] hover:underline cursor-pointer"
                >
                  + Register another complaint
                </button>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/cases/${registeredCase.case_no}`}
                    onClick={handleClose}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] transition"
                  >
                    <span>Open Case File</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-3.5 py-2 rounded-lg text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Form View State */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Shared API Error Banner */}
              {submitError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-xs text-[var(--danger)] flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-[var(--danger)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1">
                    <div className="font-semibold">Failed to register complaint</div>
                    <div className="text-[var(--danger)] mt-0.5 leading-relaxed">{submitError}</div>
                  </div>
                </div>
              )}

              {/* Institution Selection */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Affiliated Institution <span className="text-[var(--danger)]">*</span>
                </label>

                {selectedInstitution ? (
                  <div className="p-3 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-[var(--brand)] flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-[var(--brand)]" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[var(--text)] truncate">
                          {selectedInstitution.name}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          PID: <span className="font-mono">{selectedInstitution.permanent_id}</span> · Region: {selectedInstitution.region}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearInstitution}
                      disabled={submitting}
                      className="text-xs text-[var(--brand)] hover:underline shrink-0 font-medium cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-3 text-[var(--text-tertiary)]" aria-hidden="true" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={instSearchQuery}
                        onChange={(e) => {
                          setInstSearchQuery(e.target.value);
                          setIsSearchingInst(true);
                        }}
                        placeholder="Search institution by name or Permanent ID (PID)..."
                        disabled={submitting}
                        className={`w-full h-10 pl-9 pr-3 text-xs bg-[var(--bg-surface)] border rounded-lg text-[var(--text)] placeholder:text-[var(--text-tertiary)] transition ${
                          formErrors.permanentId ? 'border-[var(--danger)] bg-[var(--danger-bg)]/20' : 'border-[var(--border-input)]'
                        }`}
                      />
                    </div>

                    {formErrors.permanentId && (
                      <p className="text-xs text-[var(--danger)] font-medium">{formErrors.permanentId}</p>
                    )}

                    {/* Results Dropdown */}
                    {isSearchingInst && (
                      <div className="max-h-48 overflow-y-auto border border-[var(--border)] rounded-lg bg-[var(--bg-surface)] divide-y divide-[var(--border)] shadow-sm">
                        {instLoading ? (
                          <div className="p-3 text-center text-xs text-[var(--text-secondary)] flex items-center justify-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            <span>Searching institutions...</span>
                          </div>
                        ) : instResults.length > 0 ? (
                          instResults.map((inst) => (
                            <button
                              key={inst.permanent_id}
                              type="button"
                              onClick={() => handleSelectInstitution(inst)}
                              className="w-full p-2.5 text-left text-xs hover:bg-[var(--neutral-bg)] transition flex items-center justify-between gap-2 cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-[var(--text)] truncate">{inst.name}</div>
                                <div className="text-xs text-[var(--text-secondary)]">PID: {inst.permanent_id} · Region: {inst.region}</div>
                              </div>
                              <span className="text-[11px] text-[var(--brand)] font-medium shrink-0">Select</span>
                            </button>
                          ))
                        ) : (
                          <div className="p-3 text-center text-xs text-[var(--text-tertiary)] italic">
                            No institutions found matching &quot;{instSearchQuery}&quot;
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bureau & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Bureau */}
                <div>
                  <label htmlFor="new-case-bureau" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Handling Bureau <span className="text-[var(--danger)]">*</span>
                  </label>
                  {isOfficer ? (
                    <div className="h-10 px-3 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg text-xs flex items-center justify-between text-[var(--text)]">
                      <span className="font-medium">{officerBureau} Bureau (Locked)</span>
                      <Lock className="w-3.5 h-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
                    </div>
                  ) : (
                    <select
                      id="new-case-bureau"
                      value={bureau}
                      onChange={(e) => setBureau(e.target.value)}
                      disabled={submitting}
                      className="w-full h-10 text-xs bg-[var(--bg-surface)] border border-[var(--border-input)] rounded-lg px-3 text-[var(--text)] cursor-pointer"
                    >
                      {BUREAUS.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Category */}
                <div>
                  <label htmlFor="new-case-category" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Grievance Category <span className="text-[var(--danger)]">*</span>
                  </label>
                  <select
                    id="new-case-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={submitting}
                    className="w-full h-10 text-xs bg-[var(--bg-surface)] border border-[var(--border-input)] rounded-lg px-3 text-[var(--text)] cursor-pointer"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description (Required) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="new-case-description" className="block text-xs font-medium text-[var(--text-secondary)]">
                    Complaint Description <span className="text-[var(--danger)]">*</span>
                  </label>
                  <span className="text-xs text-[var(--text-tertiary)]">Required</span>
                </div>
                <textarea
                  id="new-case-description"
                  rows={4}
                  required
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (formErrors.description) {
                      setFormErrors((prev) => ({ ...prev, description: '' }));
                    }
                  }}
                  disabled={submitting}
                  placeholder="Detail the complaint or grievance reported against this institution, key allegations, affected departments..."
                  className={`w-full text-xs bg-[var(--bg-surface)] border rounded-lg p-2.5 text-[var(--text)] placeholder:text-[var(--text-tertiary)] transition ${
                    formErrors.description ? 'border-[var(--danger)] bg-[var(--danger-bg)]/20' : 'border-[var(--border-input)]'
                  }`}
                />
                {formErrors.description && (
                  <p className="text-xs text-[var(--danger)] font-medium mt-1">{formErrors.description}</p>
                )}
              </div>

              {/* Optional Fields: Assigned Officer & Expected Disposal Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label htmlFor="new-case-officer" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Assigned Officer <span className="text-[var(--text-tertiary)]">(Optional)</span>
                  </label>
                  <input
                    id="new-case-officer"
                    type="text"
                    value={assignedOfficer}
                    onChange={(e) => setAssignedOfficer(e.target.value)}
                    disabled={submitting}
                    placeholder="e.g. Dr. A. Sharma"
                    className="w-full h-10 text-xs bg-[var(--bg-surface)] border border-[var(--border-input)] rounded-lg px-3 text-[var(--text)] placeholder:text-[var(--text-tertiary)]"
                  />
                </div>

                <div>
                  <label htmlFor="new-case-expected-date" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Expected Disposal Date <span className="text-[var(--text-tertiary)]">(Optional)</span>
                  </label>
                  <input
                    id="new-case-expected-date"
                    type="date"
                    value={expectedDisposalDate}
                    onChange={(e) => setExpectedDisposalDate(e.target.value)}
                    disabled={submitting}
                    className="w-full h-10 text-xs bg-[var(--bg-surface)] border border-[var(--border-input)] rounded-lg px-3 text-[var(--text)] cursor-pointer"
                  />
                </div>
              </div>

              {/* Complainant Contact for Email Notifications */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label htmlFor="new-case-complainant-name" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Complainant Name <span className="text-[var(--text-tertiary)]">(Optional)</span>
                  </label>
                  <input
                    id="new-case-complainant-name"
                    type="text"
                    value={complainantName}
                    onChange={(e) => setComplainantName(e.target.value)}
                    disabled={submitting}
                    placeholder="e.g. S. Kumar"
                    className="w-full h-10 text-xs bg-[var(--bg-surface)] border border-[var(--border-input)] rounded-lg px-3 text-[var(--text)] placeholder:text-[var(--text-tertiary)]"
                  />
                </div>

                <div>
                  <label htmlFor="new-case-complainant-email" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Complainant Email <span className="text-[var(--text-tertiary)]">(Optional)</span>
                  </label>
                  <input
                    id="new-case-complainant-email"
                    type="email"
                    value={complainantEmail}
                    onChange={(e) => setComplainantEmail(e.target.value)}
                    disabled={submitting}
                    placeholder="e.g. student@example.edu.in"
                    className="w-full h-10 text-xs bg-[var(--bg-surface)] border border-[var(--border-input)] rounded-lg px-3 text-[var(--text)] placeholder:text-[var(--text-tertiary)]"
                  />
                </div>
              </div>

              {/* Progress Indicator when Submitting */}
              {submitting && (
                <div className="p-3 bg-[var(--brand-subtle)] border border-[var(--brand)]/20 rounded-lg flex items-center gap-2.5 text-xs text-[var(--brand)] font-medium">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--brand)] shrink-0" aria-hidden="true" />
                  <span>{submitStep || 'Processing...'}</span>
                </div>
              )}

              {/* Submit / Cancel Buttons */}
              <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={submitting}
                  className="h-10 px-4 rounded-lg text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-xs font-medium bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] disabled:opacity-50 transition cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      <span>Registering...</span>
                    </>
                  ) : (
                    <span>Register Complaint</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
