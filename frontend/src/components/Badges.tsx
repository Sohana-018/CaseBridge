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
 * Status chips aligned with the government dashboard palette:
 * - pending: amber
 * - under process: blue
 * - disposed: green
 * - transferred: gray
 * - escalated: purple
 * - overdue: red
 */
export const StatusChip: React.FC<StatusChipProps> = ({ status, className = '' }) => {
  const norm = (status || '').toLowerCase().trim();

  switch (norm) {
    case 'pending':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 ${className}`}>
          <Clock className="w-3 h-3 text-amber-600" />
          Pending
        </span>
      );
    case 'under_process':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
          Under Process
        </span>
      );
    case 'disposed':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 ${className}`}>
          <CheckCircle className="w-3 h-3 text-emerald-600" />
          Disposed
        </span>
      );
    case 'transferred':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300 ${className}`}>
          <ArrowRightLeft className="w-3 h-3 text-slate-500" />
          Transferred
        </span>
      );
    case 'escalated':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-800 border border-purple-200 ${className}`}>
          <Flame className="w-3 h-3 text-purple-600" />
          Escalated
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 ${className}`}>
          {status}
        </span>
      );
  }
};

export const PriorityChip: React.FC<{ priority?: string; className?: string }> = ({ priority, className = '' }) => {
  const norm = (priority || 'medium').toLowerCase().trim();

  switch (norm) {
    case 'high':
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-800 border border-red-200 ${className}`}>
          <AlertCircle className="w-3 h-3 text-red-600" />
          Priority: High
        </span>
      );
    case 'medium':
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 ${className}`}>
          Priority: Medium
        </span>
      );
    case 'low':
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 ${className}`}>
          Priority: Low
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 ${className}`}>
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

export const BureauBadge: React.FC<{ bureau: string; className?: string }> = ({ bureau, className = '' }) => {
  const colors: Record<string, string> = {
    RB: 'bg-blue-50 text-blue-800 border-blue-200',
    PGRC: 'bg-teal-50 text-teal-800 border-teal-200',
    RO: 'bg-amber-50 text-amber-800 border-amber-200',
    OC: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  };

  const style = colors[bureau] || 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border ${style} ${className}`}>
      {bureau}
    </span>
  );
};

export const OverdueBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200 ${className}`}>
      <ShieldAlert className="w-3 h-3 text-red-600" />
      Overdue
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
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 ${className}`}
        >
          <Flame className="w-3 h-3 text-rose-600" />
          High Confidence
        </span>
      );
    case 'medium':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 ${className}`}
        >
          <AlertCircle className="w-3 h-3 text-amber-600" />
          Medium Confidence
        </span>
      );
    case 'low':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          Low Confidence
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
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200 select-none ${className}`}
          title="Review Status: Open"
        >
          <Clock className="w-3 h-3 text-blue-600" />
          Open
        </span>
      );
    case 'related':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 ${className}`}
        >
          <Link2 className="w-3 h-3 text-indigo-600" />
          Related
        </span>
      );
    case 'duplicate':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200 ${className}`}
        >
          <Copy className="w-3 h-3 text-purple-600" />
          Duplicate
        </span>
      );
    case 'not_related':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300 ${className}`}
        >
          <XCircle className="w-3 h-3 text-slate-500" />
          Not Related
        </span>
      );
    case 'needs_review':
      return (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 ${className}`}
        >
          <HelpCircle className="w-3 h-3 text-amber-600" />
          Needs More Review
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

