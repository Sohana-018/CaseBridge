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
  const isLogin = location.pathname === '/login';

  return (
    <header className="sticky top-0 z-40 bg-white shadow-xs">
      {/* AICTE / Govt Portal Tricolor Ribbon */}
      <div
        className="h-[3px] w-full bg-gradient-to-r from-[#FF9933] via-white to-[#138808]"
        aria-hidden="true"
      />

      {/* Institutional Utility Sub-Bar */}
      <div className={`bg-slate-50 border-b border-slate-200/80 text-[11px] text-slate-600 py-1.5 ${isLogin ? 'block' : 'hidden md:block'}`}>
        <div className="cb-page-container !py-0 flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <span className="font-bold text-slate-800">CaseBridge</span>
            <span className="text-slate-300">|</span>
            <span>Centralized Complaint Monitoring & Cross-Bureau Overlap Engine</span>
          </div>
          <div className="flex items-center gap-3.5 text-slate-500 text-[11px]">
            <span>Official Regulatory Coordination Portal</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar (Hidden on /login) */}
      {!isLogin && (
        <div className="border-b border-slate-200 bg-white/95 backdrop-blur-md">
          <div className="cb-page-container !py-0 h-16 flex items-center justify-between gap-4">
            {/* Brand + Primary Desktop navigation */}
            <div className="flex items-center gap-6 lg:gap-8 min-w-0">
              <NavLink
              to="/"
              className="flex items-center gap-3 group shrink-0"
              aria-label="CaseBridge Home"
            >
              <div
                className="w-9 h-9 rounded-xl bg-[#1E3A8A] flex items-center justify-center text-white shrink-0 shadow-xs border border-blue-900/20"
                aria-hidden="true"
              >
                <Layers className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base sm:text-lg tracking-tight text-slate-900 leading-tight">
                  CaseBridge
                </span>
                <span className="text-[11px] text-slate-500 font-medium hidden sm:block leading-tight">
                  Regulatory Oversight & Grievance Portal
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
                      `inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        isActive
                          ? 'bg-[#1E3A8A] text-white shadow-xs'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
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
                      `inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        isActive
                          ? 'bg-[#1E3A8A] text-white shadow-xs'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1E3A8A] hover:bg-[#172554] text-white rounded-lg text-xs font-semibold shadow-xs transition"
              >
                <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign In</span>
              </NavLink>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Mobile nav bar */}
      {user && (
        <nav
          className="lg:hidden flex items-center border-b border-slate-200 px-4 py-2 bg-slate-50 gap-1.5 overflow-x-auto"
          aria-label="Mobile Navigation"
        >
          {BASE_NAV_LINKS.map(({ to, end, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `shrink-0 py-1.5 px-3 rounded-lg text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-[#1E3A8A] text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/70'
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
                `shrink-0 py-1.5 px-3 rounded-lg text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-[#1E3A8A] text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/70'
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
