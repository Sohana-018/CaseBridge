import { ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer id="footer" className="mt-auto border-t border-slate-200 bg-white py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-2 text-sm text-slate-600 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span id="footer-official-tag" className="font-semibold text-slate-800">
            AICTE Grievance Monitoring Platform
          </span>
        </div>
        <div className="text-xs text-slate-500">
          CaseBridge · Central Grievance Monitoring & Tracking System
        </div>
      </div>
    </footer>
  );
};
