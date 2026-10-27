/**
 * CaseBridge Shared Formatters & Design Token Mappings
 * Single source of truth for statuses, categories, signals, and numbers.
 */

export interface StatusConfig {
  key: string;
  label: string;
  text: string;
  bg: string;
  hex: string;
  bgHex: string;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  pending: {
    key: 'pending',
    label: 'Pending',
    text: 'text-[var(--warning)]',
    bg: 'bg-[var(--warning-bg)]',
    hex: '#B54708',
    bgHex: '#FFFAEB',
  },
  under_process: {
    key: 'under_process',
    label: 'Under Process',
    text: 'text-[var(--info)]',
    bg: 'bg-[var(--info-bg)]',
    hex: '#175CD3',
    bgHex: '#EFF8FF',
  },
  escalated: {
    key: 'escalated',
    label: 'Escalated',
    text: 'text-[var(--escalated)]',
    bg: 'bg-[var(--escalated-bg)]',
    hex: '#6941C6',
    bgHex: '#F9F5FF',
  },
  transferred: {
    key: 'transferred',
    label: 'Transferred',
    text: 'text-[var(--neutral)]',
    bg: 'bg-[var(--neutral-bg)]',
    hex: '#344054',
    bgHex: '#F2F4F7',
  },
  disposed: {
    key: 'disposed',
    label: 'Disposed',
    text: 'text-[var(--success)]',
    bg: 'bg-[var(--success-bg)]',
    hex: '#067647',
    bgHex: '#ECFDF3',
  },
  overdue: {
    key: 'overdue',
    label: 'Overdue SLA',
    text: 'text-[var(--danger)]',
    bg: 'bg-[var(--danger-bg)]',
    hex: '#B42318',
    bgHex: '#FEF3F2',
  },
};

export function formatStatus(status?: string | null): string {
  if (!status) return '—';
  const clean = status.toLowerCase().trim();
  if (STATUS_CONFIG[clean]) {
    return STATUS_CONFIG[clean].label;
  }
  return clean
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function getStatusConfig(status?: string | null): StatusConfig {
  const clean = (status || '').toLowerCase().trim();
  return (
    STATUS_CONFIG[clean] || {
      key: clean,
      label: formatStatus(clean),
      text: 'text-[var(--neutral)]',
      bg: 'bg-[var(--neutral-bg)]',
      hex: '#344054',
      bgHex: '#F2F4F7',
    }
  );
}

export function formatCategory(cat?: string | null): string {
  if (!cat) return '—';
  const clean = cat.toLowerCase().trim();
  const known: Record<string, string> = {
    fee_refund: 'Fee refund',
    faculty: 'Faculty & staffing',
    infrastructure: 'Infrastructure',
    admission: 'Admission quota',
    examination: 'Examinations',
    approval: 'Approval & norms',
    harassment: 'Harassment & grievance',
    other: 'General / other',
  };
  if (known[clean]) return known[clean];
  return clean
    .split('_')
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function formatSignal(signal?: string | null): string {
  if (!signal) return '';
  const s = signal.trim();

  if (s.startsWith('text_similarity')) {
    const parts = s.split(' ');
    const val = parseFloat(parts[1] || '0');
    return `Text similarity: ${Math.round(val * 100)}%`;
  }

  if (s.startsWith('date_proximity')) {
    const parts = s.split(' ');
    const days = parts[1] || '0';
    return `Received within ${days} days`;
  }

  const map: Record<string, string> = {
    same_permanent_id: 'Same Permanent ID',
    same_category: 'Same category',
    related_category: 'Related category',
    shared_reference: 'Shared reference code',
  };

  if (map[s]) return map[s];

  return s
    .split('_')
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function formatOutcome(outcome?: string | null): string {
  if (!outcome) return '—';
  const clean = outcome.toLowerCase().trim();
  const map: Record<string, string> = {
    open: 'Open (Unreviewed)',
    related: 'Marked as Related',
    duplicate: 'Marked as Duplicate',
    not_related: 'Not Related',
    needs_review: 'Needs Joint Review',
  };
  return map[clean] || formatStatus(clean);
}

export function formatConfidenceBand(band?: string | null): {
  label: string;
  scoreText: string;
} {
  const b = (band || '').toLowerCase();
  if (b === 'high') {
    return { label: 'High Confidence', scoreText: 'Score ≥ 0.80' };
  }
  if (b === 'medium') {
    return { label: 'Medium Confidence', scoreText: 'Score 0.50 – 0.79' };
  }
  return { label: 'Low Confidence', scoreText: 'Score < 0.50' };
}
