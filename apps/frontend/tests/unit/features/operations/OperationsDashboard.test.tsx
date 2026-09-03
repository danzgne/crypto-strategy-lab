import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationsSnapshot } from '@crypto-strategy-lab/shared';

import { DashboardShell } from '../../../../src/features/dashboard/components/DashboardShell';
import { OperationsDashboard } from '../../../../src/features/operations/components/OperationsDashboard';
import * as operationsClient from '../../../../src/features/operations/api/operationsClient';
import { ApiError } from '../../../../src/shared/api/apiError';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/operations',
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

const mockSnapshot: OperationsSnapshot = {
  jobs: {
    countByStatus: {
      CLAIMED: 2,
      COMPLETED: 150,
      FAILED: 5,
      PENDING: 10,
    },
    oldestPendingAgeMs: 45000, // 45s
  },
  outbox: {
    deadLetterCount: 1,
    eligibleBacklog: 8,
    oldestUnpublishedAgeMs: 12000,
    recentDeadLetters: [
      {
        attemptCount: 8,
        deadLetteredAt: '2026-09-03T11:55:00.000Z',
        eventId: 'evt-dl-1',
        id: 'dl-1',
        lastError: 'Sanitized dead letter error',
        name: 'BacktestCompleted',
      },
    ],
    retryingCount: 2,
  },
  queriedAt: '2026-09-03T12:00:00.000Z',
  recentFailures: [
    {
      createdAt: '2026-09-03T11:40:00.000Z',
      errorSummary: 'Dataset snapshot missing',
      experimentId: 'exp-failure-1',
      failedAt: '2026-09-03T11:45:00.000Z',
      failureCategory: 'PERMANENT',
      jobId: 'job-failed-12345',
      retryCount: 1,
      workerId: 'worker-node-1',
    },
  ],
  rolling24h: {
    executionP50Ms: 1800,
    executionP95Ms: 4200,
    failures: 5,
    leaseLosses: 1,
    queueWaitP50Ms: 250,
    queueWaitP95Ms: 900,
    retries: 6,
    throughput: 140,
  },
  workers: {
    activeCount: 1,
    instances: [
      {
        instanceId: 'worker-node-1',
        lastSeenAt: '2026-09-03T11:59:58.000Z',
        service: 'backtest-worker',
        startedAt: '2026-09-03T08:00:00.000Z',
        status: 'active',
        stoppedAt: null,
      },
      {
        instanceId: 'worker-node-stale',
        lastSeenAt: '2026-09-03T11:58:00.000Z',
        service: 'backtest-worker',
        startedAt: '2026-09-03T08:00:00.000Z',
        status: 'stale',
        stoppedAt: null,
      },
    ],
    staleCount: 1,
    stoppedCount: 0,
  },
};

