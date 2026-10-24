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
    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${className}`}>
      <div className="w-10 h-10 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-900 mb-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-900" />
      </div>
      <p className="text-sm font-semibold text-slate-700">{message}</p>
      <p className="text-xs text-slate-400 mt-0.5">Connecting to CaseBridge API</p>
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
    <div className={`rounded-md border border-red-200 bg-red-50/70 p-6 text-center max-w-xl mx-auto my-6 shadow-xs ${className}`}>
      <div className="w-10 h-10 rounded-md bg-red-100 text-red-700 flex items-center justify-center mx-auto mb-2.5">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-bold text-red-950 mb-1">{title}</h3>
      <p className="text-xs text-red-800 mb-4 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-red-700 text-white hover:bg-red-800 transition shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
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
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center rounded-md border border-dashed border-slate-200 bg-white my-4 ${className}`}>
      <div className="w-10 h-10 rounded-md bg-slate-100 text-slate-400 flex items-center justify-center mb-2.5">
        <FolderOpen className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 max-w-sm mb-3 leading-relaxed">{message}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
