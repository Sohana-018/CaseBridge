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
    if (u.role === 'bureau_officer') return `Officer · ${u.bureau || 'Bureau'}`;
    if (u.role === 'senior_management') return 'Senior Mgmt';
    if (u.role === 'administrator') return 'Administrator';
    return u.role;
  }
  const matched = ROLE_OPTIONS.find((opt) => opt.id === selectedId);
  if (matched) {
    if (matched.role === 'coordinator') return 'Coordinator';
    if (matched.role === 'bureau_officer') return `Officer · ${matched.bureau || 'Bureau'}`;
    if (matched.role === 'senior_management') return 'Senior Mgmt';
    if (matched.role === 'administrator') return 'Administrator';
    return matched.label;
  }
  return 'Coordinator';
}

const NAV_LINKS = [
  { to: '/', end: true, Icon: LayoutDashboard, label: 'Overview' },
  { to: '/cases', end: false, Icon: Layers, label: 'Cases' },
  { to: '/institutions', end: false, Icon: Building2, label: 'Institutions' },
  { to: '/overlaps', end: false, Icon: GitCompare, label: 'Overlap Queue' },
  { to: '/reports', end: false, Icon: BarChart3, label: 'Reports' },
] as const;

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
    <header className="border-b border-slate-200 bg-white sticky top-0 z-50 shadow-sm">
      {/* Top institutional accent strip */}
      <div className="h-1 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 w-full" />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 lg:gap-4">
        {/* Brand + Desktop navigation */}
        <div className="flex items-center gap-3 xl:gap-6 flex-shrink-0 min-w-0">
          <NavLink to="/" className="flex items-center gap-2.5 group flex-shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-blue-900 flex items-center justify-center text-white shadow-xs flex-shrink-0">
              <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-blue-100" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 leading-none">CaseBridge</span>
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 leading-none">
                  Prototype
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-normal hidden 2xl:block mt-0.5 leading-none">
                Institution Complaint Monitoring
              </span>
            </div>
          </NavLink>

          {/* Desktop nav links */}
          <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1 flex-shrink-0" aria-label="Main navigation">
            {NAV_LINKS.map(({ to, end, Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 xl:py-2 rounded-md text-xs xl:text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-900 font-semibold border-b-2 border-blue-900 rounded-b-none'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700'
                  }`
                }
              >
                <Icon className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-slate-500 flex-shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Right side: merged role control + prototype badge */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Desktop: icon + label + select (merged single control) */}
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            <UserCheck className="w-3.5 h-3.5 text-blue-800 flex-shrink-0" aria-hidden="true" />
            <label htmlFor="navbar-role-select" className="text-xs text-slate-500 font-semibold whitespace-nowrap">
              Role:
            </label>
            <div className="relative inline-block">
              <select
                id="navbar-role-select"
                aria-label={`Switch active role. Current: ${badgeLabel}`}
                value={selectedRoleId}
                onChange={handleRoleChange}
                disabled={isSwitching}
                className="text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-md pl-2.5 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-700 cursor-pointer shadow-xs transition appearance-none"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-blue-600 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Prototype · Synthetic data badge (visible at xl+) */}
          <div className="hidden xl:flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-200 whitespace-nowrap flex-shrink-0">
            <span>Prototype · Synthetic data</span>
          </div>
        </div>
      </div>

      {/* Mobile: role switcher strip */}
      <div className="sm:hidden flex items-center justify-between border-t border-slate-200 px-4 py-2 bg-slate-100/80 gap-2">
        <label
          htmlFor="navbar-role-select-mobile"
          className="text-xs text-slate-600 font-semibold flex items-center gap-1.5 whitespace-nowrap"
        >
          <UserCheck className="w-3.5 h-3.5 text-blue-900" aria-hidden="true" />
          <span>Role:</span>
        </label>
        <div className="relative flex-1 max-w-[260px]">
          <select
            id="navbar-role-select-mobile"
            aria-label="Switch active role"
            value={selectedRoleId}
            onChange={handleRoleChange}
            disabled={isSwitching}
            className="w-full text-xs font-semibold bg-white text-blue-900 border border-blue-200 rounded pl-2 pr-6 py-1 focus:outline-none cursor-pointer shadow-xs appearance-none"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* Mobile nav subbar */}
      <div className="lg:hidden flex items-center border-t border-slate-100 px-4 py-2 bg-slate-50 gap-1 overflow-x-auto">
        {NAV_LINKS.map(({ to, end, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-shrink-0 text-center py-1.5 rounded text-xs font-medium whitespace-nowrap px-3 transition-colors ${
                isActive ? 'bg-white text-blue-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </header>
  );
};
