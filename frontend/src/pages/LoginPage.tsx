import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Building2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import {
  loginWithCredentials,
  getDemoAccounts,
  getCurrentUser,
  checkServerHealth,
  type DemoAccount,
} from '../api/client';

// Normalized labels and visual badge styles for the 8 official demo roles
const DEMO_ROLE_CONFIG: Record<string, { name: string; badge: string; badgeStyle: string }> = {
  admin: {
    name: 'System Administrator',
    badge: 'Admin',
    badgeStyle: 'bg-rose-100 text-rose-800 border-rose-200',
  },
  coordinator: {
    name: 'Central Grievance Coordinator',
    badge: 'Coordinator',
    badgeStyle: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  officer_rb: {
    name: 'Regulation Officer',
    badge: 'RB Officer',
    badgeStyle: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  officer_pgrc: {
    name: 'PGRC Officer',
    badge: 'PGRC Officer',
    badgeStyle: 'bg-teal-100 text-teal-800 border-teal-200',
  },
  officer_ro: {
    name: 'Regional Officer',
    badge: 'RO Officer',
    badgeStyle: 'bg-amber-100 text-amber-900 border-amber-200',
  },
  officer_oc: {
    name: 'Other Officer',
    badge: 'OC Officer',
    badgeStyle: 'bg-purple-100 text-purple-900 border-purple-200',
  },
  deputy_coord: {
    name: 'Deputy Grievance Coordinator',
    badge: 'Deputy Coord',
    badgeStyle: 'bg-sky-100 text-sky-800 border-sky-200',
  },
  management: {
    name: 'Senior Management',
    badge: 'Read-Only',
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-300',
  },
};

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loggingInRole, setLoggingInRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  // Server waking-up (Render cold-start) states
  const [serverWakingUp, setServerWakingUp] = useState<boolean>(false);
  const [serverReadyNotice, setServerReadyNotice] = useState<boolean>(false);
  const [wakeUpSeconds, setWakeUpSeconds] = useState<number>(0);
  const serverReadyRef = useRef<boolean>(false);
  const isPollingRef = useRef<boolean>(false);

  // Horizontal strip scrolling and drag state
  const stripRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const dragInfo = useRef({ isDown: false, startX: 0, scrollLeft: 0, hasDragged: false });

  const updateScrollButtons = useCallback(() => {
    if (!stripRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = stripRef.current;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  // Backoff polling loop for backend health endpoint
  const startHealthPolling = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    setServerWakingUp(true);
    setError(null);

    let delay = 1500;
    const maxDelay = 6000;

    while (isPollingRef.current) {
      const healthy = await checkServerHealth(3500);
      if (healthy) {
        serverReadyRef.current = true;
        setServerWakingUp(false);
        setServerReadyNotice(true);
        setTimeout(() => setServerReadyNotice(false), 5000);

        // Fetch demo accounts immediately now that backend is awake
        try {
          const accounts = await getDemoAccounts();
          setDemoAccounts(Array.isArray(accounts) ? accounts : []);
          setTimeout(updateScrollButtons, 100);
        } catch {
          // ignore
        }
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(maxDelay, delay * 1.5);
    }
    isPollingRef.current = false;
  }, [updateScrollButtons]);

  // Manual retry probe when server waking up exceeds expected threshold
  const handleManualRetryProbe = useCallback(async () => {
    const healthy = await checkServerHealth(4000);
    if (healthy) {
      serverReadyRef.current = true;
      setServerWakingUp(false);
      setServerReadyNotice(true);
      setTimeout(() => setServerReadyNotice(false), 5000);
      try {
        const accounts = await getDemoAccounts();
        setDemoAccounts(Array.isArray(accounts) ? accounts : []);
        setTimeout(updateScrollButtons, 100);
      } catch {
        // ignore
      }
    }
  }, [updateScrollButtons]);

  // Elapsed seconds timer during server wake-up
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (serverWakingUp) {
      timer = setInterval(() => {
        setWakeUpSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setWakeUpSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [serverWakingUp]);

  // Page mount lifecycle: probe server health and handle cold starts
  useEffect(() => {
    let isCancelled = false;
    setError(null);

    // If already authenticated, redirect
    const user = getCurrentUser();
    if (user) {
      if (user.role === 'administrator') {
        navigate('/admin');
      } else {
        navigate('/');
      }
      return;
    }

    // Safety watchdog: if server hasn't answered after 2500ms, indicate server waking up
    const wakingWatchdog = setTimeout(() => {
      if (!isCancelled && !serverReadyRef.current) {
        setServerWakingUp(true);
      }
    }, 2500);

    // Initial load: probe server health
    checkServerHealth(2400)
      .then((isHealthy) => {
        if (isCancelled) return;
        clearTimeout(wakingWatchdog);
        if (isHealthy) {
          serverReadyRef.current = true;
          setServerWakingUp(false);
          getDemoAccounts()
            .then((accounts) => {
              if (!isCancelled) {
                setDemoAccounts(Array.isArray(accounts) ? accounts : []);
                setTimeout(updateScrollButtons, 100);
              }
            })
            .catch(() => {
              if (!isCancelled) setDemoAccounts([]);
            });
        } else {
          serverReadyRef.current = false;
          startHealthPolling();
        }
      })
      .catch(() => {
        if (!isCancelled) {
          clearTimeout(wakingWatchdog);
          serverReadyRef.current = false;
          startHealthPolling();
        }
      });

    return () => {
      isCancelled = true;
      clearTimeout(wakingWatchdog);
      isPollingRef.current = false;
    };
  }, [navigate, updateScrollButtons, startHealthPolling]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollButtons, { passive: true });
    window.addEventListener('resize', updateScrollButtons);
    return () => {
      el.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [updateScrollButtons, demoAccounts]);

  const scrollStrip = (dir: 'left' | 'right') => {
    if (!stripRef.current) return;
    const amount = dir === 'left' ? -220 : 220;
    stripRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  };

  // Mouse drag-to-scroll handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!stripRef.current) return;
    dragInfo.current = {
      isDown: true,
      startX: e.pageX - stripRef.current.offsetLeft,
      scrollLeft: stripRef.current.scrollLeft,
      hasDragged: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragInfo.current.isDown || !stripRef.current) return;
    const x = e.pageX - stripRef.current.offsetLeft;
    const walk = (x - dragInfo.current.startX) * 1.2;
    if (Math.abs(walk) > 4) {
      dragInfo.current.hasDragged = true;
    }
    stripRef.current.scrollLeft = dragInfo.current.scrollLeft - walk;
  };

  const handleMouseUpOrLeave = () => {
    dragInfo.current.isDown = false;
  };

  // Unified authentication pipeline with slow-response watchdog
  const performLogin = async (user: string, pass: string, roleKey?: string) => {
    setLoading(true);
    if (roleKey) setLoggingInRole(roleKey);
    setError(null);

    // If server takes longer than 3.5s to respond, indicate server waking up
    const slowLoginTimer = setTimeout(() => {
      setServerWakingUp(true);
    }, 3500);

    try {
      const res = await loginWithCredentials(user.trim(), pass);
      clearTimeout(slowLoginTimer);
      serverReadyRef.current = true;
      setServerWakingUp(false);
      const fromPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      if (fromPath && (fromPath !== '/admin' || res.user.role === 'administrator')) {
        navigate(fromPath, { replace: true });
      } else if (res.user.role === 'administrator') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      clearTimeout(slowLoginTimer);
      const errMsg = err instanceof Error ? err.message : '';
      const isNetworkErr =
        err instanceof TypeError ||
        errMsg.toLowerCase().includes('fetch') ||
        errMsg.toLowerCase().includes('network') ||
        errMsg.toLowerCase().includes('failed to fetch') ||
        errMsg.includes('502') ||
        errMsg.includes('503') ||
        errMsg.includes('504');

      if (isNetworkErr) {
        setServerWakingUp(true);
        startHealthPolling();
      } else {
        const msg = errMsg || 'Authentication failed. Please verify your credentials.';
        setError(msg);
      }
    } finally {
      setLoading(false);
      setLoggingInRole(null);
    }
  };

  // Manual form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (serverWakingUp) return;
    if (!username.trim() || !password) {
      setError('Please provide both username and password.');
      return;
    }
    await performLogin(username, password);
  };

  // Immediate single-click demo role login
  const handleDemoChipClick = async (acc: DemoAccount) => {
    if (dragInfo.current.hasDragged || loading || serverWakingUp) return;
    setUsername(acc.username);
    setPassword('');
    setSelectedRole(acc.username);
    await performLogin(acc.username, acc.password_hint, acc.username);
  };

  // Keyboard navigation across chips
  const handleChipKeyDown = (e: React.KeyboardEvent, index: number) => {
    const buttons = stripRef.current?.querySelectorAll<HTMLButtonElement>('button[data-demo-chip]');
    if (!buttons || buttons.length === 0) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIdx = (index + 1) % buttons.length;
      buttons[nextIdx]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIdx = (index - 1 + buttons.length) % buttons.length;
      buttons[prevIdx]?.focus();
    }
  };

  // Edge mask computation for smooth visual fade
  const maskStyle = React.useMemo(() => {
    if (!canScrollLeft && !canScrollRight) return undefined;
    if (canScrollLeft && canScrollRight) {
      return {
        maskImage: 'linear-gradient(to right, transparent, black 28px, black calc(100% - 28px), transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 28px, black calc(100% - 28px), transparent)',
      };
    }
    if (canScrollLeft) {
      return {
        maskImage: 'linear-gradient(to right, transparent, black 28px, black 100%)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 28px, black 100%)',
      };
    }
    return {
      maskImage: 'linear-gradient(to right, black 0%, black calc(100% - 28px), transparent)',
      WebkitMaskImage: 'linear-gradient(to right, black 0%, black calc(100% - 28px), transparent)',
    };
  }, [canScrollLeft, canScrollRight]);

  return (
    <div className="min-h-[calc(100vh-36px)] flex items-center justify-center p-3 sm:p-4 bg-slate-100">
      {/* Centered Split Card Locked to Viewport */}
      <div className="max-w-5xl w-full grid grid-cols-12 rounded-2xl shadow-xl overflow-hidden bg-white border border-slate-200">
        {/* 3. LEFT NAVY PANEL */}
        <div className="col-span-12 lg:col-span-5 bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 p-6 sm:p-7 lg:p-8 flex flex-col justify-between text-white relative">
          {/* Top Branding Section */}
          <div className="space-y-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/10 border border-white/15 text-[11px] font-semibold text-blue-200 mb-3">
                <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Regulatory Portal</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Multi-Bureau Case Coordination System
              </h1>
              <p className="text-xs text-blue-100/80 mt-1 leading-relaxed">
                Centralized grievance intake and resolution engine across AICTE regulatory divisions
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="pt-2 space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md bg-white/15 border border-white/20 flex items-center justify-center shrink-0 mt-0.5 text-white">
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white">Role-Based Access</h2>
                  <p className="text-[11px] text-blue-100/75 leading-tight">
                    Strict boundary isolation for RB, PGRC, RO, and OC officers
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-md bg-white/15 border border-white/20 flex items-center justify-center shrink-0 mt-0.5 text-white">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white">SLA Enforcement</h2>
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

          {/* Bottom Footer */}
          <div className="pt-4 mt-4 border-t border-white/15 flex items-center justify-between text-xs text-blue-200/70">
            <span className="font-semibold text-white">CaseBridge</span>
            <span className="text-[11px] text-blue-200/70">CaseBridge Prototype · Demo Data</span>
          </div>
        </div>

        {/* 4. RIGHT LOGIN & DEMO PANEL */}
        <div className="col-span-12 lg:col-span-7 p-6 sm:p-7 lg:p-8 flex flex-col justify-center bg-white">
          <div className="w-full max-w-md mx-auto">
            {/* Clean Header */}
            <div className="mb-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>CaseBridge · Prototype Evaluation</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Officer Authentication
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Sign in with authorized credentials or select a quick demo role
              </p>
            </div>

            {/* Server Waking Up Friendly Card / State */}
            {serverWakingUp && (
              <div
                role="status"
                aria-live="polite"
                className="p-3.5 mb-3.5 rounded-xl bg-blue-50/90 border border-blue-200 text-slate-800 shadow-2xs space-y-2.5 animate-in fade-in duration-300"
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5"
                    aria-hidden="true"
                  >
                    <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-slate-900 leading-snug">
                        The server is waking up, this can take up to a minute
                      </h3>
                      <span className="text-[10px] font-mono text-slate-600 bg-white px-2 py-0.5 rounded-full border border-blue-200 shrink-0 font-medium">
                        {wakeUpSeconds}s elapsed
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      CaseBridge is hosted on a cloud container that cold-starts when idle. The login form will activate automatically as soon as the service responds.
                    </p>
                  </div>
                </div>

                {/* Smooth Progress Animation Bar */}
                <div className="w-full bg-blue-100 border border-blue-200 rounded-full h-1.5 overflow-hidden relative">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.min(95, Math.max(12, (wakeUpSeconds / 50) * 100))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                  <span className="flex items-center gap-1 font-medium text-slate-600">
                    <Clock className="w-3 h-3 text-blue-600" aria-hidden="true" />
                    <span>Polling backend health endpoint...</span>
                  </span>
                  <span className="font-semibold text-blue-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                    <span>Cold start in progress</span>
                  </span>
                </div>

                {wakeUpSeconds >= 25 && (
                  <div className="pt-2 border-t border-blue-200/60 flex items-center justify-between">
                    <span className="text-[11px] text-slate-600">Taking longer than usual?</span>
                    <button
                      type="button"
                      onClick={handleManualRetryProbe}
                      className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition cursor-pointer shadow-2xs"
                    >
                      Retry connection probe
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Server Ready Notification */}
            {serverReadyNotice && (
              <div
                role="status"
                aria-live="polite"
                className="p-2.5 mb-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800 shadow-2xs animate-in fade-in duration-300"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span className="font-semibold">Backend server is online! You can now sign in.</span>
              </div>
            )}

            {/* Quick Demo Roles Strip (Only rendered in demo environment) */}
            {demoAccounts && demoAccounts.length > 0 && (
              <section
                role="group"
                aria-label="Quick demo roles"
                className="relative my-3 p-2 bg-slate-50 border border-slate-200 rounded-xl group/strip"
              >
                <div className="flex items-center justify-between gap-1 mb-1.5 px-1">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                    <Sparkles className="w-3 h-3 text-blue-600" aria-hidden="true" />
                    <span>Quick Demo Roles (Immediate Sign-In)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                    Click to authenticate
                  </span>
                </div>

                {/* Relative Wrapper with scroll buttons & fading mask */}
                <div className="relative flex items-center">
                  {/* Left Scroll Arrow */}
                  {canScrollLeft && (
                    <button
                      type="button"
                      disabled={loading || serverWakingUp}
                      onClick={() => scrollStrip('left')}
                      aria-label="Scroll demo roles left"
                      className="absolute -left-2 z-20 w-7 h-7 rounded-full bg-white border border-slate-300 shadow-md flex items-center justify-center text-slate-700 hover:text-blue-600 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}

                  {/* Scrollable Container */}
                  <div
                    ref={stripRef}
                    style={maskStyle}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUpOrLeave}
                    onMouseLeave={handleMouseUpOrLeave}
                    className="w-full flex items-center gap-2 overflow-x-auto py-1 scroll-smooth snap-x snap-mandatory select-none cursor-grab active:cursor-grabbing [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {demoAccounts.map((acc, idx) => {
                      const cfg = DEMO_ROLE_CONFIG[acc.username] || {
                        name: acc.name,
                        badge: acc.badge,
                        badgeStyle: 'bg-slate-100 text-slate-700 border-slate-300',
                      };
                      const isLoggingInThis = loggingInRole === acc.username;
                      const isSelected = selectedRole === acc.username;

                      return (
                        <button
                          key={acc.username}
                          type="button"
                          data-demo-chip="true"
                          disabled={loading || serverWakingUp}
                          onClick={() => handleDemoChipClick(acc)}
                          onKeyDown={(e) => handleChipKeyDown(e, idx)}
                          aria-label={`Sign in as ${cfg.name}`}
                          className={`snap-start shrink-0 min-h-[44px] px-3 py-1.5 rounded-lg border text-left transition flex items-center gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none disabled:cursor-not-allowed ${isSelected
                              ? 'bg-blue-50/80 border-blue-600 shadow-2xs'
                              : 'bg-white border-slate-200 hover:bg-blue-50/40 hover:border-blue-400'
                            } ${(loading || serverWakingUp) && !isLoggingInThis ? 'opacity-50' : ''}`}
                        >
                          {/* Role Name & Username */}
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-slate-800 whitespace-nowrap leading-tight">
                              {cfg.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 leading-tight">
                              @{acc.username}
                            </span>
                          </div>

                          {/* Role Badge or Active Spinner */}
                          {isLoggingInThis ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200 inline-flex items-center gap-1 shrink-0">
                              <Loader2 className="w-3 h-3 animate-spin text-blue-600" aria-hidden="true" />
                              <span>Signing in...</span>
                            </span>
                          ) : (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap shrink-0 border ${cfg.badgeStyle}`}
                            >
                              {cfg.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Right Scroll Arrow */}
                  {canScrollRight && (
                    <button
                      type="button"
                      disabled={loading || serverWakingUp}
                      onClick={() => scrollStrip('right')}
                      aria-label="Scroll demo roles right"
                      className="absolute -right-2 z-20 w-7 h-7 rounded-full bg-white border border-slate-300 shadow-md flex items-center justify-center text-slate-700 hover:text-blue-600 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Accessible live status for demo login */}
                <div aria-live="polite" className="sr-only">
                  {loggingInRole && `Signing in as ${DEMO_ROLE_CONFIG[loggingInRole]?.name || loggingInRole}...`}
                </div>
              </section>
            )}

            {/* Error Banner with aria-live="polite" */}
            <div aria-live="polite" aria-atomic="true">
              {error && (
                <div
                  role="alert"
                  className="p-2.5 mb-3 rounded-lg bg-rose-50 border border-rose-200 flex items-center gap-2 text-xs text-rose-700"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" aria-hidden="true" />
                  <span className="font-medium leading-snug">{error}</span>
                </div>
              )}
            </div>

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
                    disabled={loading || serverWakingUp}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (error) setError(null);
                      setSelectedRole(null);
                    }}
                    placeholder="e.g. admin or coordinator"
                    className={`block w-full h-9 pl-9 pr-3 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition ${serverWakingUp || loading
                        ? 'opacity-60 bg-slate-100 cursor-not-allowed'
                        : 'bg-slate-50 focus:bg-white'
                      }`}
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
                    disabled={loading || serverWakingUp}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="••••••••"
                    className={`block w-full h-9 pl-9 pr-9 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition ${serverWakingUp || loading
                        ? 'opacity-60 bg-slate-100 cursor-not-allowed'
                        : 'bg-slate-50 focus:bg-white'
                      }`}
                  />
                  <button
                    type="button"
                    disabled={loading || serverWakingUp}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                <label className={`flex items-center gap-1.5 text-slate-600 select-none ${serverWakingUp ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    disabled={loading || serverWakingUp}
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
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
                disabled={loading || serverWakingUp}
                className="w-full h-9 flex justify-center items-center gap-1.5 px-4 rounded-lg text-xs font-bold text-white bg-[#1E3A8A] hover:bg-[#172554] shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {serverWakingUp ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Server Waking Up...</span>
                  </span>
                ) : loading && !loggingInRole ? (
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
          </div>
        </div>
      </div>
    </div>
  );
};
