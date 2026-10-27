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
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89] ${className}`}
        >
          <Clock className="w-3 h-3 text-[#B54708] shrink-0" aria-hidden="true" />
          <span>Pending</span>
        </span>
      );
    case 'under_process':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#EFF8FF] text-[#175CD3] border border-[#B2DDFF] ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#175CD3] shrink-0" aria-hidden="true" />
          <span>Under Process</span>
        </span>
      );
    case 'disposed':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#ECFDF3] text-[#067647] border border-[#A6F4C5] ${className}`}
        >
          <CheckCircle2 className="w-3 h-3 text-[#067647] shrink-0" aria-hidden="true" />
          <span>Disposed</span>
        </span>
      );
    case 'transferred':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F2F4F7] text-[#344054] border border-[#EAECF0] ${className}`}
        >
          <ArrowRightLeft className="w-3 h-3 text-[#344054] shrink-0" aria-hidden="true" />
          <span>Transferred</span>
        </span>
      );
    case 'escalated':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F9F5FF] text-[#6941C6] border border-[#E9D7FE] ${className}`}
        >
          <Flame className="w-3 h-3 text-[#6941C6] shrink-0" aria-hidden="true" />
          <span>Escalated</span>
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F2F4F7] text-[#344054] border border-[#EAECF0] ${className}`}
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
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA] ${className}`}
      >
        <ArrowUp className="w-3 h-3 text-[#B42318] shrink-0" aria-hidden="true" />
        <span>Priority: High</span>
      </span>
    );
  }

  if (norm === 'low') {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-[#475467] bg-[#F2F4F7] border border-[#EAECF0] ${className}`}
      >
        <span>Priority: Low</span>
      </span>
    );
  }

  // Medium (default): plain neutral text, never amber
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-[#475467] bg-[#F2F4F7] border border-[#EAECF0] ${className}`}
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
 * Bureau chip: quiet rectangular chip (6px radius, neutral-bg, neutral text, no mono).
 */
export const BureauBadge: React.FC<{ bureau: string; className?: string }> = ({
  bureau,
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-[#F2F4F7] text-[#344054] border border-[#EAECF0] ${className}`}
    >
      {bureau}
    </span>
  );
};

/**
 * Overdue Badge: Danger token, text + icon, no pulse glow.
 */
export const OverdueBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA] ${className}`}
    >
      <ShieldAlert className="w-3 h-3 text-[#B42318] shrink-0" aria-hidden="true" />
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
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA] ${className}`}
        >
          <Flame className="w-3 h-3 text-[#B42318] shrink-0" aria-hidden="true" />
          <span>High Confidence</span>
        </span>
      );
    case 'medium':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89] ${className}`}
        >
          <AlertCircle className="w-3 h-3 text-[#B54708] shrink-0" aria-hidden="true" />
          <span>Medium Confidence</span>
        </span>
      );
    case 'low':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-[#F2F4F7] text-[#475467] border border-[#EAECF0] ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#667085] shrink-0" aria-hidden="true" />
          <span>Low Confidence</span>
        </span>
      );
  }
};

/**
 * Review Status Badge for Overlap decisions:
 * Distinct, non-status colors:
 * - Related = brand
 * - Duplicate = danger
 * - Not Related = neutral
 * - Needs Review = warning
 * - Open = light neutral
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
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-[#F2F4F7] text-[#344054] border border-[#EAECF0] select-none ${className}`}
        >
          <Clock className="w-3 h-3 text-[#667085] shrink-0" aria-hidden="true" />
          <span>Open Review</span>
        </span>
      );
    case 'related':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-[#EEF2FF] text-[#1E3A8A] border border-[#C7D7FE] ${className}`}
        >
          <Link2 className="w-3 h-3 text-[#1E3A8A] shrink-0" aria-hidden="true" />
          <span>Related Cases</span>
        </span>
      );
    case 'duplicate':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA] ${className}`}
        >
          <Copy className="w-3 h-3 text-[#B42318] shrink-0" aria-hidden="true" />
          <span>Duplicate</span>
        </span>
      );
    case 'not_related':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-[#F2F4F7] text-[#344054] border border-[#EAECF0] ${className}`}
        >
          <XCircle className="w-3 h-3 text-[#667085] shrink-0" aria-hidden="true" />
          <span>Not Related</span>
        </span>
      );
    case 'needs_review':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-[#FFFAEB] text-[#B54708] border border-[#FEDF89] ${className}`}
        >
          <HelpCircle className="w-3 h-3 text-[#B54708] shrink-0" aria-hidden="true" />
          <span>Needs More Review</span>
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-[#F2F4F7] text-[#344054] border border-[#EAECF0] ${className}`}
        >
          {status}
        </span>
      );
  }
};

/**
 * Signal Chip: quiet rectangular chip for explainability tags, formatted nicely.
 */
export const SignalChip: React.FC<{ signal: string; className?: string }> = ({
  signal,
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[6px] bg-[#F2F4F7] text-[#344054] text-xs font-medium border border-[#EAECF0] ${className}`}
    >
      {formatSignal(signal)}
    </span>
  );
};
