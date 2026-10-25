import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
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
import {
  getCurrentUser,
  logout,
  type UserPayload,
} from '../api/client';

function getRoleBadgeLabel(u: UserPayload | null): string {
  if (!u) return '';
  if (u.role === 'coordinator') return 'Coordinator';
  if (u.role === 'bureau_officer') return `Officer · ${u.bureau || 'Bureau'}`;
  if (u.role === 'senior_management') return 'Senior Mgmt';
  if (u.role === 'administrator') return 'Administrator';
  return u.role;
}

const BASE_NAV_LINKS = [
  { to: '/', end: true, Icon: LayoutDashboard, label: 'Overview' },
  { to: '/cases', end: false, Icon: Layers, label: 'Cases' },
  { to: '/institutions', end: false, Icon: Building2, label: 'Institutions' },
  { to: '/overlaps', end: false, Icon: GitCompare, label: 'Overlap Queue' },
  { to: '/reports', end: false, Icon: BarChart3, label: 'Reports' },
] as const;

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<UserPayload | null>(() => getCurrentUser());

  useEffect(() => {
    setUser(getCurrentUser());
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    setUser(null);
    navigate('/login');
  };

  const badgeLabel = getRoleBadgeLabel(user);
  const isAdmin = user?.role === 'administrator';

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-50 shadow-xs">
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
                <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 leading-none">
                  CaseBridge
                </span>
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
            {BASE_NAV_LINKS.map(({ to, end, Icon, label }) => (
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

            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 xl:py-2 rounded-md text-xs xl:text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-amber-50 text-amber-900 font-bold border-b-2 border-amber-600 rounded-b-none'
                      : 'text-amber-800 hover:text-amber-950 hover:bg-amber-50/70 focus-visible:outline-2 focus-visible:outline-amber-700'
                  }`
                }
              >
                <ShieldAlert className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-amber-600 flex-shrink-0" />
                <span>Admin</span>
              </NavLink>
            )}
          </nav>
        </div>

        {/* Right side: role badge + prototype badge + sign in/logout */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Active Role Badge (read-only indicator of current logged-in identity) */}
          {user && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-900 border border-blue-200 text-xs font-semibold shadow-2xs">
              <UserCheck className="w-3.5 h-3.5 text-blue-800 flex-shrink-0" aria-hidden="true" />
              <span className="max-w-[120px] sm:max-w-none truncate">{badgeLabel}</span>
            </div>
          )}

          {/* Prototype · Synthetic data badge (visible at xl+) */}
          <div className="hidden xl:flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-200 whitespace-nowrap flex-shrink-0">
            <span>Prototype · Synthetic data</span>
          </div>

          {/* Real Auth Quick Actions */}
          <div className="flex items-center gap-1">
            {user ? (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-red-700 hover:bg-red-50 border border-slate-200 transition cursor-pointer"
                title="Sign out of CaseBridge"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            ) : (
              <NavLink
                to="/login"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-md text-xs font-bold shadow-xs transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </NavLink>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav subbar */}
      <div className="lg:hidden flex items-center border-t border-slate-100 px-4 py-2 bg-slate-50 gap-1 overflow-x-auto">
        {BASE_NAV_LINKS.map(({ to, end, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-shrink-0 text-center py-1.5 rounded text-xs font-medium whitespace-nowrap px-3 transition-colors ${
                isActive
                  ? 'bg-white text-blue-900 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            {label}
          </NavLink>
        ))}

        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex-shrink-0 text-center py-1.5 rounded text-xs font-bold whitespace-nowrap px-3 transition-colors ${
                isActive
                  ? 'bg-amber-100 text-amber-900 shadow-xs'
                  : 'text-amber-800 hover:text-amber-950 hover:bg-amber-50'
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
