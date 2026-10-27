import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Layers,
  Lock,
  User,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  GitCompare,
  Clock,
  Building2,
} from 'lucide-react';
import {
  loginWithCredentials,
  getDemoAccounts,
  getCurrentUser,
} from '../api/client';
import type { DemoAccount } from '../api/client';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    // Clear any previous error when page loads
    setError(null);

    // If already logged in, redirect
    const user = getCurrentUser();
    if (user) {
      if (user.role === 'administrator') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    }

    // Fetch accounts
    getDemoAccounts()
      .then((accounts) => setDemoAccounts(Array.isArray(accounts) ? accounts : []))
      .catch(() => {
        setDemoAccounts([]);
      });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please provide both username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await loginWithCredentials(username.trim(), password);
      const fromPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      if (fromPath && (fromPath !== '/admin' || res.user.role === 'administrator')) {
        navigate(fromPath, { replace: true });
      } else if (res.user.role === 'administrator') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed. Please verify your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (acc: DemoAccount) => {
    setUsername(acc.username);
    setPassword(acc.password_hint);
    setLoading(true);
    setError(null);

    try {
      const res = await loginWithCredentials(acc.username, acc.password_hint);
      const fromPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      if (fromPath && (fromPath !== '/admin' || res.user.role === 'administrator')) {
        navigate(fromPath, { replace: true });
      } else if (res.user.role === 'administrator') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Quick login failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-[var(--bg-page)]">
      {/* Institutional Split-Screen Card */}
      <div className="w-full max-w-5xl bg-[var(--bg-surface)] rounded-xl shadow-[var(--shadow-card)] border border-[var(--border)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[600px]">
        {/* Left Side: Overview and key capabilities */}
        <div className="lg:col-span-5 bg-[var(--brand)] p-6 sm:p-8 lg:p-10 text-white flex flex-col justify-between relative">
          <div className="relative z-10 space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-white/10 text-white/90 text-xs font-medium">
                <Layers className="w-4 h-4 text-white" aria-hidden="true" />
                <span>CaseBridge Portal</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-tight">
                Institution Complaint Monitoring
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
                Centralized complaint tracking and overlap intelligence portal uniting Regulation Bureau, Grievance Cell, Regional Offices, and Other Cells.
              </p>
            </div>

            <div className="pt-1 flex flex-wrap gap-1.5">
              <span className="px-2.5 py-1 rounded text-xs font-medium bg-white/15 text-white border border-white/20">
                RB · Regulation
              </span>
              <span className="px-2.5 py-1 rounded text-xs font-medium bg-white/15 text-white border border-white/20">
                PGRC · Grievance
              </span>
              <span className="px-2.5 py-1 rounded text-xs font-medium bg-white/15 text-white border border-white/20">
                RO · Regional
              </span>
              <span className="px-2.5 py-1 rounded text-xs font-medium bg-white/15 text-white border border-white/20">
                OC · Other
              </span>
            </div>

            <div className="pt-2 space-y-3.5">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-md bg-white/15 border border-white/20 flex items-center justify-center shrink-0 mt-0.5 text-white">
                  <GitCompare className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white">Cross-Bureau Overlap Engine</h2>
                  <p className="text-xs text-blue-100/80 leading-relaxed">
                    Continuous TF-IDF similarity scoring & permanent ID correlation
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-md bg-white/15 border border-white/20 flex items-center justify-center shrink-0 mt-0.5 text-white">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white">Proactive SLA Monitoring</h2>
                  <p className="text-xs text-blue-100/80 leading-relaxed">
                    Automated 4-tier ageing classification and escalation alerts
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-md bg-white/15 border border-white/20 flex items-center justify-center shrink-0 mt-0.5 text-white">
                  <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white">Centralized Directory</h2>
                  <p className="text-xs text-blue-100/80 leading-relaxed">
                    Complete institutional profiles with immutable event logs
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-6 mt-6 border-t border-white/15 flex items-center justify-between text-xs text-blue-100/80">
            <span className="font-medium text-white">CaseBridge</span>
            <span className="text-xs text-blue-100/70">Synthetic Demo Data</span>
          </div>
        </div>

        {/* Right Side: Authentication Form */}
        <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between bg-[var(--bg-surface)]">
          <div className="max-w-md w-full mx-auto space-y-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[var(--brand)] text-white flex items-center justify-center">
                  <Layers className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-base font-semibold tracking-tight text-[var(--text)]">
                    CaseBridge
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    Institution Complaint Monitoring
                  </div>
                </div>
              </div>

              <div className="h-px w-full bg-[var(--border)] my-4" />

              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-[var(--text)] tracking-tight">
                  Officer Authentication
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Sign in with your authorized portal credentials or use quick role access below
                </p>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)]/30 flex items-start gap-3"
              >
                <AlertCircle className="w-4 h-4 text-[var(--danger)] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-xs text-[var(--danger)] font-medium leading-relaxed">{error}</div>
              </div>
            )}

            {/* Credentials Form */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Officer Username / ID
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
                  </div>
                  <input
                    id="login-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="e.g. admin or coordinator"
                    className="block w-full h-10 pl-10 pr-3.5 border border-[var(--border-input)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] bg-[var(--bg-surface)] transition focus:border-[var(--brand)]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="••••••••"
                    className="block w-full h-10 pl-10 pr-10 border border-[var(--border-input)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--text-tertiary)] bg-[var(--bg-surface)] transition focus:border-[var(--brand)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[var(--text-tertiary)] hover:text-[var(--text)] cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 text-[var(--text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border-input)] text-[var(--brand)] cursor-pointer"
                  />
                  <span>Remember this session</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 flex justify-center items-center gap-2 px-4 rounded-lg text-sm font-medium text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-white" aria-hidden="true" />
                    <span>Sign In to Portal</span>
                    <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Role Access */}
            {demoAccounts && demoAccounts.length > 0 && (
              <div className="pt-5 border-t border-[var(--border)] space-y-3">
                <div className="flex items-center gap-1.5 text-[var(--text)]">
                  <Sparkles className="w-4 h-4 text-[var(--brand)]" aria-hidden="true" />
                  <span className="text-xs font-semibold">
                    Quick Role Access
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Select an authorized demo account below:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => handleQuickLogin(acc)}
                      disabled={loading}
                      className="flex flex-col justify-between p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--brand-subtle)] hover:border-[var(--brand)]/30 text-left transition group cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="text-xs font-medium text-[var(--text)] group-hover:text-[var(--brand)] leading-snug">
                          {acc.name}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--neutral-bg)] border border-[var(--border)] text-[var(--neutral)] shrink-0">
                          {acc.badge}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-tertiary)] num-tabular">
                        {acc.username} · {acc.password_hint}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
