import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer id="footer" className="mt-auto border-t border-slate-200 bg-white py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-2 text-xs text-slate-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
          <span id="footer-synthetic-tag" className="font-semibold text-slate-800">
            Integrated Grievance & Regulatory Coordination System
          </span>
        </div>
        <div className="text-xs text-slate-500">
          Institution Complaint Monitoring System
        </div>
      </div>
    </footer>
  );
};
