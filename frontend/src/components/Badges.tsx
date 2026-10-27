import React from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Flame,
  HelpCircle,
  Link2,
  Lock,
  ShieldAlert,
  XCircle,
  ArrowUp,
  Copy,
} from 'lucide-react';
import { formatStatus, formatSignal } from '../utils/formatters';

interface StatusChipProps {
  status: string;
  className?: string;
}

/**
 * Status badge = dot or icon + text on its tinted background.
 * Pill shape (rounded-full) is reserved ONLY for statuses.
 */
export const StatusChip: React.FC<StatusChipProps> = ({ status, className = '' }) => {
  const norm = (status || '').toLowerCase().trim();

  switch (norm) {
    case 'pending':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs ${className}`}
        >
          <Clock className="w-3 h-3 text-amber-800 shrink-0" aria-hidden="true" />
          <span>Pending</span>
        </span>
      );
    case 'under_process':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-950 border border-sky-300 shadow-2xs ${className}`}
        >
          <span className="w-2 h-2 rounded-full bg-sky-600 shrink-0" aria-hidden="true" />
          <span>Under Process</span>
        </span>
      );
    case 'disposed':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-2xs ${className}`}
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>Disposed</span>
        </span>
      );
    case 'transferred':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-950 border border-indigo-300 shadow-2xs ${className}`}
        >
          <ArrowRightLeft className="w-3 h-3 text-indigo-700 shrink-0" aria-hidden="true" />
          <span>Transferred</span>
        </span>
      );
    case 'escalated':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-950 border border-purple-300 shadow-2xs ${className}`}
        >
          <Flame className="w-3 h-3 text-purple-700 shrink-0" aria-hidden="true" />
          <span>Escalated</span>
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-300 ${className}`}
        >
          {formatStatus(status)}
        </span>
      );
  }
};

/**
 * Priority Chip: Only High gets colour (danger, with an up-arrow icon).
 * Medium and Low are plain neutral text with no amber/warning color.
 */
export const PriorityChip: React.FC<{ priority?: string; className?: string }> = ({
  priority,
  className = '',
}) => {
  const norm = (priority || 'medium').toLowerCase().trim();

  if (norm === 'high') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs ${className}`}
      >
        <ArrowUp className="w-3 h-3 text-rose-700 shrink-0" aria-hidden="true" />
        <span>Priority: High</span>
      </span>
    );
  }

  if (norm === 'low') {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 ${className}`}
      >
        <span>Priority: Low</span>
      </span>
    );
  }

  // Medium (default): subtle warm amber chip
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 ${className}`}
    >
      <span>Priority: Medium</span>
    </span>
  );
};

export const RestrictedBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-1 text-[#667085] font-normal italic text-xs ${className}`}>
      <Lock className="w-3 h-3 text-[#667085] shrink-0" aria-hidden="true" />
      <span>Restricted</span>
    </span>
  );
};

/**
 * Bureau chip: distinctive bureau color coding with WCAG AA compliance.
 */
export const BureauBadge: React.FC<{ bureau: string; className?: string }> = ({
  bureau,
  className = '',
}) => {
  const norm = (bureau || '').toUpperCase().trim();

  switch (norm) {
    case 'RB':
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300 shadow-2xs ${className}`}
        >
          RB
        </span>
      );
    case 'PGRC':
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-xs font-bold bg-teal-100 text-teal-900 border border-teal-300 shadow-2xs ${className}`}
        >
          PGRC
        </span>
      );
    case 'RO':
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-xs font-bold bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs ${className}`}
        >
          RO
        </span>
      );
    case 'OC':
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-xs font-bold bg-purple-100 text-purple-950 border border-purple-300 shadow-2xs ${className}`}
        >
          OC
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 ${className}`}
        >
          {bureau}
        </span>
      );
  }
};

/**
 * Overdue Badge: Danger token, text + icon.
 */
export const OverdueBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs ${className}`}
    >
      <ShieldAlert className="w-3.5 h-3.5 text-rose-700 shrink-0" aria-hidden="true" />
      <span>Overdue</span>
    </span>
  );
};

export const ConfidenceBandBadge: React.FC<{ band?: string; className?: string }> = ({
  band,
  className = '',
}) => {
  const norm = (band || 'low').toLowerCase().trim();

  switch (norm) {
    case 'high':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs ${className}`}
        >
          <Flame className="w-3.5 h-3.5 text-rose-700 shrink-0" aria-hidden="true" />
          <span>High Confidence</span>
        </span>
      );
    case 'medium':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs ${className}`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
          <span>Medium Confidence</span>
        </span>
      );
    case 'low':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-300 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" aria-hidden="true" />
          <span>Low Confidence</span>
        </span>
      );
  }
};

/**
 * Review Status Badge for Overlap decisions:
 */
export const ReviewStatusBadge: React.FC<{ status?: string; className?: string }> = ({
  status,
  className = '',
}) => {
  const norm = (status || 'open').toLowerCase().trim();

  switch (norm) {
    case 'open':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-sky-100 text-sky-950 border border-sky-300 shadow-2xs ${className}`}
        >
          <Clock className="w-3 h-3 text-sky-700 shrink-0" aria-hidden="true" />
          <span>Open Review</span>
        </span>
      );
    case 'related':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-950 border border-blue-300 shadow-2xs ${className}`}
        >
          <Link2 className="w-3 h-3 text-blue-700 shrink-0" aria-hidden="true" />
          <span>Related Cases</span>
        </span>
      );
    case 'duplicate':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-rose-100 text-rose-950 border border-rose-300 shadow-2xs ${className}`}
        >
          <Copy className="w-3 h-3 text-rose-700 shrink-0" aria-hidden="true" />
          <span>Duplicate</span>
        </span>
      );
    case 'not_related':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs ${className}`}
        >
          <XCircle className="w-3 h-3 text-slate-600 shrink-0" aria-hidden="true" />
          <span>Not Related</span>
        </span>
      );
    case 'needs_review':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs ${className}`}
        >
          <HelpCircle className="w-3 h-3 text-amber-700 shrink-0" aria-hidden="true" />
          <span>Needs More Review</span>
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-300 ${className}`}
        >
          {status}
        </span>
      );
  }
};

/**
 * Signal Chip: colorful explainability tags for match reasons.
 */
export const SignalChip: React.FC<{ signal: string; className?: string }> = ({
  signal,
  className = '',
}) => {
  const norm = (signal || '').toLowerCase();
  let colorClasses = 'bg-slate-100 text-slate-800 border-slate-300';

  if (norm.includes('permanent_id')) {
    colorClasses = 'bg-blue-100 text-blue-900 border-blue-300 font-medium';
  } else if (norm.includes('category')) {
    colorClasses = 'bg-teal-100 text-teal-900 border-teal-300 font-medium';
  } else if (norm.includes('similarity')) {
    colorClasses = 'bg-purple-100 text-purple-950 border-purple-300 font-medium';
  } else if (norm.includes('proximity') || norm.includes('date')) {
    colorClasses = 'bg-amber-100 text-amber-950 border-amber-300 font-medium';
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs border shadow-2xs ${colorClasses} ${className}`}
    >
      {formatSignal(signal)}
    </span>
  );
};
