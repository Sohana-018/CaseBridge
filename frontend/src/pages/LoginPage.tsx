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
  type DemoAccount,
} from '../api/client';

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
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  useEffect(() => {
    setError(null);

    // If already authenticated, redirect
    const user = getCurrentUser();
    if (user) {
      if (user.role === 'administrator') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    }

    // Fetch authorized demo accounts
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

  const handleSelectRole = (acc: DemoAccount) => {
    setUsername(acc.username);
    setPassword(acc.password_hint);
    setSelectedRole(acc.username);
    if (error) setError(null);
  };

  return (
    <div className="min-h-[calc(100vh-36px)] flex items-center justify-center p-3 sm:p-4 bg-slate-100">
      {/* Centered Split Card Locked to Viewport */}
      <div className="max-w-5xl w-full grid grid-cols-12 rounded-2xl shadow-xl overflow-hidden bg-white border border-slate-200">
        {/* 3. LEFT NAVY PANEL (Solid flat national regulatory navy, NO gradients) */}
        <div className="col-span-12 lg:col-span-5 bg-[#1E3A8A] p-6 sm:p-7 lg:p-8 flex flex-col justify-between text-white relative">
          {/* Top Branding Section */}
          <div className="space-y-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/10 text-white text-xs font-semibold border border-white/15">
                <Layers className="w-3.5 h-3.5 text-blue-300" aria-hidden="true" />
                <span>CaseBridge Portal</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight mt-2.5">
                Institution Complaint Monitoring
              </h1>
              <p className="text-xs text-blue-100/80 leading-relaxed mt-1">
                Centralized complaint tracking and overlap intelligence uniting all regulatory bureaus.
              </p>
            </div>

            {/* Single clean wrap row for 4 bureau pills */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white/10 text-blue-100 border border-white/15">
                RB • Regulation
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white/10 text-blue-100 border border-white/15">
                PGRC • Grievance
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white/10 text-blue-100 border border-white/15">
                RO • Regional
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white/10 text-blue-100 border border-white/15">
                OC • Other
              </span>
            </div>

            {/* Compact feature list with tight vertical spacing */}
            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md bg-white/15 border border-white/20 flex items-center justify-center shrink-0 mt-0.5 text-white">
                  <GitCompare className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white">Cross-Bureau Overlap Engine</h2>
                  <p className="text-[11px] text-blue-100/75 leading-tight">
                    Continuous similarity scoring & permanent ID correlation
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md bg-white/15 border border-white/20 flex items-center justify-center shrink-0 mt-0.5 text-white">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white">Proactive SLA Monitoring</h2>
                  <p className="text-[11px] text-blue-100/75 leading-tight">
                    Automated 4-tier ageing classification and escalation alerts
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md bg-white/15 border border-white/20 flex items-center justify-center shrink-0 mt-0.5 text-white">
                  <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white">Centralized Directory</h2>
                  <p className="text-[11px] text-blue-100/75 leading-tight">
                    Canonical institutional profiles with immutable audit trail
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Footer (Pinned neatly without empty void) */}
          <div className="pt-4 mt-4 border-t border-white/15 flex items-center justify-between text-xs text-blue-200/70">
            <span className="font-semibold text-white">CaseBridge</span>
            <span className="text-[11px] text-blue-200/70">Synthetic Demo Environment</span>
          </div>
        </div>

        {/* 4. RIGHT LOGIN & DEMO PANEL */}
        <div className="col-span-12 lg:col-span-7 p-6 sm:p-7 lg:p-8 flex flex-col justify-center bg-white">
          <div className="w-full max-w-md mx-auto">
            {/* Clean Header (No redundant duplicate CaseBridge logo) */}
            <div className="mb-3.5">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Officer Authentication
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Sign in with authorized credentials or select a quick demo role
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div
                role="alert"
                className="p-2.5 mb-3 rounded-lg bg-rose-50 border border-rose-200 flex items-center gap-2 text-xs text-rose-700"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" aria-hidden="true" />
                <span className="font-medium leading-snug">{error}</span>
              </div>
            )}

            {/* Compact Form */}
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Officer Username / ID
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </div>
                  <input
                    id="login-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (error) setError(null);
                      setSelectedRole(null);
                    }}
                    placeholder="e.g. admin or coordinator"
                    className="block w-full h-9 pl-9 pr-3 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
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
                    className="block w-full h-9 pl-9 pr-9 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password Row */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-[11px]">Remember this session</span>
                </label>
                <span className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer">
                  Forgot credentials?
                </span>
              </div>

              {/* Sign In Primary Action */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-9 flex justify-center items-center gap-1.5 px-4 rounded-lg text-xs font-bold text-white bg-[#1E3A8A] hover:bg-[#172554] shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                    <span>Sign In to Portal</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            {/* Compact 8-Role Demo Grid */}
            {demoAccounts && demoAccounts.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-700 text-xs font-bold mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                  <span>Quick Demo Access (Auto-fills Credentials)</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {demoAccounts.map((acc) => {
                    const isSelected = selectedRole === acc.username;

                    // Clean badge label that never overflows
                    const badgeLabel =
                      acc.badge === 'Management (Read-only)'
                        ? 'Read-Only'
                        : acc.badge === 'Deputy Coordinator'
                        ? 'Deputy Coord'
                        : acc.badge;

                    const badgeUpper = badgeLabel.toUpperCase();
                    const badgeStyle = badgeUpper.includes('ADMIN')
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : badgeUpper.includes('COORD')
                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                      : badgeUpper.includes('RB')
                      ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                      : badgeUpper.includes('PGRC')
                      ? 'bg-teal-100 text-teal-800 border-teal-200'
                      : badgeUpper.includes('RO')
                      ? 'bg-amber-100 text-amber-900 border-amber-200'
                      : badgeUpper.includes('OC')
                      ? 'bg-purple-100 text-purple-900 border-purple-200'
                      : 'bg-slate-100 text-slate-700 border-slate-300';

                    // Simplified display name for compact card
                    const cleanName = acc.name
                      .replace(' Central Grievance', '')
                      .replace(' Bureau Officer', ' Officer')
                      .replace(' Office Officer', ' Officer')
                      .replace(' Cells Officer', ' Officer')
                      .replace(' Executive', '');

                    return (
                      <button
                        key={acc.username}
                        type="button"
                        onClick={() => handleSelectRole(acc)}
                        className={`p-2 rounded-lg border transition flex items-center justify-between text-left group cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-blue-600 bg-blue-50/50 border-blue-600 shadow-2xs'
                            : 'border-slate-200 bg-slate-50/70 hover:bg-blue-50/30 hover:border-blue-400'
                        }`}
                      >
                        <div className="min-w-0 pr-1.5 flex flex-col">
                          <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-700 truncate leading-tight">
                            {cleanName}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 leading-tight mt-0.5">
                            @{acc.username}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap shrink-0 border ${badgeStyle}`}
                        >
                          {badgeLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
