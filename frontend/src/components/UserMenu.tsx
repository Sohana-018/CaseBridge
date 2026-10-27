import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ChevronDown, Shield } from 'lucide-react';
import { getCurrentUser, logout, type UserPayload } from '../api/client';

export const UserMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<UserPayload | null>(() => getCurrentUser());
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    setOpen(false);
    navigate('/login');
  };

  const getRoleLabel = (u: UserPayload): string => {
    if (u.role === 'coordinator') return 'Coordinator';
    if (u.role === 'bureau_officer') return `Bureau Officer (${u.bureau || 'Bureau'})`;
    if (u.role === 'senior_management') return 'Senior Management';
    if (u.role === 'administrator') return 'Administrator';
    return u.role;
  };

  // Generate initials for avatar
  const initials = (user.name || user.username || 'CB')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="User account menu"
        className="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 transition cursor-pointer text-left shadow-xs"
      >
        <span
          className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs"
          aria-hidden="true"
        >
          {initials}
        </span>
        <div className="hidden sm:flex flex-col text-left">
          <span className="text-xs font-semibold text-white leading-tight max-w-[130px] truncate">
            {user.name || user.username}
          </span>
          <span className="text-[11px] text-blue-200/80 leading-tight">
            {getRoleLabel(user)}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-300 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-1.5 w-56 rounded-lg bg-white border border-[var(--border)] shadow-md py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
            <p className="text-xs font-semibold text-[var(--text)] leading-tight">
              {user.name || user.username}
            </p>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 flex items-center gap-1">
              <Shield className="w-3 h-3 text-[var(--brand)]" aria-hidden="true" />
              <span>{getRoleLabel(user)}</span>
            </p>
            {user.bureau && (
              <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-[var(--border)] text-[var(--neutral)]">
                Bureau: {user.bureau}
              </span>
            )}
          </div>

          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)] transition cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
