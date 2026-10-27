import React from 'react';
import { AlertTriangle, RefreshCw, FolderOpen, Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading data...',
  className = '',
}) => {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center py-16 px-4 text-center ${className}`}
    >
      <div
        className="w-10 h-10 rounded-lg bg-[var(--brand-subtle)] border border-[var(--border)] flex items-center justify-center text-[var(--brand)] mb-3"
        aria-hidden="true"
      >
        <Loader2 className="w-5 h-5 animate-spin text-[var(--brand)]" />
      </div>
      <p className="text-sm font-semibold text-[var(--text)]">{message}</p>
      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Fetching latest records from CaseBridge API</p>
    </div>
  );
};

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load content',
  message = 'An unexpected error occurred while fetching information from the backend.',
  onRetry,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-[#FECDCA] bg-[#FEF3F2] p-6 text-center max-w-xl mx-auto my-6 shadow-xs ${className}`}
    >
      <div
        className="w-10 h-10 rounded-lg bg-[#FEE4E2] text-[#B42318] flex items-center justify-center mx-auto mb-2.5"
        aria-hidden="true"
      >
        <AlertTriangle className="w-5 h-5 text-[#B42318]" />
      </div>
      <h3 className="text-sm font-bold text-[#B42318] mb-1">{title}</h3>
      <p className="text-xs text-[#475467] mb-4 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#B42318] text-white hover:bg-[#912018] transition shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Try Again</span>
        </button>
      )}
    </div>
  );
};

interface EmptyStateProps {
  title?: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No records found',
  message = 'There are currently no items matching your criteria in the system.',
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center rounded-xl border border-dashed border-[var(--border)] bg-white my-4 ${className}`}
    >
      <div
        className="w-10 h-10 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-tertiary)] flex items-center justify-center mb-2.5"
        aria-hidden="true"
      >
        <FolderOpen className="w-5 h-5 text-[var(--text-tertiary)]" />
      </div>
      <h3 className="text-sm font-semibold text-[var(--text)] mb-1">{title}</h3>
      <p className="text-xs text-[var(--text-secondary)] max-w-sm mb-3 leading-relaxed">{message}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
