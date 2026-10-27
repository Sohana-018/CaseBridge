import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Layers,
  Building2,
  LayoutDashboard,
  GitCompare,
  BarChart3,
  Shield,
  LogIn,
} from 'lucide-react';
import { getCurrentUser, type UserPayload } from '../api/client';
import { UserMenu } from './UserMenu';

const BASE_NAV_LINKS = [
  { to: '/', end: true, Icon: LayoutDashboard, label: 'Overview' },
  { to: '/cases', end: false, Icon: Layers, label: 'Cases' },
  { to: '/institutions', end: false, Icon: Building2, label: 'Institutions' },
  { to: '/overlaps', end: false, Icon: GitCompare, label: 'Overlap Queue' },
  { to: '/reports', end: false, Icon: BarChart3, label: 'Reports' },
] as const;

export const Navbar: React.FC = () => {
  const location = useLocation();
  const [user, setUser] = useState<UserPayload | null>(() => getCurrentUser());

  useEffect(() => {
    setUser(getCurrentUser());
  }, [location.pathname]);

  const isAdmin = user?.role === 'administrator';

  return (
    <header className="border-b border-slate-800 bg-[#0F172A] text-white sticky top-0 z-40 shadow-md">
      <div className="cb-page-container !py-0 h-16 flex items-center justify-between gap-4">
        {/* Brand + Primary Desktop navigation */}
        <div className="flex items-center gap-6 lg:gap-8 min-w-0">
          <NavLink
            to="/"
            className="flex items-center gap-2.5 group shrink-0"
            aria-label="CaseBridge Home"
          >
            <div
              className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-500/25"
              aria-hidden="true"
            >
              <Layers className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight text-white leading-none">
                CaseBridge
              </span>
              <span className="text-[11px] text-blue-200/80 font-normal hidden xl:block mt-0.5 leading-none">
                Institution Complaint Monitoring
              </span>
            </div>
          </NavLink>

          {/* Desktop primary nav */}
          {user && (
            <nav className="hidden lg:flex items-center gap-1.5 shrink-0" aria-label="Primary">
              {BASE_NAV_LINKS.map(({ to, end, Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  aria-current={location.pathname === to ? 'page' : undefined}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`
                  }
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 text-current opacity-90" aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}

              {isAdmin && (
                <NavLink
                  to="/admin"
                  aria-current={location.pathname === '/admin' ? 'page' : undefined}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`
                  }
                >
                  <Shield className="w-3.5 h-3.5 shrink-0 text-current opacity-90" aria-hidden="true" />
                  <span>Admin</span>
                </NavLink>
              )}
            </nav>
          )}
        </div>

        {/* Right side: user menu or login link */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <UserMenu />
          ) : (
            <NavLink
              to="/login"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign In</span>
            </NavLink>
          )}
        </div>
      </div>

      {/* Mobile nav bar */}
      {user && (
        <nav
          className="lg:hidden flex items-center border-t border-slate-800 px-4 py-2 bg-slate-900 gap-1.5 overflow-x-auto"
          aria-label="Mobile Navigation"
        >
          {BASE_NAV_LINKS.map(({ to, end, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `shrink-0 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
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
                `shrink-0 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              Admin
            </NavLink>
          )}
        </nav>
      )}
    </header>
  );
};