describe('OperationsDashboard and Role Navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Sidebar Role Visibility', () => {
    it('shows Operations nav link when user role is ADMIN', () => {
      render(
        <DashboardShell
          user={{
            id: 'admin-1',
            email: 'admin@crypto.lab',
            role: 'ADMIN',
          }}
        >
          <div>Page Content</div>
        </DashboardShell>,
      );

      const operationsLink = screen.getByRole('link', { name: /Operations/i });
      expect(operationsLink).toBeInTheDocument();
      expect(operationsLink).toHaveAttribute('href', '/admin/operations');
    });

    it('hides Operations nav link when user role is USER', () => {
      render(
        <DashboardShell
          user={{
            id: 'user-1',
            email: 'user@crypto.lab',
            role: 'USER',
          }}
        >
          <div>Page Content</div>
        </DashboardShell>,
      );

      expect(
        screen.queryByRole('link', { name: /Operations/i }),
      ).not.toBeInTheDocument();
    });

    it('hides Operations nav link when user is undefined', () => {
      render(
        <DashboardShell>
          <div>Page Content</div>
        </DashboardShell>,
      );

      expect(
        screen.queryByRole('link', { name: /Operations/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Dashboard Component States', () => {
    it('renders loading skeleton while initial fetch is pending', () => {
      vi.spyOn(operationsClient, 'fetchOperationsSnapshot').mockImplementation(
        () => new Promise(() => {}),
      );

      render(<OperationsDashboard />);

      expect(
        screen.getByTestId('operations-loading-state'),
      ).toBeInTheDocument();
    });

    it('renders forbidden state when API returns 403', async () => {
      vi.spyOn(operationsClient, 'fetchOperationsSnapshot').mockRejectedValue(
        new ApiError(403, 'Forbidden: Insufficient role'),
      );

      render(<OperationsDashboard />);

      await waitFor(() => {
        expect(
          screen.getByTestId('operations-forbidden-state'),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Administrator Privileges Required/i),
      ).toBeInTheDocument();
    });

    it('renders fetch error state when request fails with non-auth error', async () => {
      vi.spyOn(operationsClient, 'fetchOperationsSnapshot').mockRejectedValue(
        new Error('Network disconnected'),
      );

      render(<OperationsDashboard />);

      await waitFor(() => {
        expect(
          screen.getByTestId('operations-error-state'),
        ).toBeInTheDocument();
      });
      expect(screen.getByText('Network disconnected')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Retry Connection/i }),
      ).toBeInTheDocument();
    });

    it('renders empty state when snapshot has zero activity', async () => {
      const emptySnapshot: OperationsSnapshot = {
        jobs: {
          countByStatus: { CLAIMED: 0, COMPLETED: 0, FAILED: 0, PENDING: 0 },
          oldestPendingAgeMs: null,
        },
        outbox: {
          deadLetterCount: 0,
          eligibleBacklog: 0,
          oldestUnpublishedAgeMs: null,
          recentDeadLetters: [],
          retryingCount: 0,
        },
        queriedAt: '2026-09-03T12:00:00.000Z',
        recentFailures: [],
        rolling24h: {
          executionP50Ms: null,
          executionP95Ms: null,
          failures: 0,
          leaseLosses: 0,
          queueWaitP50Ms: null,
          queueWaitP95Ms: null,
          retries: 0,
          throughput: 0,
        },
        workers: {
          activeCount: 0,
          instances: [],
          staleCount: 0,
          stoppedCount: 0,
        },
      };

      vi.spyOn(operationsClient, 'fetchOperationsSnapshot').mockResolvedValue(
        emptySnapshot,
      );

      render(<OperationsDashboard />);

      await waitFor(() => {
        expect(
          screen.getByTestId('operations-empty-state'),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText(/No Operations Activity Recorded/i),
      ).toBeInTheDocument();
    });

    it('renders full operations snapshot data with all telemetry sections', async () => {
      vi.spyOn(operationsClient, 'fetchOperationsSnapshot').mockResolvedValue(
        mockSnapshot,
      );

      render(<OperationsDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('operations-dashboard')).toBeInTheDocument();
      });

      // Headers and badges
      expect(
        screen.getByText('Operations & Telemetry Dashboard'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('live-status-badge')).toHaveTextContent(
        'Live (5s Refresh)',
      );

      // Job counts
      expect(screen.getByText('Pending Jobs')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('Claimed (Running)')).toBeInTheDocument();
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Completed Total')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();

      // 24h Metrics
      expect(screen.getByText('140')).toBeInTheDocument(); // Throughput
      expect(screen.getByText('Wait P50')).toBeInTheDocument();
      expect(screen.getByText('250ms')).toBeInTheDocument();
      expect(screen.getByText('Exec P50')).toBeInTheDocument();
      expect(screen.getByText('1.8s')).toBeInTheDocument();

      // Worker instances
      const workerTable = screen.getByTestId('worker-instances-table');
      expect(
        within(workerTable).getByText('worker-node-1'),
      ).toBeInTheDocument();
      expect(
        within(workerTable).getByText('worker-node-stale'),
      ).toBeInTheDocument();

      // Outbox health
      expect(screen.getByTestId('dead-letters-table')).toBeInTheDocument();
      expect(screen.getByText('evt-dl-1')).toBeInTheDocument();
      expect(
        screen.getByText('Sanitized dead letter error'),
      ).toBeInTheDocument();

      // Recent Failures
      expect(screen.getByTestId('recent-failures-table')).toBeInTheDocument();
      expect(screen.getByText('Dataset snapshot missing')).toBeInTheDocument();
    });

    it('enforces read-only constraint: contains no mutation controls', async () => {
      vi.spyOn(operationsClient, 'fetchOperationsSnapshot').mockResolvedValue(
        mockSnapshot,
      );

      render(<OperationsDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('operations-dashboard')).toBeInTheDocument();
      });

      // Verify absence of any mutation action buttons
      expect(
        screen.queryByRole('button', { name: /cancel/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /requeue/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /replay/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /pause/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /scale/i }),
      ).not.toBeInTheDocument();
      // No retry control for jobs (only error boundary has retry connection)
      expect(
        screen.queryByRole('button', { name: /retry job/i }),
      ).not.toBeInTheDocument();
    });

    it('refreshes every 5 seconds', async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .spyOn(operationsClient, 'fetchOperationsSnapshot')
        .mockResolvedValue(mockSnapshot);

      render(<OperationsDashboard />);

      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Fast-forward 5 seconds
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Fast-forward another 5 seconds
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });
  });
});
