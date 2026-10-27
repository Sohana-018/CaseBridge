import React, { useState, useEffect, useRef } from 'react';
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

  // Institution Search State
  const [instSearchQuery, setInstSearchQuery] = useState('');
  const [instResults, setInstResults] = useState<Institution[]>([]);
  const [instLoading, setInstLoading] = useState(false);
  const [isSearchingInst, setIsSearchingInst] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Submission & Result State
  const [submitting, setSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    caseItem: CaseItem;
    overlaps: OverlapItem[];
  } | null>(null);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      const initBureau = isOfficer ? officerBureau : 'RB';
      setBureau(initBureau);
      setPermanentId('');
      setSelectedInstitution(null);
      setCategory('infrastructure');
      setDescription('');
      setAssignedOfficer('');
      setExpectedDisposalDate('');
      setInstSearchQuery('');
      setInstResults([]);
      setIsSearchingInst(true);
      setSubmitting(false);
      setSubmitStep('');
      setSubmitError(null);
      setFormErrors({});
      setResult(null);

      // Fetch initial institutions
      getInstitutions(undefined, 1, 8)
        .then((res) => setInstResults(res.items || []))
        .catch(() => {});
    }
  }, [isOpen, isOfficer, officerBureau]);

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

  // Escape key closes modal (unless currently submitting)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const targetBureau = isOfficer ? officerBureau : bureau;

      // 1. POST /cases
      const created = await createCase({
        permanent_id: permanentId.trim(),
        bureau: targetBureau,
        category,
        description: description.trim(),
        received_date: todayStr,
        assigned_officer: assignedOfficer.trim() || null,
        expected_disposal_date: expectedDisposalDate || null,
        priority: 'medium',
      });

      // 2. POST /overlaps/scan (safe: skip gracefully if role is non-scan role)
      setSubmitStep('Scanning for potential cross-bureau case overlaps...');
      try {
        await scanOverlaps();
      } catch {
        // Non-coordinator roles cannot scan; gracefully proceed
      }

      // 3. Fetch overlaps involving the new case_no (filter returned pages in client)
      setSubmitStep('Checking candidate overlap pairs...');
      let matchingOverlaps: OverlapItem[] = [];
      try {
        const overlapsRes = await getOverlaps({ page: 1, page_size: 100 });
        let allItems = overlapsRes.items || [];
        const totalItems = overlapsRes.total || allItems.length;
        const totalPages = Math.ceil(totalItems / 100);

        if (totalPages > 1) {
          for (let p = 2; p <= totalPages; p++) {
            const nextRes = await getOverlaps({ page: p, page_size: 100 });
            if (nextRes.items && nextRes.items.length > 0) {
              allItems = allItems.concat(nextRes.items);
            }
          }
        }

        matchingOverlaps = allItems.filter(
          (o) => o.case_a?.case_no === created.case_no || o.case_b?.case_no === created.case_no
        );
      } catch {
        // Overlap lookup non-blocking for modal completion
      }

      // 4. Refresh Overview counts afterwards
      try {
        await getDashboardSummary();
        window.dispatchEvent(new CustomEvent('casebridge:refresh-counts'));
      } catch {
        // ignore
      }

      // 5. Present result panel
      setResult({
        caseItem: created,
        overlaps: matchingOverlaps,
      });
      setSubmitStep('');
      onSuccess?.(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register complaint.';
      setSubmitError(msg);
      setSubmitStep('');
    } finally {
      setSubmitting(false);
    }
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
                {result ? 'Complaint Registration Status' : 'Register New Complaint'}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {result
                  ? 'Grievance created and evaluated by CaseBridge detection engine'
                  : 'Record a new grievance complaint into the centralized registry'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-[var(--neutral-bg)] transition disabled:opacity-40 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto max-h-[calc(85vh-120px)] bg-[var(--bg-surface)]">
          {/* Result Panel State */}
          {result ? (
            <div className="space-y-4">
              {/* Complaint Registered Banner */}
              <div className="p-4 rounded-lg bg-[var(--success-bg)] border border-[var(--success)]/30">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[var(--success)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-[var(--success)]">
                      Complaint registered: {result.caseItem.case_no}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      The complaint has been successfully created and an initial case event was appended.
                    </p>
                    <div className="mt-2.5 pt-2 border-t border-[var(--success)]/20 flex items-center gap-3 flex-wrap text-xs">
                      <div>
                        <span className="text-[var(--text-secondary)]">Bureau: </span>
                        <strong className="text-[var(--text)]">{result.caseItem.bureau}</strong>
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)]">Category: </span>
                        <strong className="text-[var(--text)] capitalize">{result.caseItem.category}</strong>
                      </div>
                      {result.caseItem.institution && (
                        <div>
                          <span className="text-[var(--text-secondary)]">Institution: </span>
                          <strong className="text-[var(--text)]">{result.caseItem.institution.name}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Overlap Detection Evaluation */}
              {result.overlaps.length > 0 ? (
                <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-bg)] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--warning)] flex-shrink-0" aria-hidden="true" />
                    <h4 className="text-sm font-semibold text-[var(--warning)]">
                      Potential Overlapping Cases – Coordination Required
                    </h4>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Detection engine identified <strong className="text-[var(--text)]">{result.overlaps.length}</strong> candidate overlapping case pair(s) concerning this institution across bureaus:
                  </p>

                  <div className="space-y-2 mt-2">
                    {result.overlaps.map((item) => {
                      const otherCase =
                        item.case_a.case_no === result.caseItem.case_no ? item.case_b : item.case_a;

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
                            onClick={onClose}
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
              ) : (
                <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)] flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[var(--success)] flex-shrink-0" aria-hidden="true" />
                  <div>
                    <span className="font-semibold text-[var(--text)]">No overlapping cases found. </span>
                    <span>No cross-bureau duplicates or related grievances were detected for this institution.</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setPermanentId('');
                    setSelectedInstitution(null);
                    setDescription('');
                    setAssignedOfficer('');
                    setExpectedDisposalDate('');
                    setIsSearchingInst(true);
                  }}
                  className="text-xs font-medium text-[var(--brand)] hover:underline cursor-pointer"
                >
                  + Register another complaint
                </button>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/cases/${result.caseItem.case_no}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] transition"
                  >
                    <span>Open Case File</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    onClick={onClose}
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
                  Institution <span className="text-[var(--danger)]">*</span>
                </label>

                {selectedInstitution ? (
                  <div className="p-3 bg-[var(--brand-subtle)] border border-[var(--brand)]/20 rounded-lg flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text)] truncate">
                        <Building2 className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" aria-hidden="true" />
                        <span className="truncate">{selectedInstitution.name}</span>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[var(--brand)] font-medium">
                          {selectedInstitution.permanent_id}
                        </span>
                        <span>•</span>
                        <span>{selectedInstitution.region} Region</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearInstitution}
                      disabled={submitting}
                      className="text-xs font-medium text-[var(--brand)] hover:underline cursor-pointer shrink-0"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-[var(--text-tertiary)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        aria-label="Search institution by name or permanent ID"
                        placeholder="Search institution by name or permanent ID (e.g. 1-1002)..."
                        value={instSearchQuery}
                        onChange={(e) => setInstSearchQuery(e.target.value)}
                        disabled={submitting}
                        className={`w-full h-10 pl-9 pr-8 bg-[var(--bg-surface)] border rounded-lg text-xs text-[var(--text)] placeholder:text-[var(--text-tertiary)] transition ${
                          formErrors.permanentId
                            ? 'border-[var(--danger)] bg-[var(--danger-bg)]/30'
                            : 'border-[var(--border-input)]'
                        }`}
                      />
                      {instLoading && (
                        <Loader2 className="w-3.5 h-3.5 text-[var(--brand)] animate-spin absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                      )}
                    </div>

                    {formErrors.permanentId && (
                      <p className="text-xs text-[var(--danger)] font-medium">{formErrors.permanentId}</p>
                    )}

                    {/* Results list */}
                    <div className="border border-[var(--border)] rounded-lg max-h-44 overflow-y-auto divide-y divide-[var(--border)] bg-[var(--bg-surface)]">
                      {instResults.length > 0 ? (
                        instResults.map((inst) => (
                          <button
                            key={inst.permanent_id}
                            type="button"
                            onClick={() => handleSelectInstitution(inst)}
                            className="w-full text-left px-3 py-2 hover:bg-[var(--brand-subtle)] transition flex items-center justify-between gap-2 text-xs group cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-[var(--text)] group-hover:text-[var(--brand)] truncate">
                                {inst.name}
                              </div>
                              <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[var(--brand)] font-medium">{inst.permanent_id}</span>
                                <span>•</span>
                                <span>{inst.region} Region</span>
                              </div>
                            </div>
                            <span className="text-xs font-medium text-[var(--brand)] bg-[var(--brand-subtle)] border border-[var(--brand)]/30 px-2 py-0.5 rounded group-hover:bg-[var(--brand)] group-hover:text-white transition">
                              Select
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center text-xs text-[var(--text-tertiary)] italic">
                          {instLoading ? 'Searching institutions...' : 'No institutions match query.'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Bureau & Category Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Bureau selection */}
                <div>
                  <label htmlFor="new-case-bureau" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Bureau <span className="text-[var(--danger)]">*</span>
                  </label>
                  {isOfficer ? (
                    <div className="relative">
                      <select
                        id="new-case-bureau"
                        value={officerBureau}
                        disabled={true}
                        className="w-full h-10 text-xs bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 text-[var(--text-secondary)] cursor-not-allowed appearance-none"
                      >
                        <option value={officerBureau}>{officerBureau} (Your Bureau)</option>
                      </select>
                      <Lock className="w-3.5 h-3.5 text-[var(--text-tertiary)] absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
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
                  {isOfficer && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-[var(--text-tertiary)]" aria-hidden="true" />
                      <span>Limited to your assigned bureau ({officerBureau}).</span>
                    </p>
                  )}
                </div>

                {/* Category selection */}
                <div>
                  <label htmlFor="new-case-category" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Category <span className="text-[var(--danger)]">*</span>
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
                  onClick={onClose}
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
