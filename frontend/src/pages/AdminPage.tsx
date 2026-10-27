import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Users,
  Sliders,
  History,
  Activity,
  UserPlus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Search,
  Key,
  Database,
} from 'lucide-react';
import {
  getCurrentUser,
  getAdminUsers,
  createAdminUser,
  toggleAdminUserStatus,
  resetAdminUserPassword,
  getAdminConfig,
  updateAdminConfig,
  getAdminAuditLogs,
  getAdminHealthSummary,
  triggerAdminOverlapScan,
} from '../api/client';
import type {
  AdminUser,
  AdminConfigItem,
  AdminAuditLog,
  SystemHealthSummary,
  CreateAdminUserPayload,
} from '../api/client';
import { Link } from 'react-router-dom';

type AdminTab = 'overview' | 'users' | 'config' | 'audit';

export const AdminPage: React.FC = () => {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'administrator';

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Data states
  const [health, setHealth] = useState<SystemHealthSummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [configs, setConfigs] = useState<AdminConfigItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);

  // User form modal state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState<CreateAdminUserPayload>({
    username: '',
    name: '',
    role: 'bureau_officer',
    bureau: 'RB',
    email: '',
    password: '',
  });

  // Reset password modal state
  const [resetTargetUser, setResetTargetUser] = useState<AdminUser | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');

  // Config edits state
  const [configEdits, setConfigEdits] = useState<Record<string, string>>({});

  // Audit filter state
  const [auditSearch, setAuditSearch] = useState('');

  // Overlap scan state
  const [scanning, setScanning] = useState(false);

  const loadAllAdminData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthData, usersData, configData, auditData] = await Promise.all([
        getAdminHealthSummary(),
        getAdminUsers(),
        getAdminConfig(),
        getAdminAuditLogs(100),
      ]);
      setHealth(healthData);
      setUsers(usersData);
      setConfigs(configData);
      const confMap: Record<string, string> = {};
      configData.forEach((c) => {
        confMap[c.key] = c.value;
      });
      setConfigEdits(confMap);
      setAuditLogs(auditData);
    } catch (err: any) {
      setError(err?.message || 'Failed to load administrative console data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    loadAllAdminData();
  }, [isAdmin, loadAllAdminData]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMessage(null);
    setError(null);

    try {
      await createAdminUser(newUser);
      setShowAddUserModal(false);
      setNewUser({
        username: '',
        name: '',
        role: 'bureau_officer',
        bureau: 'RB',
        email: '',
        password: '',
      });
      setActionMessage(`User '${newUser.username}' created successfully.`);
      const updatedUsers = await getAdminUsers();
      setUsers(updatedUsers);
    } catch (err: any) {
      setError(err?.message || 'Failed to create user.');
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    setActionMessage(null);
    setError(null);
    try {
      const updated = await toggleAdminUserStatus(user.id, !user.is_active);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
      setActionMessage(
        `User '${user.username || user.name}' is now ${updated.is_active ? 'Active' : 'Inactive'}.`
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to toggle status.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser || !newPasswordVal) return;
    setActionMessage(null);
    setError(null);

    try {
      await resetAdminUserPassword(resetTargetUser.id, newPasswordVal);
      setActionMessage(`Password updated for user '${resetTargetUser.username || resetTargetUser.name}'.`);
      setResetTargetUser(null);
      setNewPasswordVal('');
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password.');
    }
  };

  const handleSaveConfig = async () => {
    setActionMessage(null);
    setError(null);
    try {
      await updateAdminConfig(configEdits);
      setActionMessage('System configurations saved successfully.');
      const conf = await getAdminConfig();
      setConfigs(conf);
    } catch (err: any) {
      setError(err?.message || 'Failed to save configuration.');
    }
  };

  const handleTriggerScan = async () => {
    setScanning(true);
    setActionMessage(null);
    setError(null);
    try {
      const res = await triggerAdminOverlapScan();
      setActionMessage(`Scan executed: ${res.created} new candidate overlap pairs generated.`);
      const h = await getAdminHealthSummary();
      setHealth(h);
    } catch (err: any) {
      setError(err?.message || 'Overlap scan failed.');
    } finally {
      setScanning(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="bg-white rounded-xl shadow-xs border border-amber-200 p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Administrator Access Required</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
            The Administration and System Governance console is restricted to users with the{' '}
            <code className="font-semibold text-amber-900">administrator</code> role. Your current role is{' '}
            <code className="font-semibold text-blue-900 capitalize">{currentUser?.role || 'Guest'}</code>.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition"
            >
              <Key className="w-4 h-4" />
              <span>Log In as Administrator</span>
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition"
            >
              <span>Back to Overview</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-950 flex items-center justify-center text-white">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              System Administration
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            User directory, SLA rules, system health audits & security governance (Phase 16)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAllAdminData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-xs transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {actionMessage && (
        <div className="mb-6 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between text-sm text-emerald-800 font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{actionMessage}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between text-sm text-red-800 font-medium">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-700 hover:text-red-900 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 mb-6 flex space-x-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'overview'
              ? 'border-blue-900 text-blue-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Health & Governance</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'users'
              ? 'border-blue-900 text-blue-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Management</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {users.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'config'
              ? 'border-blue-900 text-blue-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>System Configuration</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'audit'
              ? 'border-blue-900 text-blue-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Trail</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & HEALTH */}
      {activeTab === 'overview' && health && (
        <div className="space-y-6">
          {/* Top KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Total Users</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{health.total_users}</div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-1">4 Active Roles</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Total Cases</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{health.total_cases}</div>
              <div className="text-[11px] text-slate-500 mt-1">Cross-Bureau</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Institutions</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{health.total_institutions}</div>
              <div className="text-[11px] text-slate-500 mt-1">Registered Directory</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Total Overlaps</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{health.total_overlaps}</div>
              <div className="text-[11px] text-blue-700 font-semibold mt-1">
                {health.open_overlaps} Open for Review
              </div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Active Alerts</div>
              <div className="text-2xl font-bold text-amber-600 mt-1">{health.open_alerts}</div>
              <div className="text-[11px] text-slate-500 mt-1">Requires Attention</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Database</div>
              <div className="text-sm font-bold text-slate-900 mt-2 truncate">{health.db_status}</div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-1">✓ Healthy</div>
            </div>
          </div>

          {/* Data Quality & Governance Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Data Quality Checks Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-5 h-5 text-blue-900" />
                <h3 className="font-bold text-slate-900 text-base">
                  Data Quality & Hygiene Indicators
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Automated consistency checks across institution records and grievance timelines:
              </p>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50">
                  <div className="text-xs font-semibold text-slate-700">
                    Cases Without Assigned Officer
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      health.unassigned_cases > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {health.unassigned_cases} cases
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50">
                  <div className="text-xs font-semibold text-slate-700">
                    Cases Missing Expected Disposal Date
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      health.cases_missing_deadline > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {health.cases_missing_deadline} cases
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50">
                  <div className="text-xs font-semibold text-slate-700">
                    Cases Breaching SLA / Overdue
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      health.overdue_cases > 0
                        ? 'bg-red-100 text-red-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {health.overdue_cases} cases
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50">
                  <div className="text-xs font-semibold text-slate-700">
                    Missing / Conflicting Permanent ID Items
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      (health.manual_verification_count ?? 0) > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {health.manual_verification_count ?? 0} items
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Engine Management & Actions */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <RefreshCw className="w-5 h-5 text-indigo-700" />
                  <h3 className="font-bold text-slate-900 text-base">
                    Overlap Detection Engine Trigger
                  </h3>
                </div>
                <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                  Triggers an exhaustive multi-signal scan (Permanent ID match, category correlation,
                  TF-IDF + RapidFuzz text similarity, reference check) across all unreviewed pairs.
                  Does not overwrite previously reviewed pairs.
                </p>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 mb-4">
                  <strong>Non-destructive contract:</strong> Cases are flagged for human coordinator
                  review; no complaints are ever automatically merged or closed.
                </div>
              </div>

              <button
                onClick={handleTriggerScan}
                disabled={scanning}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-lg shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                <span>{scanning ? 'Running Detection Engine...' : 'Run Full Overlap Scan Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USER MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-base">Authorized Users & Roles</h3>
            <button
              onClick={() => setShowAddUserModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add New User</span>
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    User Details
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Assigned Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Bureau / Cell
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-500">
                        @{u.username || 'n/a'} · {u.email || 'no email'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-800 capitalize">
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {u.bureau ? (
                        <span className="font-bold text-blue-900">{u.bureau}</span>
                      ) : (
                        <span className="text-slate-400">All / Central</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          u.is_active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded border transition cursor-pointer ${
                          u.is_active
                            ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                            : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => {
                          setResetTargetUser(u);
                          setNewPasswordVal('');
                        }}
                        className="text-xs font-semibold px-2.5 py-1 rounded border border-blue-200 text-blue-800 hover:bg-blue-50 transition cursor-pointer"
                      >
                        Reset Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SYSTEM CONFIGURATION */}
      {activeTab === 'config' && (
        <div className="max-w-3xl space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <h3 className="font-bold text-slate-900 text-base mb-1">Configurable System Parameters</h3>
            <p className="text-xs text-slate-500 mb-6">
              Adjust operational rules, warning horizons, and institutional thresholds ({configs.length} active parameters):
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  SLA Warning Threshold (Days before deadline)
                </label>
                <input
                  type="number"
                  value={configEdits['sla_warn_days'] || '3'}
                  onChange={(e) =>
                    setConfigEdits({ ...configEdits, sla_warn_days: e.target.value })
                  }
                  className="w-full sm:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-900"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Cases due within this many days trigger a medium priority SLA warning alert.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  SLA Breach Horizon (Days after overdue)
                </label>
                <input
                  type="number"
                  value={configEdits['sla_breach_days'] || '14'}
                  onChange={(e) =>
                    setConfigEdits({ ...configEdits, sla_breach_days: e.target.value })
                  }
                  className="w-full sm:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-900"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Days past deadline before escalation to high-priority breach status.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Max Active Cases per Bureau Officer
                </label>
                <input
                  type="number"
                  value={configEdits['max_active_cases_per_officer'] || '25'}
                  onChange={(e) =>
                    setConfigEdits({
                      ...configEdits,
                      max_active_cases_per_officer: e.target.value,
                    })
                  }
                  className="w-full sm:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  System Mode
                </label>
                <select
                  value={configEdits['system_mode'] || 'operational'}
                  onChange={(e) =>
                    setConfigEdits({ ...configEdits, system_mode: e.target.value })
                  }
                  className="w-full sm:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-900"
                >
                  <option value="operational">Operational Monitoring</option>
                  <option value="evaluation">Evaluation Benchmarking</option>
                  <option value="production">Production Live</option>
                </select>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <button
                  onClick={handleSaveConfig}
                  className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="font-bold text-slate-900 text-base">
              System Audit Trail & Event Timeline
            </h3>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Filter by actor, case, or type..."
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-900"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Actor & Bureau
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Action Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Target Case
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Remarks / Audit Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {auditLogs
                  .filter((log) => {
                    if (!auditSearch) return true;
                    const q = auditSearch.toLowerCase();
                    return (
                      log.actor.toLowerCase().includes(q) ||
                      log.event_type.toLowerCase().includes(q) ||
                      (log.case_no && log.case_no.toLowerCase().includes(q)) ||
                      (log.remarks && log.remarks.toLowerCase().includes(q))
                    );
                  })
                  .map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {new Date(log.ts).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900">{log.actor}</span>
                        <span className="ml-1 text-slate-500">({log.bureau})</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-semibold uppercase text-[10px]">
                          {log.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-blue-900">
                        {log.case_no ? (
                          <Link to={`/cases/${log.case_no}`} className="hover:underline">
                            {log.case_no}
                          </Link>
                        ) : (
                          `#${log.case_id}`
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{log.remarks || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ADD USER */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4">Add Authorized User</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="e.g. officer_ro"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="e.g. Regional Officer North"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-900"
                >
                  <option value="bureau_officer">Bureau Officer</option>
                  <option value="coordinator">Grievance Coordinator</option>
                  <option value="senior_management">Senior Management</option>
                  <option value="administrator">System Administrator</option>
                </select>
              </div>

              {newUser.role === 'bureau_officer' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Bureau / Cell
                  </label>
                  <select
                    value={newUser.bureau || 'RB'}
                    onChange={(e) => setNewUser({ ...newUser, bureau: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-900"
                  >
                    <option value="RB">Regulation Bureau (RB)</option>
                    <option value="PGRC">Public Grievance Redressal (PGRC)</option>
                    <option value="RO">Regional Office (RO)</option>
                    <option value="OC">Other Cell (OC)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Official Email
                </label>
                <input
                  type="email"
                  value={newUser.email || ''}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="officer@domain.gov.in"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Initial Password
                </label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Minimum 4 characters"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">Reset Password</h3>
            <p className="text-xs text-slate-600 mb-4">
              Enter a new password for{' '}
              <strong className="text-slate-900">
                {resetTargetUser.name} (@{resetTargetUser.username})
              </strong>
              :
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                  placeholder="Minimum 4 characters"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Set Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
