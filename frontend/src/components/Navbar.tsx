import React from 'react';
import { NavLink } from 'react-router-dom';
import { Layers, Building2, LayoutDashboard, UserCheck } from 'lucide-react';
import { getCurrentUser } from '../api/client';

export const Navbar: React.FC = () => {
  const user = getCurrentUser();

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-6">
          <NavLink to="/" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-100 group-hover:scale-105 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-slate-900">CaseBridge</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  AICTE
                </span>
              </div>
            </div>
          </NavLink>

          {/* Nav Links */}
          <nav className="flex items-center space-x-1 sm:space-x-2">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`
              }
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview</span>
            </NavLink>

            <NavLink
              to="/institutions"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`
              }
            >
              <Building2 className="w-4 h-4" />
              <span>Institutions</span>
            </NavLink>
          </nav>
        </div>

        {/* User / Demo Status */}
        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200 text-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <UserCheck className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-600">Role:</span>
            <span className="font-semibold text-slate-800 capitalize">
              {user?.role || 'Coordinator'}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium">
            <span>Demo Session</span>
          </div>
        </div>
      </div>
    </header>
  );
};
