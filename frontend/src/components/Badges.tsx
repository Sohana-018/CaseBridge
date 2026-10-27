import React from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle,
  Clock,
  Copy,
  Flame,
  HelpCircle,
  Link2,
  Lock,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

interface StatusChipProps {
  status: string;
  className?: string;
}

/**
 * Tactile status chips inspired by modern Dribbble pill design:
 * Soft gradient washes, subtle colored ambient shadows, crisp micro-borders.
 */
export const StatusChip: React.FC<StatusChipProps> = ({ status, className = '' }) => {
  const norm = (status || '').toLowerCase().trim();

  switch (norm) {
    case 'pending':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-50 to-orange-50 text-amber-900 border border-amber-300/80 shadow-[0_2px_6px_rgba(245,158,11,0.15)] transition-all ${className}`}
        >
          <Clock className="w-3 h-3 text-amber-600 shrink-0" />
          <span>Pending</span>
        </span>
      );
    case 'under_process':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-900 border border-blue-300/80 shadow-[0_2px_6px_rgba(59,130,246,0.15)] transition-all ${className}`}
        >
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse shrink-0"></span>
          <span>Under Process</span>
        </span>
      );
    case 'disposed':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-900 border border-emerald-300/80 shadow-[0_2px_6px_rgba(16,185,129,0.15)] transition-all ${className}`}
        >
          <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
          <span>Disposed</span>
        </span>
      );
    case 'transferred':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 border border-slate-300 shadow-[0_2px_6px_rgba(100,116,139,0.1)] transition-all ${className}`}
        >
          <ArrowRightLeft className="w-3 h-3 text-slate-500 shrink-0" />
          <span>Transferred</span>
        </span>
      );
    case 'escalated':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-purple-50 via-fuchsia-50 to-rose-50 text-purple-900 border border-purple-300 shadow-[0_2px_6px_rgba(168,85,247,0.18)] transition-all ${className}`}
        >
          <Flame className="w-3 h-3 text-purple-600 shrink-0" />
          <span>Escalated</span>
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs ${className}`}
        >
          {status}
        </span>
      );
  }
};

export const PriorityChip: React.FC<{ priority?: string; className?: string }> = ({
  priority,
  className = '',
}) => {
  const norm = (priority || 'medium').toLowerCase().trim();

  switch (norm) {
    case 'high':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gradient-to-r from-rose-50 to-red-50 text-rose-900 border border-rose-300 shadow-[0_2px_6px_rgba(244,63,94,0.15)] ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" />
          <span>Priority: High</span>
        </span>
      );
    case 'medium':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-900 border border-amber-300 shadow-[0_2px_6px_rgba(245,158,11,0.12)] ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
          <span>Priority: Medium</span>
        </span>
      );
    case 'low':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
          <span>Priority: Low</span>
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 ${className}`}
        >
          Priority: {priority}
        </span>
      );
  }
};

export const RestrictedBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-1 text-slate-400 font-normal italic text-xs ${className}`}>
      <Lock className="w-3 h-3 text-slate-400 shrink-0" />
      <span>Restricted</span>
    </span>
  );
};

export const BureauBadge: React.FC<{ bureau: string; className?: string }> = ({
  bureau,
  className = '',
}) => {
  const styles: Record<string, string> = {
    RB: 'bg-blue-50 text-blue-900 border-blue-300 shadow-[0_2px_6px_rgba(30,58,138,0.10)]',
    PGRC: 'bg-teal-50 text-teal-900 border-teal-300 shadow-[0_2px_6px_rgba(13,148,136,0.10)]',
    RO: 'bg-amber-50 text-amber-900 border-amber-300 shadow-[0_2px_6px_rgba(217,119,6,0.10)]',
    OC: 'bg-indigo-50 text-indigo-900 border-indigo-300 shadow-[0_2px_6px_rgba(79,70,229,0.10)]',
  };

  const style = styles[bureau] || 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border tracking-wide ${style} ${className}`}
    >
      {bureau}
    </span>
  );
};

export const OverdueBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-red-600 to-rose-600 text-white border border-red-700 shadow-[0_2px_8px_rgba(239,68,68,0.35)] animate-pulse ${className}`}
    >
      <ShieldAlert className="w-3 h-3 text-white shrink-0" />
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
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-rose-50 via-pink-50 to-red-50 text-rose-900 border border-rose-300 shadow-[0_2px_8px_rgba(244,63,94,0.18)] ${className}`}
        >
          <Flame className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>High Confidence</span>
        </span>
      );
    case 'medium':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-900 border border-amber-300 shadow-[0_2px_8px_rgba(245,158,11,0.15)] ${className}`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>Medium Confidence</span>
        </span>
      );
    case 'low':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs ${className}`}
        >
          <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0"></span>
          <span>Low Confidence</span>
        </span>
      );
  }
};

export const ReviewStatusBadge: React.FC<{ status?: string; className?: string }> = ({
  status,
  className = '',
}) => {
  const norm = (status || 'open').toLowerCase().trim();

  switch (norm) {
    case 'open':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-300 shadow-[0_2px_6px_rgba(59,130,246,0.15)] select-none ${className}`}
          title="Review Status: Open"
        >
          <Clock className="w-3 h-3 text-blue-600 shrink-0" />
          <span>Open Review</span>
        </span>
      );
    case 'related':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-900 border border-indigo-300 shadow-[0_2px_6px_rgba(99,102,241,0.15)] ${className}`}
        >
          <Link2 className="w-3 h-3 text-indigo-600 shrink-0" />
          <span>Related Cases</span>
        </span>
      );
    case 'duplicate':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-purple-50 to-fuchsia-50 text-purple-900 border border-purple-300 shadow-[0_2px_6px_rgba(168,85,247,0.15)] ${className}`}
        >
          <Copy className="w-3 h-3 text-purple-600 shrink-0" />
          <span>Duplicate</span>
        </span>
      );
    case 'not_related':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs ${className}`}
        >
          <XCircle className="w-3 h-3 text-slate-500 shrink-0" />
          <span>Not Related</span>
        </span>
      );
    case 'needs_review':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-amber-50 to-orange-50 text-amber-900 border border-amber-300 shadow-[0_2px_6px_rgba(245,158,11,0.12)] ${className}`}
        >
          <HelpCircle className="w-3 h-3 text-amber-600 shrink-0" />
          <span>Needs More Review</span>
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 ${className}`}
        >
          {status}
        </span>
      );
  }
};
