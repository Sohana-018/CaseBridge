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
    <header className="border-b border-[var(--border)] bg-white sticky top-0 z-40">
      <div className="cb-page-container !py-0 h-16 flex items-center justify-between gap-4">
        {/* Brand + Primary Desktop navigation */}
        <div className="flex items-center gap-6 lg:gap-8 min-w-0">
          <NavLink
            to="/"
            className="flex items-center gap-2.5 group shrink-0"
            aria-label="CaseBridge Home"
          >
            <div
              className="w-8 h-8 rounded-lg bg-[var(--brand)] flex items-center justify-center text-white shrink-0"
              aria-hidden="true"
            >
              <Layers className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-base tracking-tight text-[var(--text)] leading-none">
                CaseBridge
              </span>
              <span className="text-[11px] text-[var(--text-tertiary)] font-normal hidden xl:block mt-0.5 leading-none">
                Institution Complaint Monitoring
              </span>
            </div>
          </NavLink>

          {/* Desktop primary nav */}
          {user && (
            <nav className="hidden lg:flex items-center gap-1 shrink-0" aria-label="Primary">
              {BASE_NAV_LINKS.map(({ to, end, Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  aria-current={location.pathname === to ? 'page' : undefined}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 px-3 h-16 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
                      isActive
                        ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--border)]'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0 text-current opacity-80" aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}

              {isAdmin && (
                <NavLink
                  to="/admin"
                  aria-current={location.pathname === '/admin' ? 'page' : undefined}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 px-3 h-16 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
                      isActive
                        ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
                        : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--border)]'
                    }`
                  }
                >
                  <Shield className="w-4 h-4 shrink-0 text-current opacity-80" aria-hidden="true" />
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-lg text-xs font-semibold shadow-xs transition"
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
          className="lg:hidden flex items-center border-t border-[var(--border)] px-4 py-1.5 bg-[var(--bg-subtle)] gap-1 overflow-x-auto"
          aria-label="Mobile Navigation"
        >
          {BASE_NAV_LINKS.map(({ to, end, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `shrink-0 py-1.5 px-3 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-[var(--brand)] font-semibold shadow-xs border border-[var(--border)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
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
                `shrink-0 py-1.5 px-3 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-[var(--brand)] font-semibold shadow-xs border border-[var(--border)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
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
