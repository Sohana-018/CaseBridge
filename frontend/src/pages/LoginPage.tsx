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
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
      {/* Colima Reference Inspired Institutional Split-Screen Card */}
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
        {/* Left Side: Overview and key capabilities */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-6 sm:p-8 lg:p-10 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-5">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
                CaseBridge Grievance Desk
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/80 leading-relaxed">
                Integrated complaint tracking and overlap intelligence portal uniting Regulation Bureau, Grievance Cell, Regional Offices, and Other Cells.
              </p>
            </div>

            <div className="pt-2 flex flex-wrap gap-1.5">
              <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-blue-900/60 text-blue-200 border border-blue-700/50">
                RB
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-teal-900/60 text-teal-200 border border-teal-700/50">
                PGRC
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-amber-900/60 text-amber-200 border border-amber-700/50">
                RO
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-indigo-900/60 text-indigo-200 border border-indigo-700/50">
                OC
              </span>
            </div>

            <div className="pt-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 mt-0.5 text-blue-300">
                  <GitCompare className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-white">Cross-Bureau Overlap Engine</h2>
                  <p className="text-[11px] text-blue-200/70">
                    Continuous TF-IDF similarity scoring & permanent ID correlation
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 mt-0.5 text-emerald-300">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-white">Proactive SLA Monitoring</h2>
                  <p className="text-[11px] text-blue-200/70">
                    Automated 4-tier ageing classification and escalation alerts
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 mt-0.5 text-indigo-300">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-white">Centralized Directory</h2>
                  <p className="text-[11px] text-blue-200/70">
                    Complete institutional profiles with immutable event logs
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-6 mt-6 border-t border-white/10 flex items-center justify-between text-xs text-blue-200/70">
            <span className="font-semibold text-white">CaseBridge</span>
            <span className="text-[11px] text-blue-200/60">Grievance Monitoring</span>
          </div>
        </div>

        {/* Right Side: Authentication Form */}
        <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between bg-white">
          <div className="max-w-md w-full mx-auto space-y-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-900 text-white flex items-center justify-center shadow-md shadow-blue-900/20">
                  <Layers className="w-6 h-6 text-blue-100" />
                </div>
                <div>
                  <div className="text-base font-black tracking-tight text-slate-900 font-mono">
                    CASEBRIDGE
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Institution Complaint Monitoring
                  </div>
                </div>
              </div>

              <div className="h-0.5 w-full bg-slate-100 my-4" />

              <div className="space-y-1">
                <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  Officer Authentication
                </h2>
                <p className="text-xs text-slate-500">
                  Sign in with your authorized portal credentials or use quick role access below
                </p>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 shadow-2xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-800 font-medium leading-relaxed">{error}</div>
              </div>
            )}

            {/* Credentials Form */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Officer Username / ID
                </label>
                <div className="relative rounded-lg shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="e.g. admin or coordinator"
                    className="block w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition bg-slate-50/50 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative rounded-lg shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition bg-slate-50/50 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-hidden cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-900 focus:ring-blue-900 cursor-pointer"
                  />
                  <span>Remember this session</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-md shadow-blue-900/20 text-sm font-bold text-white bg-blue-900 hover:bg-blue-800 active:scale-[0.99] transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-blue-200" />
                    <span>Sign In to Portal</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </form>

            {/* Authorized Accounts List */}
            {demoAccounts && demoAccounts.length > 0 && (
              <div className="pt-5 border-t border-slate-200/90 space-y-3">
                <div className="flex items-center gap-1.5 text-slate-800">
                  <Sparkles className="w-4 h-4 text-blue-900" />
                  <span className="text-xs font-extrabold uppercase tracking-wider">
                    Sign in as
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Select an authorized account below:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => handleQuickLogin(acc)}
                      disabled={loading}
                      className="flex flex-col justify-between p-2.5 rounded-xl border border-slate-200/90 bg-slate-50/70 hover:bg-blue-50/70 hover:border-blue-300 text-left transition group cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="text-xs font-bold text-slate-900 group-hover:text-blue-900 leading-snug">
                          {acc.name}
                        </span>
                        <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 shrink-0 group-hover:border-blue-300 group-hover:text-blue-900">
                          {acc.badge}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
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
