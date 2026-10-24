import { Layers, ShieldCheck } from 'lucide-react';

export const Navbar = () => {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-xl tracking-tight text-slate-900">CaseBridge</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                Phase 0
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Integrated Institution Complaint Monitoring Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>AICTE Demo Environment</span>
          </div>
        </div>
      </div>
    </header>
  );
};
