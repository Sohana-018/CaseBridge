import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Layers,
  Building2,
  LayoutDashboard,
  UserCheck,
  GitCompare,
  BarChart3,
  ShieldAlert,
  LogOut,
  LogIn,
} from 'lucide-react';
import { getCurrentUser, logout } from '../api/client';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-50 shadow-xs">
      {/* Top institutional strip */}
      <div className="h-1 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 w-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand: Title + Subtitle */}
        <div className="flex items-center space-x-6">
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

            {user?.role === 'administrator' && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition ${
                    isActive
                      ? 'bg-amber-50 text-amber-900 font-bold border-b-2 border-amber-600 rounded-b-none'
                      : 'text-amber-700 hover:text-amber-900 hover:bg-amber-50/50'
                  }`
                }
              >
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>Admin</span>
              </NavLink>
            )}
          </nav>
        </div>

        {/* Right side: Role badge & Auth controls */}
        <div className="flex items-center space-x-3">
          {user ? (
            <>
              <div className="hidden lg:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-900 truncate max-w-[140px]">
                  {user.name}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {user.username ? `@${user.username}` : user.role}
                </span>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-xs">
                <UserCheck className="w-3.5 h-3.5 text-blue-900" />
                <span className="font-semibold text-slate-800 capitalize">
                  {user.role.replace('_', ' ')}
                </span>
                {user.bureau && (
                  <span className="ml-0.5 px-1 py-0.2 rounded bg-blue-100 text-blue-900 font-bold text-[10px]">
                    {user.bureau}
                  </span>
                )}
              </div>

              <NavLink
                to="/login"
                className="hidden sm:inline-flex items-center text-xs font-semibold px-2 py-1.5 text-slate-600 hover:text-blue-900 hover:bg-slate-100 rounded-md transition"
                title="Switch persona or account"
              >
                Switch
              </NavLink>

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 transition cursor-pointer"
                title="Sign out of CaseBridge"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <NavLink
              to="/login"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-md text-xs font-bold shadow-xs transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </NavLink>
          )}
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
        {user?.role === 'administrator' && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex-1 text-center py-1.5 rounded text-xs font-medium whitespace-nowrap px-2 ${
                isActive ? 'bg-amber-100 text-amber-900 font-bold shadow-xs' : 'text-amber-700'
              }`
            }
          >
            Admin
          </NavLink>
        )}
      </div>
    </header>
  );
};
