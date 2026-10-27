import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer id="footer" className="mt-auto border-t border-[var(--border)] bg-white py-5">
      <div className="cb-page-container !py-0 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] font-medium">
          <span className="w-2 h-2 rounded-full bg-[var(--brand)] inline-block" aria-hidden="true" />
          <span id="footer-synthetic-tag" className="font-semibold text-[var(--text)]">
            CaseBridge · Regulatory Grievance Monitoring System
          </span>
        </div>
        <div className="text-xs text-[var(--text-tertiary)]">
          Central Registry Demo Data · Verified Compliance
        </div>
      </div>
    </footer>
  );
};
