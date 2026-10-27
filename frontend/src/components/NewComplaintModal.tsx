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
import {
  X,
  Building2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Loader2,
  ExternalLink,
  Tag,
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

  const formatReasonTag = (reason: string) => {
    if (reason === 'same_permanent_id') return 'Same Permanent ID';
    if (reason === 'same_category') return 'Same Complaint Category';
    if (reason === 'related_category') return 'Related Category Area';
    if (reason === 'shared_reference') return 'Shared Case / Letter Reference';
    if (reason.startsWith('text_similarity')) {
      const val = reason.split(' ')[1];
      const pct = val ? Math.round(parseFloat(val) * 100) : '';
      return `Text Similarity (${pct}%)`;
    }
    if (reason.startsWith('date_proximity')) {
      const parts = reason.split(' ');
      const days = parts[1] || '';
      return `Received within ${days} days`;
    }
    return reason.replace(/_/g, ' ');
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
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col my-auto transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center shadow-xs">
              <FilePlus className="w-4 h-4" />
            </div>
            <div>
              <h2 id="new-complaint-title" className="text-base font-bold text-slate-900 tracking-tight">
                {result ? 'Complaint Registration Status' : 'Register New Complaint'}
              </h2>
              <p className="text-xs text-slate-500">
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
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition disabled:opacity-40 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto max-h-[calc(85vh-120px)]">
          {/* Result Panel State */}
          {result ? (
            <div className="space-y-4">
              {/* Complaint Registered Banner */}
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 shadow-xs">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-emerald-950">
                      Complaint registered: {result.caseItem.case_no}
                    </h3>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      The complaint has been successfully created and an initial case event was appended.
                    </p>
                    <div className="mt-2.5 pt-2 border-t border-emerald-200/60 flex items-center gap-3 flex-wrap text-xs">
                      <div>
                        <span className="text-slate-500">Bureau: </span>
                        <strong className="text-slate-800 font-mono">{result.caseItem.bureau}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Category: </span>
                        <strong className="text-slate-800 capitalize">{result.caseItem.category}</strong>
                      </div>
                      {result.caseItem.institution && (
                        <div>
                          <span className="text-slate-500">Institution: </span>
                          <strong className="text-slate-800">{result.caseItem.institution.name}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Overlap Detection Evaluation */}
              {result.overlaps.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 space-y-3 shadow-xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
                    <h4 className="text-sm font-bold text-amber-950">
                      Potential Overlapping Cases – Coordination Required
                    </h4>
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    Detection engine identified <strong>{result.overlaps.length}</strong> candidate overlapping case pair(s) concerning this institution across bureaus:
                  </p>

                  <div className="space-y-2 mt-2">
                    {result.overlaps.map((item) => {
                      const otherCase =
                        item.case_a.case_no === result.caseItem.case_no ? item.case_b : item.case_a;

                      return (
                        <div
                          key={item.id}
                          className="p-3 bg-white border border-amber-200 rounded-md shadow-2xs text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-slate-900">Pair #{item.id}</span>
                              <ConfidenceBandBadge band={item.band} />
                              <span className="text-slate-500">Overlaps with:</span>
                              <span className="font-mono font-semibold text-blue-900">{otherCase.case_no}</span>
                              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {otherCase.bureau}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              <span className="text-[11px] text-slate-500 font-medium">Why flagged:</span>
                              {item.reasons && item.reasons.length > 0 ? (
                                item.reasons.map((r, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                                  >
                                    <Tag className="w-2.5 h-2.5 text-slate-400" />
                                    {formatReasonTag(r)}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Same-institution match</span>
                              )}
                            </div>
                          </div>

                          <Link
                            to={`/overlaps#overlap-${item.id}`}
                            onClick={onClose}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-900 hover:text-blue-700 hover:underline shrink-0"
                          >
                            <span>View in Queue</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-600 flex items-center gap-2.5 shadow-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-800">No overlapping cases found. </span>
                    <span>No cross-bureau duplicates or related grievances were detected for this institution.</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
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
                  className="text-xs font-semibold text-blue-900 hover:underline cursor-pointer"
                >
                  + Register another complaint
                </button>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/cases/${result.caseItem.case_no}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold bg-blue-900 text-white hover:bg-blue-800 transition shadow-xs"
                  >
                    <span>Open Case File</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-md text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition cursor-pointer"
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
                  className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2.5 shadow-xs"
                >
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-bold">Failed to register complaint</div>
                    <div className="text-red-800 mt-0.5 leading-relaxed">{submitError}</div>
                  </div>
                </div>
              )}

              {/* Institution Selection (Searchable select by name or permanent ID) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Institution <span className="text-red-500">*</span>
                </label>

                {selectedInstitution ? (
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center justify-between gap-3 shadow-2xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 truncate">
                        <Building2 className="w-3.5 h-3.5 text-blue-900 shrink-0" />
                        <span className="truncate">{selectedInstitution.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-blue-900 font-medium">
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
                      className="text-xs font-semibold text-blue-900 hover:text-blue-700 hover:underline cursor-pointer shrink-0"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search institution by name or permanent ID (e.g. 1-1002)..."
                        value={instSearchQuery}
                        onChange={(e) => setInstSearchQuery(e.target.value)}
                        disabled={submitting}
                        className={`w-full pl-9 pr-8 py-2 bg-slate-50 border rounded-md text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-900 focus:bg-white transition ${
                          formErrors.permanentId ? 'border-red-400 bg-red-50/30' : 'border-slate-300'
                        }`}
                      />
                      {instLoading && (
                        <Loader2 className="w-3.5 h-3.5 text-blue-900 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                      )}
                    </div>

                    {formErrors.permanentId && (
                      <p className="text-[11px] text-red-600 font-medium">{formErrors.permanentId}</p>
                    )}

                    {/* Results list */}
                    <div className="border border-slate-200 rounded-md max-h-44 overflow-y-auto divide-y divide-slate-100 bg-white shadow-2xs">
                      {instResults.length > 0 ? (
                        instResults.map((inst) => (
                          <button
                            key={inst.permanent_id}
                            type="button"
                            onClick={() => handleSelectInstitution(inst)}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50/80 transition flex items-center justify-between gap-2 text-xs group cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-slate-800 group-hover:text-blue-950 truncate">
                                {inst.name}
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-blue-900">{inst.permanent_id}</span>
                                <span>•</span>
                                <span>{inst.region} Region</span>
                              </div>
                            </div>
                            <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded group-hover:bg-blue-900 group-hover:text-white transition">
                              Select
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center text-xs text-slate-400 italic">
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
                  <label htmlFor="new-case-bureau" className="block text-xs font-semibold text-slate-700 mb-1">
                    Bureau <span className="text-red-500">*</span>
                  </label>
                  {isOfficer ? (
                    <div className="relative">
                      <select
                        id="new-case-bureau"
                        value={officerBureau}
                        disabled={true}
                        className="w-full text-xs bg-slate-100 border border-slate-300 rounded-md px-3 py-2 text-slate-700 cursor-not-allowed appearance-none"
                      >
                        <option value={officerBureau}>{officerBureau} (Your Bureau)</option>
                      </select>
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    </div>
                  ) : (
                    <select
                      id="new-case-bureau"
                      value={bureau}
                      onChange={(e) => setBureau(e.target.value)}
                      disabled={submitting}
                      className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900 cursor-pointer shadow-2xs"
                    >
                      {BUREAUS.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {isOfficer && (
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-400" />
                      <span>Limited to your assigned bureau ({officerBureau}).</span>
                    </p>
                  )}
                </div>

                {/* Category selection */}
                <div>
                  <label htmlFor="new-case-category" className="block text-xs font-semibold text-slate-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="new-case-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={submitting}
                    className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900 cursor-pointer shadow-2xs"
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
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="new-case-description" className="block text-xs font-semibold text-slate-700">
                    Complaint Description <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Required</span>
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
                  className={`w-full text-xs bg-white border rounded-md p-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-900 transition ${
                    formErrors.description ? 'border-red-400 bg-red-50/20' : 'border-slate-300'
                  }`}
                />
                {formErrors.description && (
                  <p className="text-[11px] text-red-600 font-medium mt-1">{formErrors.description}</p>
                )}
              </div>

              {/* Optional Fields: Assigned Officer & Expected Disposal Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label htmlFor="new-case-officer" className="block text-xs font-semibold text-slate-700 mb-1">
                    Assigned Officer <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="new-case-officer"
                    type="text"
                    value={assignedOfficer}
                    onChange={(e) => setAssignedOfficer(e.target.value)}
                    disabled={submitting}
                    placeholder="e.g. Dr. A. Sharma"
                    className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div>
                  <label htmlFor="new-case-expected-date" className="block text-xs font-semibold text-slate-700 mb-1">
                    Expected Disposal Date <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="new-case-expected-date"
                    type="date"
                    value={expectedDisposalDate}
                    onChange={(e) => setExpectedDisposalDate(e.target.value)}
                    disabled={submitting}
                    className="w-full text-xs bg-white border border-slate-300 rounded-md px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-900 cursor-pointer"
                  />
                </div>
              </div>

              {/* Progress Indicator when Submitting */}
              {submitting && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2.5 text-xs text-blue-900 font-medium">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-800 shrink-0" />
                  <span>{submitStep || 'Processing...'}</span>
                </div>
              )}

              {/* Submit / Cancel Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 rounded-md text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold bg-blue-900 text-white hover:bg-blue-800 disabled:opacity-50 transition shadow-xs cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
