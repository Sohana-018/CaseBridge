import React from 'react';
import { NavLink } from 'react-router-dom';
import { Layers, Building2, LayoutDashboard, UserCheck, GitCompare, BarChart3 } from 'lucide-react';
import { getCurrentUser } from '../api/client';

export const Navbar: React.FC = () => {
  const user = getCurrentUser();

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-50 shadow-xs">
      {/* Top institutional strip */}
      <div className="h-1 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 w-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand: Title + Subtitle */}
        <div className="flex items-center space-x-8">
          <NavLink to="/" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-lg bg-blue-900 flex items-center justify-center text-white shadow-xs">
              <Layers className="w-5 h-5 text-blue-100" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-slate-900">CaseBridge</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  AICTE
                </span>
              </div>
              <span className="text-xs text-slate-500 font-normal">
                Institution Complaint Monitoring
              </span>
            </div>
          </NavLink>

          {/* Navigation Links with calm, active highlight */}
          {/* Navigation Links with calm, active highlight */}
          <nav className="hidden sm:flex items-center space-x-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 font-semibold border-b-2 border-blue-900 rounded-b-none'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <LayoutDashboard className="w-4 h-4 text-slate-500" />
              <span>Overview</span>
            </NavLink>

            <NavLink
              to="/cases"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 font-semibold border-b-2 border-blue-900 rounded-b-none'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <Layers className="w-4 h-4 text-slate-500" />
              <span>Cases</span>
            </NavLink>

            <NavLink
              to="/institutions"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 font-semibold border-b-2 border-blue-900 rounded-b-none'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <Building2 className="w-4 h-4 text-slate-500" />
              <span>Institutions</span>
            </NavLink>

            <NavLink
              to="/overlaps"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 font-semibold border-b-2 border-blue-900 rounded-b-none'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <GitCompare className="w-4 h-4 text-slate-500" />
              <span>Overlap Queue</span>
            </NavLink>

            <NavLink
              to="/reports"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 font-semibold border-b-2 border-blue-900 rounded-b-none'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <BarChart3 className="w-4 h-4 text-slate-500" />
              <span>Reports</span>
            </NavLink>
          </nav>
        </div>

        {/* Right side: Role badge */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-xs">
            <UserCheck className="w-3.5 h-3.5 text-blue-900" />
            <span className="text-slate-500">Role:</span>
            <span className="font-semibold text-slate-800 capitalize">
              {user?.role || 'Coordinator'}
            </span>
          </div>

          <div className="hidden md:flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium border border-slate-200">
            <span>Official Portal</span>
          </div>
        </div>
      </div>

      {/* Mobile nav subbar */}
      <div className="sm:hidden flex items-center border-t border-slate-100 px-4 py-2 bg-slate-50 gap-2 overflow-x-auto">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex-1 text-center py-1.5 rounded text-xs font-medium whitespace-nowrap px-2 ${
              isActive ? 'bg-white text-blue-900 font-bold shadow-xs' : 'text-slate-600'
            }`
          }
        >
          Overview
        </NavLink>
        <NavLink
          to="/cases"
          className={({ isActive }) =>
            `flex-1 text-center py-1.5 rounded text-xs font-medium whitespace-nowrap px-2 ${
              isActive ? 'bg-white text-blue-900 font-bold shadow-xs' : 'text-slate-600'
            }`
          }
        >
          Cases
        </NavLink>
        <NavLink
          to="/institutions"
          className={({ isActive }) =>
            `flex-1 text-center py-1.5 rounded text-xs font-medium whitespace-nowrap px-2 ${
              isActive ? 'bg-white text-blue-900 font-bold shadow-xs' : 'text-slate-600'
            }`
          }
        >
          Institutions
        </NavLink>
        <NavLink
          to="/overlaps"
          className={({ isActive }) =>
            `flex-1 text-center py-1.5 rounded text-xs font-medium whitespace-nowrap px-2 ${
              isActive ? 'bg-white text-blue-900 font-bold shadow-xs' : 'text-slate-600'
            }`
          }
        >
          Overlaps
        </NavLink>
        <NavLink
          to="/reports"
          className={({ isActive }) =>
            `flex-1 text-center py-1.5 rounded text-xs font-medium whitespace-nowrap px-2 ${
              isActive ? 'bg-white text-blue-900 font-bold shadow-xs' : 'text-slate-600'
            }`
          }
        >
          Reports
        </NavLink>
      </div>
    </header>
  );
};
