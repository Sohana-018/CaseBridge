import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Users,
  Sliders,
  History,
  Activity,
  UserPlus,
  RefreshCw,
  Search,
  Key,
  Database,
  X,
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
import { useToast } from '../components/Toast';

type AdminTab = 'overview' | 'users' | 'config' | 'audit';

export const AdminPage: React.FC = () => {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'administrator';
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const loadAllAdminData = useCallback(async (isRefresh = false) => {
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
      if (isRefresh) {
        showToast('Administrative console data refreshed', 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load administrative console data.';
      setError(msg);
      if (isRefresh) {
        showToast('Failed to refresh admin console', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    loadAllAdminData(false);
  }, [isAdmin, loadAllAdminData]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createAdminUser(newUser);
      setShowAddUserModal(false);
      const createdUsername = newUser.username;
      setNewUser({
        username: '',
        name: '',
        role: 'bureau_officer',
        bureau: 'RB',
        email: '',
        password: '',
      });
      showToast(`User '${createdUsername}' created successfully`, 'success');
      const updatedUsers = await getAdminUsers();
      setUsers(updatedUsers);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create user.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    setError(null);
    try {
      const res = await toggleAdminUserStatus(user.id);
      showToast(
        `User '${user.username}' is now ${res.is_active ? 'active' : 'deactivated'}`,
        'success'
      );
      const updatedUsers = await getAdminUsers();
      setUsers(updatedUsers);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle status.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    setError(null);
    try {
      await resetAdminUserPassword(resetTargetUser.id, newPasswordVal);
      const targetName = resetTargetUser.username;
      setResetTargetUser(null);
      setNewPasswordVal('');
      showToast(`Password reset successfully for '${targetName}'`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const handleSaveConfig = async () => {
    setError(null);
    try {
      const updates = Object.entries(configEdits).map(([key, value]) => ({ key, value }));
      await updateAdminConfig(updates);
      showToast('System configuration parameters saved', 'success');
      const updatedConfigs = await getAdminConfig();
      setConfigs(updatedConfigs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save configuration.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const handleTriggerScan = async () => {
    if (scanning) return;
    setScanning(true);
    setError(null);
    try {
      const res = await triggerAdminOverlapScan();
      showToast(
        `Full overlap scan completed: ${res.scanned ?? 0} cases scanned, ${res.created ?? 0} candidate pairs discovered`,
        'success'
      );
      loadAllAdminData(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Overlap scan failed.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setScanning(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="cb-page-container py-16">
        <div className="cb-card p-8 text-center max-w-xl mx-auto space-y-4">
          <div
            className="w-12 h-12 mx-auto rounded-full bg-[var(--danger-bg)] border border-[#FECDCA] flex items-center justify-center text-[var(--danger)]"
            aria-hidden="true"
          >
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold text-[var(--text)]">
            Administrator Access Required
          </h1>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            The Administration and System Governance console is restricted to users with the{' '}
            <code className="font-mono font-semibold text-[var(--brand)]">administrator</code> role.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-semibold rounded-lg shadow-xs transition"
            >
              <Key className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Log In as Administrator</span>
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-[var(--border-input)] text-[var(--text)] text-xs font-medium rounded-lg hover:bg-[var(--bg-subtle)] transition"
            >
              <span>Back to Overview</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cb-page-container space-y-6">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold text-[var(--text)] tracking-tight">
            System Administration
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            User directory, SLA rules, system health audits & security governance
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => loadAllAdminData(true)}
            disabled={loading}
            aria-label="Refresh administration console"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-[var(--border-input)] bg-white hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)] transition shadow-xs cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[var(--text-secondary)] ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Administration Sections"
        className="border-b border-[var(--border)] flex space-x-6 text-xs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
          className={`pb-3 font-medium border-b-2 flex items-center gap-2 transition cursor-pointer -mb-[1px] ${
            activeTab === 'overview'
              ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
          }`}
        >
          <Activity className="w-4 h-4" aria-hidden="true" />
          <span>Health & Governance</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          onClick={() => setActiveTab('users')}
          className={`pb-3 font-medium border-b-2 flex items-center gap-2 transition cursor-pointer -mb-[1px] ${
            activeTab === 'users'
              ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
          }`}
        >
          <Users className="w-4 h-4" aria-hidden="true" />
          <span>User Management</span>
          <span className="px-1.5 py-0.5 rounded bg-[var(--neutral-bg)] text-[var(--neutral)] num-tabular font-medium">
            {users.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'config'}
          onClick={() => setActiveTab('config')}
          className={`pb-3 font-medium border-b-2 flex items-center gap-2 transition cursor-pointer -mb-[1px] ${
            activeTab === 'config'
              ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
          }`}
        >
          <Sliders className="w-4 h-4" aria-hidden="true" />
          <span>Configuration</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'audit'}
          onClick={() => setActiveTab('audit')}
          className={`pb-3 font-medium border-b-2 flex items-center gap-2 transition cursor-pointer -mb-[1px] ${
            activeTab === 'audit'
              ? 'border-[var(--brand)] text-[var(--brand)] font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
          }`}
        >
          <History className="w-4 h-4" aria-hidden="true" />
          <span>Audit Trail</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & HEALTH */}
      {activeTab === 'overview' && health && (
        <div className="space-y-6">
          {/* Top KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="cb-card p-4">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Total Users</span>
              <div className="text-2xl font-semibold text-[var(--text)] mt-1 num-tabular">{health.total_users}</div>
              <div className="text-[11px] text-[var(--success)] font-medium mt-1">4 Active Roles</div>
            </div>
            <div className="cb-card p-4">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Total Cases</span>
              <div className="text-2xl font-semibold text-[var(--text)] mt-1 num-tabular">{health.total_cases}</div>
              <div className="text-[11px] text-[var(--text-tertiary)] mt-1">Cross-Bureau</div>
            </div>
            <div className="cb-card p-4">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Institutions</span>
              <div className="text-2xl font-semibold text-[var(--text)] mt-1 num-tabular">{health.total_institutions}</div>
              <div className="text-[11px] text-[var(--text-tertiary)] mt-1">Canonical Registry</div>
            </div>
            <div className="cb-card p-4">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Total Overlaps</span>
              <div className="text-2xl font-semibold text-[var(--text)] mt-1 num-tabular">{health.total_overlaps}</div>
              <div className="text-[11px] text-[var(--brand)] font-medium mt-1 num-tabular">
                {health.open_overlaps} Open for Review
              </div>
            </div>
            <div className="cb-card p-4">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Active Alerts</span>
              <div className="text-2xl font-semibold text-[var(--warning)] mt-1 num-tabular">{health.open_alerts}</div>
              <div className="text-[11px] text-[var(--text-tertiary)] mt-1">Action Required</div>
            </div>
            <div className="cb-card p-4">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Database</span>
              <div className="text-sm font-semibold text-[var(--text)] mt-2 truncate">{health.db_status}</div>
              <div className="text-[11px] text-[var(--success)] font-medium mt-1">✓ Connected</div>
            </div>
          </div>

          {/* Data Quality & Governance Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Data Quality Checks Card */}
            <div className="cb-card p-5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
                <Database className="w-4 h-4 text-[var(--brand)]" aria-hidden="true" />
                <h2 className="font-semibold text-[var(--text)] text-sm">
                  Data Quality & Hygiene Indicators
                </h2>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)]">
                  <span className="text-[var(--text)]">Cases Without Assigned Officer</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold num-tabular ${
                      health.unassigned_cases > 0
                        ? 'bg-[var(--warning-bg)] text-[var(--warning)] border border-[#FEDF89]'
                        : 'bg-[var(--success-bg)] text-[var(--success)] border border-[#A6F4C5]'
                    }`}
                  >
                    {health.unassigned_cases} cases
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)]">
                  <span className="text-[var(--text)]">Cases Missing Expected Disposal Date</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold num-tabular ${
                      health.cases_missing_deadline > 0
                        ? 'bg-[var(--warning-bg)] text-[var(--warning)] border border-[#FEDF89]'
                        : 'bg-[var(--success-bg)] text-[var(--success)] border border-[#A6F4C5]'
                    }`}
                  >
                    {health.cases_missing_deadline} cases
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)]">
                  <span className="text-[var(--text)]">Cases Breaching SLA / Overdue</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold num-tabular ${
                      health.overdue_cases > 0
                        ? 'bg-[var(--danger-bg)] text-[var(--danger)] border border-[#FECDCA]'
                        : 'bg-[var(--success-bg)] text-[var(--success)] border border-[#A6F4C5]'
                    }`}
                  >
                    {health.overdue_cases} cases
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)]">
                  <span className="text-[var(--text)]">Missing / Conflicting Permanent ID Items</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold num-tabular ${
                      (health.manual_verification_count ?? 0) > 0
                        ? 'bg-[var(--warning-bg)] text-[var(--warning)] border border-[#FEDF89]'
                        : 'bg-[var(--success-bg)] text-[var(--success)] border border-[#A6F4C5]'
                    }`}
                  >
                    {health.manual_verification_count ?? 0} items
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Engine Management */}
            <div className="cb-card p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)] mb-3">
                  <RefreshCw className="w-4 h-4 text-[var(--brand)]" aria-hidden="true" />
                  <h2 className="font-semibold text-[var(--text)] text-sm">
                    Overlap Detection Engine
                  </h2>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-6 leading-relaxed">
                  Run a scan across open case pairs to evaluate cosine text similarity, date proximity, and category affinities. All previously reviewed pairs are retained.
                </p>
              </div>

              <button
                type="button"
                onClick={handleTriggerScan}
                disabled={scanning}
                className="w-full flex justify-center items-center gap-2 py-2 px-4 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-semibold rounded-lg shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>{scanning ? 'Running Detection Scan...' : 'Trigger Full Overlap Scan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USER MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[var(--text)] text-sm">Authorized Users & Roles</h2>
            <button
              type="button"
              onClick={() => setShowAddUserModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add User</span>
            </button>
          </div>

          <div className="cb-card overflow-hidden">
            <table className="w-full text-left text-xs text-[var(--text)] border-collapse">
              <caption className="sr-only">Authorized System Users Table</caption>
              <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border)] text-[var(--text-secondary)] font-medium">
                <tr>
                  <th scope="col" className="px-4 py-3">User Details</th>
                  <th scope="col" className="px-4 py-3">Role</th>
                  <th scope="col" className="px-4 py-3">Bureau</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--bg-subtle)] transition">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text)]">{u.name}</div>
                      <div className="text-[11px] text-[var(--text-tertiary)] font-mono">
                        @{u.username} · {u.email || 'no email'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize">{u.role.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {u.bureau || 'Central'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          u.is_active
                            ? 'bg-[var(--success-bg)] text-[var(--success)] border border-[#A6F4C5]'
                            : 'bg-[var(--neutral-bg)] text-[var(--neutral)] border border-[var(--border)]'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(u)}
                        className="text-xs font-medium px-2.5 py-1 rounded border border-[var(--border-input)] bg-white hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetTargetUser(u);
                          setNewPasswordVal('');
                        }}
                        className="text-xs font-medium px-2.5 py-1 rounded border border-[var(--border-input)] text-[var(--brand)] hover:bg-[var(--brand-subtle)] transition cursor-pointer"
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
        <div className="max-w-2xl space-y-5">
          <div className="cb-card p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-[var(--text)] text-sm">System Parameters</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Adjust operational rules and thresholds across the application
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label htmlFor="sla-warn-days" className="block text-xs font-medium text-[var(--text)] mb-1">
                  SLA Warning Threshold (Days before deadline)
                </label>
                <input
                  id="sla-warn-days"
                  type="number"
                  value={configEdits['sla_warn_days'] || '3'}
                  onChange={(e) =>
                    setConfigEdits({ ...configEdits, sla_warn_days: e.target.value })
                  }
                  className="w-full sm:w-64 h-9 px-3 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs text-[var(--text)] bg-white"
                />
              </div>

              <div>
                <label htmlFor="sla-breach-days" className="block text-xs font-medium text-[var(--text)] mb-1">
                  SLA Breach Horizon (Days after overdue)
                </label>
                <input
                  id="sla-breach-days"
                  type="number"
                  value={configEdits['sla_breach_days'] || '14'}
                  onChange={(e) =>
                    setConfigEdits({ ...configEdits, sla_breach_days: e.target.value })
                  }
                  className="w-full sm:w-64 h-9 px-3 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs text-[var(--text)] bg-white"
                />
              </div>

              <div>
                <label htmlFor="max-active-cases" className="block text-xs font-medium text-[var(--text)] mb-1">
                  Max Active Cases per Officer
                </label>
                <input
                  id="max-active-cases"
                  type="number"
                  value={configEdits['max_active_cases_per_officer'] || '25'}
                  onChange={(e) =>
                    setConfigEdits({
                      ...configEdits,
                      max_active_cases_per_officer: e.target.value,
                    })
                  }
                  className="w-full sm:w-64 h-9 px-3 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs text-[var(--text)] bg-white"
                />
              </div>

              <div>
                <label htmlFor="system-mode-select" className="block text-xs font-medium text-[var(--text)] mb-1">
                  System Mode
                </label>
                <select
                  id="system-mode-select"
                  value={configEdits['system_mode'] || 'operational'}
                  onChange={(e) =>
                    setConfigEdits({ ...configEdits, system_mode: e.target.value })
                  }
                  className="w-full sm:w-64 h-9 px-3 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs text-[var(--text)] bg-white"
                >
                  <option value="operational">Operational Monitoring</option>
                  <option value="evaluation">Evaluation Benchmarking</option>
                  <option value="production">Production Live</option>
                </select>
              </div>

              <div className="pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-4 py-2 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
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
            <h2 className="font-semibold text-[var(--text)] text-sm">
              Audit Trail & Governance Logs
            </h2>
            <div className="relative w-full sm:w-72">
              <label htmlFor="audit-search-input" className="sr-only">
                Filter audit logs
              </label>
              <Search className="w-4 h-4 text-[var(--text-tertiary)] absolute left-3 top-2.5" aria-hidden="true" />
              <input
                id="audit-search-input"
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Filter by actor, case, or type..."
                className="w-full pl-9 pr-3 py-1.5 border border-[var(--border-input)] rounded-lg text-xs text-[var(--text)] bg-white"
              />
            </div>
          </div>

          <div className="cb-card overflow-hidden">
            <table className="w-full text-left text-xs text-[var(--text)] border-collapse">
              <caption className="sr-only">System Audit Trail Records</caption>
              <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border)] text-[var(--text-secondary)] font-medium">
                <tr>
                  <th scope="col" className="px-4 py-3">Timestamp</th>
                  <th scope="col" className="px-4 py-3">Actor & Bureau</th>
                  <th scope="col" className="px-4 py-3">Action Type</th>
                  <th scope="col" className="px-4 py-3">Target Case</th>
                  <th scope="col" className="px-4 py-3">Remarks / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
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
                    <tr key={log.id} className="hover:bg-[var(--bg-subtle)] transition">
                      <td className="px-4 py-3 text-[var(--text-tertiary)] num-tabular whitespace-nowrap">
                        {new Date(log.ts).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-[var(--text)]">{log.actor}</span>
                        <span className="ml-1 text-[var(--text-tertiary)]">({log.bureau})</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 rounded bg-[var(--neutral-bg)] text-[var(--neutral)] font-medium text-[11px]">
                          {log.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-[var(--brand)]">
                        {log.case_no ? (
                          <Link to={`/cases/${log.case_no}`} className="hover:underline">
                            {log.case_no}
                          </Link>
                        ) : (
                          `#${log.case_id}`
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{log.remarks || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ADD USER */}
      {showAddUserModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-[var(--border)]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-4">
              <h2 id="add-user-dialog-title" className="text-sm font-semibold text-[var(--text)]">
                Add Authorized User
              </h2>
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text)] p-1 rounded"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-medium text-[var(--text)] mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="e.g. officer_ro"
                  className="w-full h-9 px-3 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs text-[var(--text)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text)] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="e.g. Regional Officer North"
                  className="w-full h-9 px-3 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs text-[var(--text)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text)] mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full h-9 px-3 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs text-[var(--text)]"
                >
                  <option value="bureau_officer">Bureau Officer</option>
                  <option value="coordinator">Grievance Coordinator</option>
                  <option value="senior_management">Senior Management</option>
                  <option value="administrator">System Administrator</option>
                </select>
              </div>

              {newUser.role === 'bureau_officer' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">
                    Bureau / Cell
                  </label>
                  <select
                    value={newUser.bureau || 'RB'}
                    onChange={(e) => setNewUser({ ...newUser, bureau: e.target.value })}
                    className="w-full h-9 px-3 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs text-[var(--text)]"
                  >
                    <option value="RB">Regulation Bureau (RB)</option>
                    <option value="PGRC">Public Grievance Redressal (PGRC)</option>
                    <option value="RO">Regional Office (RO)</option>
                    <option value="OC">Other Cell (OC)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[var(--text)] mb-1">
                  Official Email
                </label>
                <input
                  type="email"
                  value={newUser.email || ''}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="officer@domain.gov.in"
                  className="w-full h-9 px-3 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs text-[var(--text)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text)] mb-1">
                  Initial Password
                </label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Minimum 4 characters"
                  className="w-full h-9 px-3 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs text-[var(--text)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-3.5 py-1.5 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-[var(--radius-control)] text-xs font-semibold transition cursor-pointer"
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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-password-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-[var(--border)]">
            <h2 id="reset-password-dialog-title" className="text-sm font-semibold text-[var(--text)] mb-2">
              Reset Password
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Enter a new password for{' '}
              <strong className="font-semibold text-[var(--text)]">
                {resetTargetUser.name} (@{resetTargetUser.username})
              </strong>
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
              <div>
                <label className="block text-xs font-medium text-[var(--text)] mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                  placeholder="Minimum 4 characters"
                  className="w-full h-9 px-3 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs text-[var(--text)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="px-3.5 py-1.5 border border-[var(--border-input)] rounded-[var(--radius-control)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-[var(--radius-control)] text-xs font-semibold transition cursor-pointer"
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
