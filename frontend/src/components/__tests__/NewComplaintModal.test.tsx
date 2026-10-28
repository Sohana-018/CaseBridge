import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NewComplaintModal } from '../NewComplaintModal';
import * as apiClient from '../../api/client';

// Mock the API client functions
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof apiClient>();
  return {
    ...actual,
    createCase: vi.fn(),
    scanOverlaps: vi.fn(),
    getOverlaps: vi.fn(),
    getInstitutions: vi.fn(),
    getDashboardSummary: vi.fn(),
    getCurrentUser: vi.fn(),
  };
});

const mockInstitution: apiClient.Institution = {
  id: 1,
  permanent_id: 'INST-001',
  name: 'National Technical Institute',
  address: '123 Campus Way',
  region: 'North',
};

describe('NewComplaintModal UX & Overlap Decoupling', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(apiClient.getCurrentUser).mockReturnValue({
      name: 'Coordinator Jane',
      role: 'coordinator',
      bureau: 'RB',
      username: 'jane',
    });

    vi.mocked(apiClient.getInstitutions).mockResolvedValue({
      items: [mockInstitution],
      total: 1,
      page: 1,
      page_size: 8,
    });

    vi.mocked(apiClient.getDashboardSummary).mockResolvedValue({
      total: 10,
      pending: 4,
      under_process: 2,
      disposed: 4,
      transferred: 0,
      escalated: 0,
      overdue: 1,
      open_overlaps: 1,
    });
  });

  const renderModal = (props: { isOpen?: boolean; onClose?: () => void; onSuccess?: (c: apiClient.CaseItem) => void } = {}) => {
    const defaultProps = {
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      ...props,
    };
    return {
      ...render(
        <MemoryRouter>
          <NewComplaintModal {...defaultProps} />
        </MemoryRouter>
      ),
      onClose: defaultProps.onClose,
      onSuccess: defaultProps.onSuccess,
    };
  };

  const fillAndSubmitForm = async (caseDesc = 'Water leakage in main academic lab block') => {
    // Wait for institution to load in results
    await waitFor(() => {
      expect(screen.getByText('National Technical Institute')).toBeDefined();
    });

    const instOption = screen.getByText('National Technical Institute');
    await act(async () => {
      fireEvent.click(instOption);
    });

    const descTextarea = screen.getByLabelText(/complaint description/i);
    await act(async () => {
      fireEvent.change(descTextarea, { target: { value: caseDesc } });
    });

    const submitBtn = screen.getByRole('button', { name: /register complaint/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });
  };

  it('1. createCase resolves while scan is slow: saved confirmation appears immediately', async () => {
    let resolveScan!: (value: apiClient.OverlapScanResponse) => void;
    const scanPromise = new Promise<apiClient.OverlapScanResponse>((resolve) => {
      resolveScan = resolve;
    });

    vi.mocked(apiClient.createCase).mockResolvedValueOnce({
      case_no: 'CASE-SLOW-001',
      bureau: 'RB',
      category: 'infrastructure',
      description: 'Slow scan test',
      received_date: '2026-10-28',
      status: 'pending',
      institution: {
        permanent_id: 'INST-001',
        name: 'National Technical Institute',
        region: 'North',
      },
    });

    vi.mocked(apiClient.scanOverlaps).mockReturnValueOnce(scanPromise);

    renderModal();
    await fillAndSubmitForm();

    // Confirmation must be visible immediately without waiting for scan
    await waitFor(() => {
      expect(screen.getByText(/complaint registered: case-slow-001/i)).toBeDefined();
    });

    // Overlap checking status should be active
    expect(screen.getByText(/checking for overlapping complaints.../i)).toBeDefined();
    expect(screen.getByText(/open case file/i)).toBeDefined();

    // Now resolve the scan and mock empty overlaps
    vi.mocked(apiClient.getOverlaps).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 100,
    });

    await act(async () => {
      resolveScan({ created: 0 });
    });

    await waitFor(() => {
      expect(screen.getByText(/no overlaps found/i)).toBeDefined();
    });
  });

  it('2a. Matches render correctly only after successful checking', async () => {
    vi.mocked(apiClient.createCase).mockResolvedValueOnce({
      case_no: 'CASE-MATCH-100',
      bureau: 'RB',
      category: 'infrastructure',
      description: 'Matches test',
      received_date: '2026-10-28',
      status: 'pending',
      institution: {
        permanent_id: 'INST-001',
        name: 'National Technical Institute',
        region: 'North',
      },
    });

    vi.mocked(apiClient.scanOverlaps).mockResolvedValueOnce({ created: 1 });
    vi.mocked(apiClient.getOverlaps).mockResolvedValueOnce({
      items: [
        {
          id: 42,
          band: 'high',
          review_status: 'needs_review',
          reasons: ['name_match', 'address_match'],
          case_a: {
            case_no: 'CASE-MATCH-100',
            bureau: 'RB',
            status: 'pending',
          },
          case_b: {
            case_no: 'CASE-EXISTING-200',
            bureau: 'PGRC',
            status: 'pending',
          },
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    });

    renderModal();
    await fillAndSubmitForm();

    // Confirmation shows immediately
    await waitFor(() => {
      expect(screen.getByText(/complaint registered: case-match-100/i)).toBeDefined();
    });

    // Overlap match details render after scan + getOverlaps complete
    await waitFor(() => {
      expect(screen.getByText(/potential overlapping cases – coordination required/i)).toBeDefined();
    });

    expect(screen.getByText(/pair #42/i)).toBeDefined();
    expect(screen.getByText(/case-existing-200/i)).toBeDefined();
    expect(screen.getByText(/view in queue/i)).toBeDefined();
    expect(screen.queryByText(/no overlaps found/i)).toBeNull();
  });

  it('2b. Genuine zero matches render "No overlaps found" ONLY after successful scan AND retrieval', async () => {
    vi.mocked(apiClient.createCase).mockResolvedValueOnce({
      case_no: 'CASE-ZERO-001',
      bureau: 'RB',
      category: 'faculty',
      description: 'No overlaps expected',
      received_date: '2026-10-28',
      status: 'pending',
      institution: {
        permanent_id: 'INST-001',
        name: 'National Technical Institute',
        region: 'North',
      },
    });

    vi.mocked(apiClient.scanOverlaps).mockResolvedValueOnce({ created: 0 });
    vi.mocked(apiClient.getOverlaps).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 100,
    });

    renderModal();
    await fillAndSubmitForm();

    await waitFor(() => {
      expect(screen.getByText(/complaint registered: case-zero-001/i)).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.getByText(/no overlaps found\./i)).toBeDefined();
    });

    expect(screen.queryByText(/potential overlapping cases/i)).toBeNull();
  });

  it('3a. Scan failure keeps the saved confirmation intact', async () => {
    vi.mocked(apiClient.createCase).mockResolvedValueOnce({
      case_no: 'CASE-SCANFAIL-001',
      bureau: 'RB',
      category: 'fee_refund',
      description: 'Scan fail test',
      received_date: '2026-10-28',
      status: 'pending',
      institution: {
        permanent_id: 'INST-001',
        name: 'National Technical Institute',
        region: 'North',
      },
    });

    vi.mocked(apiClient.scanOverlaps).mockRejectedValueOnce(new Error('Detection worker connection timed out'));

    renderModal();
    await fillAndSubmitForm();

    // Confirmation remains intact
    await waitFor(() => {
      expect(screen.getByText(/complaint registered: case-scanfail-001/i)).toBeDefined();
    });

    // Explicit failure state displayed with Retry
    await waitFor(() => {
      expect(screen.getByText(/complaint saved, but the overlap check failed/i)).toBeDefined();
    });

    expect(screen.getByText(/detection worker connection timed out/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();
    expect(screen.queryByText(/no overlaps found/i)).toBeNull();
  });

  it('3b. Results-fetch failure keeps the saved confirmation intact', async () => {
    vi.mocked(apiClient.createCase).mockResolvedValueOnce({
      case_no: 'CASE-FETCHFAIL-001',
      bureau: 'RB',
      category: 'admission',
      description: 'Fetch fail test',
      received_date: '2026-10-28',
      status: 'pending',
      institution: {
        permanent_id: 'INST-001',
        name: 'National Technical Institute',
        region: 'North',
      },
    });

    vi.mocked(apiClient.scanOverlaps).mockResolvedValueOnce({ created: 1 });
    vi.mocked(apiClient.getOverlaps).mockRejectedValueOnce(new Error('Database query failure during fetch'));

    renderModal();
    await fillAndSubmitForm();

    await waitFor(() => {
      expect(screen.getByText(/complaint registered: case-fetchfail-001/i)).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.getByText(/complaint saved, but the overlap check failed/i)).toBeDefined();
    });

    expect(screen.getByText(/database query failure during fetch/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();
  });

  it('4. Retry repeats scan/fetch, with createCase called exactly once', async () => {
    vi.mocked(apiClient.createCase).mockResolvedValueOnce({
      case_no: 'CASE-RETRY-001',
      bureau: 'RB',
      category: 'infrastructure',
      description: 'Retry test',
      received_date: '2026-10-28',
      status: 'pending',
      institution: {
        permanent_id: 'INST-001',
        name: 'National Technical Institute',
        region: 'North',
      },
    });

    // First scan call fails
    vi.mocked(apiClient.scanOverlaps).mockRejectedValueOnce(new Error('Network drop on scan'));

    // Second scan call succeeds
    vi.mocked(apiClient.scanOverlaps).mockResolvedValueOnce({ created: 0 });
    vi.mocked(apiClient.getOverlaps).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 100,
    });

    renderModal();
    await fillAndSubmitForm();

    // Wait for failure state
    await waitFor(() => {
      expect(screen.getByText(/complaint saved, but the overlap check failed/i)).toBeDefined();
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    // Overlap scan is retried and succeeds with zero matches
    await waitFor(() => {
      expect(screen.getByText(/no overlaps found\./i)).toBeDefined();
    });

    // createCase must have been called exactly ONCE!
    expect(apiClient.createCase).toHaveBeenCalledTimes(1);
    expect(apiClient.scanOverlaps).toHaveBeenCalledTimes(2);
  });

  it('5. 403 shows the truthful permission message without claiming zero matches or retrying', async () => {
    vi.mocked(apiClient.createCase).mockResolvedValueOnce({
      case_no: 'CASE-FORBIDDEN-001',
      bureau: 'RB',
      category: 'infrastructure',
      description: 'Forbidden test',
      received_date: '2026-10-28',
      status: 'pending',
      institution: {
        permanent_id: 'INST-001',
        name: 'National Technical Institute',
        region: 'North',
      },
    });

    // 403 Forbidden error thrown on scan
    const forbiddenErr = new Error('HTTP 403 Forbidden: Only coordinators can run overlap detection');
    (forbiddenErr as any).status = 403;
    vi.mocked(apiClient.scanOverlaps).mockRejectedValueOnce(forbiddenErr);

    renderModal();
    await fillAndSubmitForm();

    // Confirmation shows
    await waitFor(() => {
      expect(screen.getByText(/complaint registered: case-forbidden-001/i)).toBeDefined();
    });

    // Truthful 403 message shows
    await waitFor(() => {
      expect(
        screen.getByText(/your role cannot run an overlap scan; a coordinator can run it from the overlap queue\./i)
      ).toBeDefined();
    });

    // Does NOT claim zero matches
    expect(screen.queryByText(/no overlaps found/i)).toBeNull();
    // Does NOT offer a retry loop
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('6. Dashboard refresh failure does not undo saved status', async () => {
    vi.mocked(apiClient.createCase).mockResolvedValueOnce({
      case_no: 'CASE-DASHFAIL-001',
      bureau: 'RB',
      category: 'infrastructure',
      description: 'Dashboard error test',
      received_date: '2026-10-28',
      status: 'pending',
      institution: {
        permanent_id: 'INST-001',
        name: 'National Technical Institute',
        region: 'North',
      },
    });

    // Dashboard summary rejection
    vi.mocked(apiClient.getDashboardSummary).mockRejectedValueOnce(new Error('Overview service unavailable'));

    vi.mocked(apiClient.scanOverlaps).mockResolvedValueOnce({ created: 0 });
    vi.mocked(apiClient.getOverlaps).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 100,
    });

    renderModal();
    await fillAndSubmitForm();

    // Saved status remains intact
    await waitFor(() => {
      expect(screen.getByText(/complaint registered: case-dashfail-001/i)).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.getByText(/no overlaps found\./i)).toBeDefined();
    });
  });

  it('7. Close/reopen during in-flight request causes no stale updates or cross-case leakage', async () => {
    let resolveCase!: (value: apiClient.CaseItem) => void;
    const pendingCase = new Promise<apiClient.CaseItem>((resolve) => {
      resolveCase = resolve;
    });

    vi.mocked(apiClient.createCase).mockReturnValueOnce(pendingCase);

    const { rerender } = render(
      <MemoryRouter>
        <NewComplaintModal isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    );

    await fillAndSubmitForm('Case 1 in flight');

    // Close the modal while createCase is pending
    rerender(
      <MemoryRouter>
        <NewComplaintModal isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>
    );

    // Resolve the first case in background
    await act(async () => {
      resolveCase({
        case_no: 'CASE-STALE-999',
        bureau: 'RB',
        category: 'infrastructure',
        description: 'Stale case',
        received_date: '2026-10-28',
        status: 'pending',
      });
    });

    // Reopen modal for a new case
    rerender(
      <MemoryRouter>
        <NewComplaintModal isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    );

    // Ensure the old case's confirmation banner is NOT displayed
    expect(screen.queryByText(/case-stale-999/i)).toBeNull();
    // Ensure form is fresh and ready
    expect(screen.getByLabelText(/complaint description/i)).toBeDefined();
  });
});
