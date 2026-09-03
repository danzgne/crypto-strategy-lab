import type {
  DiscoveryProgressPayload,
  SearchRunStatus,
  StopReason,
} from '@crypto-strategy-lab/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppPrismaClient } from '@/database/prismaClient';
import type { SearchCoordinator } from '@/api/features/search/services/searchCoordinator';
import {
  type ReSeedHookInput,
  SearchScheduler,
} from '@/api/features/search/services/searchScheduler';

import { defaultSearchSpace } from '../../../helpers/searchFixtures';

describe('SearchScheduler', () => {
  let fakePrisma: {
    searchRun: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let fakeCoordinator: {
    getRun: ReturnType<typeof vi.fn>;
    startRun: ReturnType<typeof vi.fn>;
    stopRun: ReturnType<typeof vi.fn>;
    waitForRunCompletion: ReturnType<typeof vi.fn>;
  };
  let progressUpdates: DiscoveryProgressPayload[];
  let reSeedInvocations: ReSeedHookInput[];

  beforeEach(() => {
    progressUpdates = [];
    reSeedInvocations = [];

    fakePrisma = {
      searchRun: {
        findMany: vi.fn(async () => []),
      },
    };

    fakeCoordinator = {
      getRun: vi.fn(() => ({ inFlightJobs: 2, status: 'RUNNING' })),
      startRun: vi.fn(),
      stopRun: vi.fn(),
      waitForRunCompletion: vi.fn(),
    };
  });

  it('chains runs continuously and invokes re-seed hook between runs', async () => {
    let runCount = 0;
    fakeCoordinator.startRun.mockImplementation(async () => {
      runCount++;
      return `run-${runCount}`;
    });

    fakeCoordinator.waitForRunCompletion.mockImplementation(
      async (runId: string) => {
        if (runId === 'run-1') {
          return {
            acceptedCandidates: 100,
            bestScore: 1.5,
            id: 'run-1',
            ownerId: 'user-1',
            startedAt: 1000,
            status: 'COMPLETED' as SearchRunStatus,
            stopReason: 'CANDIDATE_CAP' as StopReason,
          };
        }
        await scheduler.stopSession('user-1');
        return {
          acceptedCandidates: 40,
          bestScore: 2.1,
          id: 'run-2',
          ownerId: 'user-1',
          startedAt: 2000,
          status: 'COMPLETED' as SearchRunStatus,
          stopReason: 'NO_IMPROVEMENT' as StopReason,
        };
      },
    );

    const scheduler = new SearchScheduler({
      coordinator: fakeCoordinator as unknown as SearchCoordinator,
      interRunDelayMs: 5,
      onProgress: (p) => {
        progressUpdates.push(p);
      },
      onRunComplete: (r) => {
        reSeedInvocations.push(r);
      },
      perUserMaxInFlight: 5,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await scheduler.start();

    const session = await scheduler.startSession({
      searchSpace: defaultSearchSpace,
      userId: 'user-1',
    });

    expect(session.status).toBe('ACTIVE');
    expect(session.userId).toBe('user-1');

    // Wait a brief moment for the chaining to finish 2 runs and stop
    await new Promise((r) => setTimeout(r, 60));

    expect(fakeCoordinator.startRun).toHaveBeenCalledTimes(2);
    expect(reSeedInvocations.length).toBeGreaterThanOrEqual(1);
    expect(reSeedInvocations[0]?.previousRunSummary.id).toBe('run-1');
    expect(reSeedInvocations[0]?.previousRunSummary.stopReason).toBe(
      'CANDIDATE_CAP',
    );
    expect(progressUpdates.length).toBeGreaterThan(0);
  });

  it('supports pause, resume, and stop lifecycle', async () => {
    let runIdCounter = 0;
    fakeCoordinator.startRun.mockImplementation(async () => {
      runIdCounter++;
      return `run-${runIdCounter}`;
    });

    let resolveCompletion:
      | ((val: {
          acceptedCandidates: number;
          bestScore: number;
          id: string;
          status: string;
          stopReason: string;
        }) => void)
      | undefined;

    fakeCoordinator.waitForRunCompletion.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCompletion = resolve;
        }),
    );
    fakeCoordinator.stopRun.mockImplementation(async (runId: string) => {
      resolveCompletion?.({
        acceptedCandidates: 5,
        bestScore: 1.1,
        id: runId,
        status: 'COMPLETED',
        stopReason: 'USER_STOPPED',
      });
      return true;
    });

    const scheduler = new SearchScheduler({
      coordinator: fakeCoordinator as unknown as SearchCoordinator,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await scheduler.start();

    await scheduler.startSession({
      searchSpace: defaultSearchSpace,
      userId: 'user-2',
    });

    expect(scheduler.getSession('user-2')?.status).toBe('ACTIVE');

    // Pause session
    const paused = await scheduler.pauseSession('user-2');
    expect(paused).toBe(true);
    expect(scheduler.getSession('user-2')?.status).toBe('PAUSED');
    expect(fakeCoordinator.stopRun).toHaveBeenCalledWith(
      'run-1',
      'USER_STOPPED',
    );

    // Resume session
    const resumed = await scheduler.resumeSession('user-2');
    expect(resumed).toBe(true);
    expect(scheduler.getSession('user-2')?.status).toBe('ACTIVE');

    // Stop session
    const stopped = await scheduler.stopSession('user-2');
    expect(stopped).toBe(true);
    expect(scheduler.getSession('user-2')).toBeNull();
  });

  it('enforces per-user in-flight job cap within global stop policy', async () => {
    fakeCoordinator.startRun.mockResolvedValue('run-cap-1');
    fakeCoordinator.waitForRunCompletion.mockResolvedValue({
      acceptedCandidates: 5,
      bestScore: 1.1,
      id: 'run-cap-1',
      status: 'COMPLETED',
      stopReason: 'CANDIDATE_CAP',
    });

    const scheduler = new SearchScheduler({
      coordinator: fakeCoordinator as unknown as SearchCoordinator,
      perUserMaxInFlight: 5,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await scheduler.start();

    await scheduler.startSession({
      searchSpace: defaultSearchSpace,
      stopPolicy: { maxInFlight: 20 }, // requested 20, should be clamped to 5
      userId: 'user-3',
    });

    expect(fakeCoordinator.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        stopPolicy: expect.objectContaining({
          maxInFlight: 5,
        }),
      }),
    );

    await scheduler.stopSession('user-3');
  });

  it('forwards the selected algorithm to the coordinator instead of an implicit default', async () => {
    fakeCoordinator.startRun.mockResolvedValue('run-algo-1');
    fakeCoordinator.waitForRunCompletion.mockReturnValue(new Promise(() => {}));

    const scheduler = new SearchScheduler({
      coordinator: fakeCoordinator as unknown as SearchCoordinator,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await scheduler.start();

    await scheduler.startSession({
      algorithm: 'random-v1',
      searchSpace: defaultSearchSpace,
      userId: 'user-algo',
    });

    expect(fakeCoordinator.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ algorithmName: 'random-v1' }),
    );

    await scheduler.stopSession('user-algo');
  });

  it('rejects an unregistered algorithm before starting any run', async () => {
    const scheduler = new SearchScheduler({
      coordinator: fakeCoordinator as unknown as SearchCoordinator,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await scheduler.start();

    await expect(
      scheduler.startSession({
        algorithm: 'domain-guided',
        searchSpace: defaultSearchSpace,
        userId: 'user-rejected',
      }),
    ).rejects.toThrow('Unsupported search algorithm: domain-guided');

    expect(fakeCoordinator.startRun).not.toHaveBeenCalled();
    expect(scheduler.getSession('user-rejected')).toBeNull();
  });

  it('retrieves historical runs with stop reasons', async () => {
    fakePrisma.searchRun.findMany.mockResolvedValue([
      {
        acceptedCandidates: 50,
        algorithm: 'random',
        bestScore: '1.45',
        id: 'run-hist-1',
        ownerId: 'user-4',
        startedAt: new Date('2026-09-01T10:00:00Z'),
        status: 'COMPLETED',
        stopReason: 'TIME_BUDGET',
        stoppedAt: new Date('2026-09-01T10:15:00Z'),
      },
    ]);

    const scheduler = new SearchScheduler({
      coordinator: fakeCoordinator as unknown as SearchCoordinator,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    const history = await scheduler.getHistoricalRuns('user-4');
    expect(history.length).toBe(1);
    expect(history[0]?.id).toBe('run-hist-1');
    expect(history[0]?.stopReason).toBe('TIME_BUDGET');
    expect(history[0]?.bestScore).toBe(1.45);
  });

  it('handles coordinator progress and emits live discovery progress payload', async () => {
    fakeCoordinator.startRun.mockResolvedValue('run-live-1');
    fakeCoordinator.waitForRunCompletion.mockReturnValue(new Promise(() => {})); // pending

    const scheduler = new SearchScheduler({
      coordinator: fakeCoordinator as unknown as SearchCoordinator,
      onProgress: (p) => {
        progressUpdates.push(p);
      },
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await scheduler.start();

    await scheduler.startSession({
      searchSpace: defaultSearchSpace,
      userId: 'user-live',
    });

    scheduler.handleCoordinatorProgress({
      acceptedCandidates: 15,
      bestScore: 2.34,
      inFlightJobs: 3,
      ownerId: 'user-live',
      searchRunId: 'run-live-1',
      status: 'RUNNING',
      stopReason: null,
    });

    expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
    const lastUpdate = progressUpdates[progressUpdates.length - 1];
    expect(lastUpdate?.acceptedCandidates).toBe(15);
    expect(lastUpdate?.bestScore).toBe(2.34);
    expect(lastUpdate?.inFlightJobs).toBe(3);
    expect(lastUpdate?.runStatus).toBe('RUNNING');
  });

  it('returns the live in-progress run stats on demand, not just via the progress callback', async () => {
    fakeCoordinator.startRun.mockResolvedValue('run-pull-1');
    fakeCoordinator.waitForRunCompletion.mockReturnValue(new Promise(() => {})); // pending
    fakeCoordinator.getRun.mockReturnValue({
      acceptedCandidates: 51,
      bestScore: 0.3997,
      inFlightJobs: 2,
      status: 'STOPPING',
    });

    const scheduler = new SearchScheduler({
      coordinator: fakeCoordinator as unknown as SearchCoordinator,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await scheduler.start();
    await scheduler.startSession({
      searchSpace: defaultSearchSpace,
      userId: 'user-pull',
    });

    const progress = scheduler.getSessionProgress('user-pull');
    expect(progress?.acceptedCandidates).toBe(51);
    expect(progress?.inFlightJobs).toBe(2);
    expect(progress?.runStatus).toBe('STOPPING');
    expect(progress?.bestScore).toBe(0.3997);
  });

  it('returns null session progress for a user with no active session', () => {
    const scheduler = new SearchScheduler({
      coordinator: fakeCoordinator as unknown as SearchCoordinator,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    expect(scheduler.getSessionProgress('nobody')).toBeNull();
  });

  it('triggers trade retention pruning when a run completes', async () => {
    fakeCoordinator.startRun.mockResolvedValue('run-prune-1');
    fakeCoordinator.waitForRunCompletion.mockImplementation(async () => {
      await scheduler.stopSession('user-prune');
      return {
        acceptedCandidates: 10,
        bestScore: 1.5,
        id: 'run-prune-1',
        ownerId: 'user-prune',
        startedAt: 1000,
        status: 'COMPLETED' as SearchRunStatus,
        stopReason: 'CANDIDATE_CAP' as StopReason,
      };
    });

    const mockTradeRetention = {
      pruneTrades: vi.fn(async () => ({
        eligibleExperimentsCount: 2,
        prunedTradesCount: 10,
      })),
    };

    const scheduler = new SearchScheduler({
      coordinator: fakeCoordinator as unknown as SearchCoordinator,
      interRunDelayMs: 5,
      prisma: fakePrisma as unknown as AppPrismaClient,
      tradeRetentionService: mockTradeRetention as never,
    });

    await scheduler.start();

    await scheduler.startSession({
      searchSpace: defaultSearchSpace,
      userId: 'user-prune',
    });

    await new Promise((r) => setTimeout(r, 60));

    expect(mockTradeRetention.pruneTrades).toHaveBeenCalled();
  });
});
