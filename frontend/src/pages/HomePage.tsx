import { useEffect, useState } from 'react';
import { getHealthStatus, type HealthResponse } from '../api/client';
import { Activity, CheckCircle2, AlertTriangle, RefreshCw, Server, Globe, Cpu } from 'lucide-react';

export const HomePage = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || '(VITE_API_URL not set)';

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getHealthStatus();
      setHealth(data);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to connect to backend server');
      }
      setHealth(null);
      setLastChecked(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero Welcome */}
      <div className="mb-10 text-center sm:text-left">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          System Initialization
        </h1>
        <p className="mt-2 text-base text-slate-600 max-w-2xl">
          CaseBridge monitoring platform Phase 0 environment verification. Validating backend FastAPI connectivity and client configuration.
        </p>
      </div>

      {/* Main Status Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 mb-8 transition-all hover:shadow-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-xl ${
              loading 
                ? 'bg-amber-50 text-amber-600' 
                : health?.status === 'ok' 
                ? 'bg-emerald-50 text-emerald-600' 
                : 'bg-rose-50 text-rose-600'
            }`}>
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Backend Health Endpoint</h2>
              <p className="text-sm text-slate-500">
                GET <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-mono">/api/v1/health</code>
              </p>
            </div>
          </div>

          <button
            id="btn-refresh-health"
            onClick={fetchHealth}
            disabled={loading}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Check Now</span>
          </button>
        </div>

        {/* Status Banner */}
        <div className="mt-6">
          {loading && (
            <div id="status-loading" className="flex items-center space-x-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
              <span className="font-medium">Connecting to API server...</span>
            </div>
          )}

          {!loading && health?.status === 'ok' && (
            <div id="status-success" className="p-5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <div id="api-status-text" className="text-xl font-bold tracking-tight text-emerald-900">
                    API status: ok
                  </div>
                  <div className="text-xs text-emerald-700 mt-0.5">
                    FastAPI backend is responsive and accepting requests.
                  </div>
                </div>
              </div>
              <div className="text-xs font-mono bg-white/70 px-3 py-1.5 rounded-lg border border-emerald-200/50 text-emerald-800 self-start sm:self-auto">
                Response: {JSON.stringify(health)}
              </div>
            </div>
          )}

          {!loading && error && (
            <div id="status-error" className="p-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-lg font-bold text-rose-900">
                    API Connection Issue
                  </div>
                  <div className="text-sm text-rose-700 mt-1">
                    {error}
                  </div>
                  <div className="mt-3 text-xs bg-rose-100/70 p-3 rounded-lg text-rose-800 font-mono">
                    Ensure backend is running: <code>uvicorn app.main:app --reload --port 8000</code>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Metadata Details */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-400 block mb-1 font-medium">CONFIGURED VITE_API_URL</span>
            <span id="meta-api-url" className="font-mono text-slate-700 font-medium break-all">{apiUrl}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-400 block mb-1 font-medium">FULL ENDPOINT</span>
            <span className="font-mono text-slate-700 font-medium break-all">{apiUrl}/api/v1/health</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-400 block mb-1 font-medium">LAST EVALUATED</span>
            <span className="font-mono text-slate-700 font-medium">{lastChecked || 'Pending'}</span>
          </div>
        </div>
      </div>

      {/* Architecture Verification Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
            <Server className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-base mb-1">Backend Stack</h3>
          <p className="text-xs text-slate-500 mb-3">FastAPI, Python 3.13, Uvicorn, SQLModel, Pydantic v2.</p>
          <div className="inline-flex items-center text-xs text-indigo-600 font-semibold">
            Health Check: /api/v1/health
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
            <Globe className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-base mb-1">Frontend Stack</h3>
          <p className="text-xs text-slate-500 mb-3">React 19, Vite, TypeScript, Tailwind CSS.</p>
          <div className="inline-flex items-center text-xs text-blue-600 font-semibold">
            Dynamic VITE_API_URL config
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-base mb-1">CORS & Security</h3>
          <p className="text-xs text-slate-500 mb-3">Parsed from backend/.env dynamically with credentials enabled.</p>
          <div className="inline-flex items-center text-xs text-emerald-600 font-semibold">
            No hardcoded URLs
          </div>
        </div>
      </div>
    </main>
  );
};
