import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Layers, Building2, LayoutDashboard, UserCheck, GitCompare, BarChart3, ChevronDown } from 'lucide-react';
import {
  getCurrentUser,
  getSelectedRoleId,
  switchRole,
  autoLogin,
  ROLE_OPTIONS,
  type UserPayload,
} from '../api/client';

function getRoleBadgeLabel(u: UserPayload | null, selectedId: string): string {
  if (u) {
    if (u.role === 'coordinator') return 'Coordinator';
    if (u.role === 'bureau_officer') return `Officer (${u.bureau || 'Bureau'})`;
    if (u.role === 'senior_management') return 'Senior Management';
    if (u.role === 'administrator') return 'Administrator';
    return u.role;
  }
  const matched = ROLE_OPTIONS.find((opt) => opt.id === selectedId);
  if (matched) {
    if (matched.role === 'coordinator') return 'Coordinator';
    if (matched.role === 'bureau_officer') return `Officer (${matched.bureau || 'Bureau'})`;
    if (matched.role === 'senior_management') return 'Senior Management';
    if (matched.role === 'administrator') return 'Administrator';
    return matched.label;
  }
  return 'Coordinator';
}

export const Navbar: React.FC = () => {
  const [selectedRoleId, setSelectedRoleIdState] = useState<string>(() => getSelectedRoleId());
  const [user, setUser] = useState<UserPayload | null>(() => getCurrentUser());
  const [isSwitching, setIsSwitching] = useState<boolean>(false);

  useEffect(() => {
    const current = getCurrentUser();
    if (current) {
      setUser(current);
    } else {
      autoLogin()
        .then((res) => setUser(res.user))
        .catch(() => {});
    }
  }, [selectedRoleId]);

  const handleRoleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedRoleIdState(newId);
    setIsSwitching(true);
    try {
      const res = await switchRole(newId);
      setUser(res.user);
      // Reload current page to re-fetch data with new role permissions
      window.location.reload();
    } catch (err: unknown) {
      console.error('Role switch failed:', err);
      setIsSwitching(false);
    }
  };

  const badgeLabel = getRoleBadgeLabel(user, selectedRoleId);

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-50 shadow-xs">
      {/* Top institutional strip */}
      <div className="h-1 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 w-full" />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 lg:gap-4">
        {/* Brand: Title + Subtitle & Desktop Navigation Links */}
        <div className="flex items-center space-x-3 xl:space-x-6 flex-shrink-0 min-w-0">
          <NavLink to="/" className="flex items-center space-x-2.5 sm:space-x-3 group flex-shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-blue-900 flex items-center justify-center text-white shadow-xs">
              <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-blue-100" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900">CaseBridge</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  AICTE
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-normal hidden 2xl:inline">
                Institution Complaint Monitoring
              </span>
            </div>
          </NavLink>

          {/* Navigation Links with calm, active highlight */}
          <nav className="hidden lg:flex items-center space-x-0.5 xl:space-x-1 flex-shrink-0">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 xl:py-2 rounded-md text-xs xl:text-sm font-medium whitespace-nowrap transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 font-semibold border-b-2 border-blue-900 rounded-b-none'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <LayoutDashboard className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-slate-500" />
              <span>Overview</span>
            </NavLink>

            <NavLink
              to="/cases"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 xl:py-2 rounded-md text-xs xl:text-sm font-medium whitespace-nowrap transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 font-semibold border-b-2 border-blue-900 rounded-b-none'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <Layers className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-slate-500" />
              <span>Cases</span>
            </NavLink>

            <NavLink
              to="/institutions"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 xl:py-2 rounded-md text-xs xl:text-sm font-medium whitespace-nowrap transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 font-semibold border-b-2 border-blue-900 rounded-b-none'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <Building2 className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-slate-500" />
              <span>Institutions</span>
            </NavLink>

            <NavLink
              to="/overlaps"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 xl:py-2 rounded-md text-xs xl:text-sm font-medium whitespace-nowrap transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 font-semibold border-b-2 border-blue-900 rounded-b-none'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <GitCompare className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-slate-500" />
              <span>Overlap Queue</span>
            </NavLink>

            <NavLink
              to="/reports"
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 xl:py-2 rounded-md text-xs xl:text-sm font-medium whitespace-nowrap transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 font-semibold border-b-2 border-blue-900 rounded-b-none'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <BarChart3 className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-slate-500" />
              <span>Reports</span>
            </NavLink>
          </nav>
        </div>

        {/* Right side: Role selector dropdown and role badge */}
        <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
          {/* Desktop Role Dropdown */}
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            <label htmlFor="navbar-role-select" className="text-xs text-slate-500 font-semibold whitespace-nowrap">
              Role:
            </label>
            <div className="relative inline-block">
              <select
                id="navbar-role-select"
                aria-label="Select User Role"
                value={selectedRoleId}
                onChange={handleRoleChange}
                disabled={isSwitching}
                className="text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-md pl-2.5 pr-7 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-blue-900 cursor-pointer shadow-2xs transition appearance-none max-w-[155px] md:max-w-[190px] xl:max-w-[240px] truncate"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 pointer-events-none absolute right-2 top-2.5" />
            </div>
          </div>

          {/* Role badge */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-950 font-semibold shadow-2xs whitespace-nowrap flex-shrink-0"
            title={`Active role: ${badgeLabel}`}
          >
            <UserCheck className="w-3.5 h-3.5 text-blue-900 flex-shrink-0" />
            <span className="capitalize">{badgeLabel}</span>
          </div>

          <div className="hidden 2xl:flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium border border-slate-200 whitespace-nowrap flex-shrink-0">
            <span>Official Portal</span>
          </div>
        </div>
      </div>

      {/* Mobile Role Switcher Strip */}
      <div className="sm:hidden flex items-center justify-between border-t border-slate-200 px-4 py-2 bg-slate-100/80 gap-2">
        <label htmlFor="navbar-role-select-mobile" className="text-xs text-slate-600 font-semibold flex items-center gap-1.5 whitespace-nowrap">
          <UserCheck className="w-3.5 h-3.5 text-blue-900" />
          <span>Role:</span>
        </label>
        <div className="relative flex-1 max-w-[260px]">
          <select
            id="navbar-role-select-mobile"
            aria-label="Select User Role Mobile"
            value={selectedRoleId}
            onChange={handleRoleChange}
            disabled={isSwitching}
            className="w-full text-xs font-semibold bg-white text-slate-800 border border-slate-300 rounded pl-2 pr-6 py-1 focus:outline-hidden cursor-pointer shadow-2xs appearance-none"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 pointer-events-none absolute right-1.5 top-2" />
        </div>
      </div>

      {/* Mobile nav subbar */}
      <div className="lg:hidden flex items-center border-t border-slate-100 px-4 py-2 bg-slate-50 gap-2 overflow-x-auto">
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
