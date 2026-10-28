import { useState } from 'react';
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

function createDeferred<T>() {
  let resolve!: (val: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function ModalTestHost({
  onSuccess,
}: {
  onSuccess?: (c: apiClient.CaseItem) => void | Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setIsOpen(true)}>
        Reopen Modal
      </button>
      <NewComplaintModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={onSuccess}
      />
    </div>
  );
}

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

  const renderModal = (props: {
    isOpen?: boolean;
    onClose?: () => void;
    onSuccess?: (c: apiClient.CaseItem) => void | Promise<void>;
  } = {}) => {
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

  it('1. createCase resolves while scan is slow: saved confirmation appears immediately with corrected subtitle', async () => {
    const deferredScan = createDeferred<apiClient.OverlapScanResponse>();

    vi.mocked(apiClient.createCase).mockResolvedValueOnce({
      case_no: 'CASE-SLOW-001',
      bureau: 'RB',
      category: 'infrastructure',
      description: 'Slow scan test',
      received_date: '2026-10-28',
      status: 'pending',
      institution: mockInstitution,
    });

    vi.mocked(apiClient.scanOverlaps).mockReturnValueOnce(deferredScan.promise);

    renderModal();
    await fillAndSubmitForm();

    // Confirmation must be visible immediately without waiting for scan
    await waitFor(() => {
      expect(screen.getByText(/complaint registered: case-slow-001/i)).toBeDefined();
    });

    // Subtitle must reflect that overlap check is shown below, not that it is already evaluated
    expect(screen.getByText('Complaint saved; overlap-check status is shown below.')).toBeDefined();

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
      deferredScan.resolve({ created: 0 });
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
      institution: mockInstitution,
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
      institution: mockInstitution,
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
      institution: mockInstitution,
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
      institution: mockInstitution,
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
      institution: mockInstitution,
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
      institution: mockInstitution,
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
      institution: mockInstitution,
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

  it('7a. Parent onSuccess synchronous throw does not block saved confirmation or repeat createCase', async () => {
    vi.mocked(apiClient.createCase).mockResolvedValueOnce({
      case_no: 'CASE-SYNCTHROW-001',
      bureau: 'RB',
      category: 'infrastructure',
      description: 'Sync throw test',
      received_date: '2026-10-28',
      status: 'pending',
      institution: mockInstitution,
    });

    vi.mocked(apiClient.scanOverlaps).mockResolvedValueOnce({ created: 0 });
    vi.mocked(apiClient.getOverlaps).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 100,
    });

    const throwingCallback = vi.fn(() => {
      throw new Error('Sync error in parent onSuccess');
    });

    renderModal({ onSuccess: throwingCallback });
    await fillAndSubmitForm('Testing synchronous parent callback failure');

    // Saved confirmation must appear and not be broken by the callback throw
    await waitFor(() => {
      expect(screen.getByText(/complaint registered: case-syncthrow-001/i)).toBeDefined();
    });

    expect(screen.getByText('Complaint saved; overlap-check status is shown below.')).toBeDefined();
    expect(screen.queryByText(/registering\.\.\./i)).toBeNull();
    expect(throwingCallback).toHaveBeenCalledTimes(1);
    expect(apiClient.createCase).toHaveBeenCalledTimes(1);
  });

  it('7b. Parent onSuccess rejected promise does not block saved confirmation or repeat createCase', async () => {
    vi.mocked(apiClient.createCase).mockResolvedValueOnce({
      case_no: 'CASE-ASYNCREJECT-001',
      bureau: 'RB',
      category: 'infrastructure',
      description: 'Async rejection test',
      received_date: '2026-10-28',
      status: 'pending',
      institution: mockInstitution,
    });

    vi.mocked(apiClient.scanOverlaps).mockResolvedValueOnce({ created: 0 });
    vi.mocked(apiClient.getOverlaps).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 100,
    });

    const rejectingCallback = vi.fn(async () => {
      throw new Error('Async promise rejection in parent onSuccess');
    });

    renderModal({ onSuccess: rejectingCallback });
    await fillAndSubmitForm('Testing asynchronous parent callback rejection');

    await waitFor(() => {
      expect(screen.getByText(/complaint registered: case-asyncreject-001/i)).toBeDefined();
    });

    expect(screen.getByText('Complaint saved; overlap-check status is shown below.')).toBeDefined();
    expect(screen.queryByText(/registering\.\.\./i)).toBeNull();
    expect(rejectingCallback).toHaveBeenCalledTimes(1);
    expect(apiClient.createCase).toHaveBeenCalledTimes(1);
  });

  it('8. Closing and reopening via close button while createCase is pending prevents stale leakage into new session', async () => {
    const deferredCase1 = createDeferred<apiClient.CaseItem>();
    vi.mocked(apiClient.createCase).mockReturnValueOnce(deferredCase1.promise);

    render(
      <MemoryRouter>
        <ModalTestHost />
      </MemoryRouter>
    );

    await fillAndSubmitForm('Case 1 submitted and pending');

    // Modal is in submitting state. Click the actual close button (X button).
    const closeBtn = screen.getByLabelText(/close dialog/i);
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    // Modal dialog is closed
    expect(screen.queryByRole('dialog')).toBeNull();

    // Reopen modal for Session 2
    const reopenBtn = screen.getByRole('button', { name: /reopen modal/i });
    await act(async () => {
      fireEvent.click(reopenBtn);
    });

    // Modal is open again fresh
    expect(screen.getByRole('dialog')).toBeDefined();

    // Now resolve the delayed createCase from Session 1
    await act(async () => {
      deferredCase1.resolve({
        case_no: 'CASE-OLD-STALE-1',
        bureau: 'RB',
        category: 'infrastructure',
        description: 'Case 1 submitted and pending',
        received_date: '2026-10-28',
        status: 'pending',
        institution: mockInstitution,
      });
    });

    // Assert: No stale case confirmation appears in Session 2
    expect(screen.queryByText(/case-old-stale-1/i)).toBeNull();
    // Submitting state is NOT stuck (Submit button is available and enabled)
    const submitBtn = screen.getByRole('button', { name: /register complaint/i });
    expect(submitBtn).toBeDefined();
    expect(submitBtn.hasAttribute('disabled')).toBe(false);
    // Description textarea is fresh and empty
    const descTextarea = screen.getByLabelText(/complaint description/i) as HTMLTextAreaElement;
    expect(descTextarea.value).toBe('');
  });

  it('9. Closing and reopening via close button while overlap scan/fetch is pending prevents stale overlap leakage', async () => {
    const deferredScan1 = createDeferred<apiClient.OverlapScanResponse>();

    vi.mocked(apiClient.createCase).mockResolvedValueOnce({
      case_no: 'CASE-SESSION-1',
      bureau: 'RB',
      category: 'infrastructure',
      description: 'Session 1 case',
      received_date: '2026-10-28',
      status: 'pending',
      institution: mockInstitution,
    });

    // Overlap scan is delayed in Session 1
    vi.mocked(apiClient.scanOverlaps).mockReturnValueOnce(deferredScan1.promise);

    render(
      <MemoryRouter>
        <ModalTestHost />
      </MemoryRouter>
    );

    await fillAndSubmitForm('Session 1 case submitting');

    // Registration is confirmed immediately for Session 1
    await waitFor(() => {
      expect(screen.getByText(/complaint registered: case-session-1/i)).toBeDefined();
    });

    expect(screen.getByText(/checking for overlapping complaints.../i)).toBeDefined();

    // Click actual close button while overlap check is pending
    const closeBtn = screen.getByLabelText(/close dialog/i);
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(screen.queryByRole('dialog')).toBeNull();

    // Reopen modal for Session 2
    const reopenBtn = screen.getByRole('button', { name: /reopen modal/i });
    await act(async () => {
      fireEvent.click(reopenBtn);
    });

    expect(screen.getByRole('dialog')).toBeDefined();

    // Now resolve Session 1's scan and mock getOverlaps with match data for CASE-SESSION-1
    vi.mocked(apiClient.getOverlaps).mockResolvedValueOnce({
      items: [
        {
          id: 777,
          band: 'high',
          review_status: 'needs_review',
          reasons: ['name_match'],
          case_a: { case_no: 'CASE-SESSION-1', bureau: 'RB', status: 'pending' },
          case_b: { case_no: 'CASE-EXISTING-777', bureau: 'PGRC', status: 'pending' },
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    });

    await act(async () => {
      deferredScan1.resolve({ created: 1 });
    });

    // Assert: Session 2 is still the fresh registration form, NOT overwritten by Session 1 results
    expect(screen.queryByText(/potential overlapping cases/i)).toBeNull();
    expect(screen.queryByText(/pair #777/i)).toBeNull();
    expect(screen.queryByText(/case-session-1/i)).toBeNull();
    expect(screen.getByLabelText(/complaint description/i)).toBeDefined();
  });
});
