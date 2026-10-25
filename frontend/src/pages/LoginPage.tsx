import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import {
  loginWithCredentials,
  getDemoAccounts,
  getCurrentUser,
} from '../api/client';
import type { DemoAccount } from '../api/client';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    // If already logged in, redirect
    const user = getCurrentUser();
    if (user) {
      if (user.role === 'administrator') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    }

    // Fetch demo accounts
    getDemoAccounts()
      .then((accounts) => setDemoAccounts(accounts))
      .catch((err) => console.warn('Could not load demo accounts:', err));
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
      if (res.user.role === 'administrator') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify your credentials.');
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
      if (res.user.role === 'administrator') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err?.message || 'Quick login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-slate-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand header */}
        <div className="flex justify-center items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-blue-900 flex items-center justify-center text-white shadow-md shadow-blue-900/20">
            <Layers className="w-7 h-7 text-blue-100" />
          </div>
        </div>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900">
          CaseBridge Portal
        </h2>
        <p className="text-center text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">
          AICTE Grievance & Complaint Monitoring System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-xl sm:px-10">
          {error && (
            <div className="mb-6 p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm text-red-800 font-medium">{error}</div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Username / ID
              </label>
              <div className="mt-1.5 relative rounded-md shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. admin or coordinator"
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-900 focus:border-blue-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Password
              </label>
              <div className="mt-1.5 relative rounded-md shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-900 focus:border-blue-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-hidden"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-xs text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-900 transition disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-blue-200" />
                    <span>Sign In to Dashboard</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick Demo Access Pills */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-1.5 mb-3 text-slate-700">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold uppercase tracking-wider">
                One-Click Role Demonstration
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Click any account below to instantly authenticate and evaluate role permissions:
            </p>

            <div className="grid grid-cols-1 gap-2">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => handleQuickLogin(acc)}
                  disabled={loading}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-blue-50/60 hover:border-blue-300 text-left transition group cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-800 group-hover:text-blue-900">
                      {acc.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      User: <code className="text-slate-700 font-mono font-medium">{acc.username}</code> · Pass:{' '}
                      <code className="text-slate-700 font-mono font-medium">{acc.password_hint}</code>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 group-hover:border-blue-300 group-hover:text-blue-900">
                    {acc.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
