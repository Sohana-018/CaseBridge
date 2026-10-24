import React from 'react';
import { AlertCircle, ArrowRightLeft, CheckCircle, Clock, Flame, ShieldAlert } from 'lucide-react';

interface StatusChipProps {
  status: string;
  className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, className = '' }) => {
  const norm = (status || '').toLowerCase().trim();

  switch (norm) {
    case 'pending':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 ${className}`}>
          <Clock className="w-3 h-3 text-amber-600" />
          Pending
        </span>
      );
    case 'under_process':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
          Under Process
        </span>
      );
    case 'disposed':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 ${className}`}>
          <CheckCircle className="w-3 h-3 text-emerald-600" />
          Disposed
        </span>
      );
    case 'transferred':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 ${className}`}>
          <ArrowRightLeft className="w-3 h-3 text-purple-600" />
          Transferred
        </span>
      );
    case 'escalated':
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 ${className}`}>
          <Flame className="w-3 h-3 text-rose-600" />
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
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200 ${className}`}>
          <AlertCircle className="w-3 h-3 text-rose-600" />
          High
        </span>
      );
    case 'medium':
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 ${className}`}>
          Medium
        </span>
      );
    case 'low':
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 ${className}`}>
          Low
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 ${className}`}>
          {priority}
        </span>
      );
  }
};

export const BureauBadge: React.FC<{ bureau: string; className?: string }> = ({ bureau, className = '' }) => {
  const colors: Record<string, string> = {
    RB: 'bg-blue-50 text-blue-700 border-blue-200',
    PGRC: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    RO: 'bg-orange-50 text-orange-700 border-orange-200',
    OC: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  const style = colors[bureau] || 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold border ${style} ${className}`}>
      {bureau}
    </span>
  );
};

export const OverdueBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-rose-600 text-white shadow-xs ${className}`}>
      <ShieldAlert className="w-3 h-3" />
      OVERDUE
    </span>
  );
};
