import type {
  AnyDomainEvent,
  CandidateStrategy,
  DomainEventEnvelope,
  DomainEventName,
  StrategyGenerator,
} from '@crypto-strategy-lab/shared';
import { createDomainEvent } from '@crypto-strategy-lab/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppPrismaClient } from '@/database/prismaClient';
import type {
  EnqueueJobInput,
  SearchEventBus,
} from '@/api/features/search/services/searchCoordinator';
import { SearchCoordinator } from '@/api/features/search/services/searchCoordinator';

import { defaultSearchSpace } from '../../../helpers/searchFixtures';

class FakeEventBus implements SearchEventBus {
  private handlers = new Map<
    string,
    ((event: DomainEventEnvelope<DomainEventName>) => void | Promise<void>)[]
  >();
  public publishedEvents: AnyDomainEvent[] = [];

  public async publish(event: AnyDomainEvent): Promise<void> {
    this.publishedEvents.push(event);
    const list = this.handlers.get(event.name) ?? [];
    for (const handler of list) {
      await handler(event as DomainEventEnvelope<DomainEventName>);
    }
  }

  public subscribe<TName extends DomainEventName>(
    name: TName,
    handler: (event: DomainEventEnvelope<TName>) => void | Promise<void>,
  ): () => void {
    const list = this.handlers.get(name) ?? [];
    list.push(
      handler as (
        event: DomainEventEnvelope<DomainEventName>,
      ) => void | Promise<void>,
    );
    this.handlers.set(name, list);
    return () => {
      const current = this.handlers.get(name) ?? [];
      this.handlers.set(
        name,
        current.filter((h) => h !== handler),
      );
    };
  }
}

class FakeGenerator implements StrategyGenerator {
  private count = 0;

  public constructor(private readonly duplicateEveryN = 0) {}

  public generate(): CandidateStrategy {
    this.count++;
    const id =
      this.duplicateEveryN > 0 && this.count % this.duplicateEveryN === 0
        ? `dup-${Math.floor(this.count / this.duplicateEveryN)}`
        : `cand-${this.count}`;

    return {
      fingerprint: `fp-${id}`,
      parameterSnapshots: [{ period: 10 + this.count }],
      provenance: { algorithm: 'fake', generationOrdinal: this.count },
      strategyIds: ['ma'],
    };
  }
}

interface MockPrisma {
  $transaction: (
    callback: (tx: {
      experiment: {
        create: (args: {
          data: Record<string, unknown>;
        }) => Promise<Record<string, unknown>>;
      };
      strategyDefinition: {
        create: (args: {
          data: Record<string, unknown>;
        }) => Promise<Record<string, unknown>>;
      };
      strategyVersion: {
        create: (args: {
          data: Record<string, unknown>;
        }) => Promise<Record<string, unknown>>;
        findFirst: () => Promise<null>;
      };
    }) => Promise<unknown>,
  ) => Promise<unknown>;
  backtestJob: {
    create: (args: {
      data: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
    findFirst: (args: {
      select?: Record<string, boolean>;
      where?: Record<string, unknown>;
    }) => Promise<{ status: string } | null>;
  };
  experiment: {
    findMany: (
      args?: Record<string, unknown>,
    ) => Promise<Record<string, unknown>[]>;
  };
  datasetSnapshot?: {
    findFirst: (
      args?: Record<string, unknown>,
    ) => Promise<Record<string, unknown> | null>;
    upsert: (
      args?: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
  };
  searchRun: {
    create: (args: {
      data: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
    findMany: (
      args?: Record<string, unknown>,
    ) => Promise<Record<string, unknown>[]>;
    update: (args: {
      data: Record<string, unknown>;
      where: { id: string };
    }) => Promise<Record<string, unknown>>;
  };
}

describe('SearchCoordinator', () => {
  let fakePrisma: MockPrisma;
  let fakeEventBus: FakeEventBus;
  let enqueuedJobs: EnqueueJobInput[];
  let searchRunsDb: Map<string, Record<string, unknown>>;
  let experimentsDb: Map<string, Record<string, unknown>>;

  beforeEach(() => {
    fakeEventBus = new FakeEventBus();
    enqueuedJobs = [];
    searchRunsDb = new Map();
    experimentsDb = new Map();

    fakePrisma = {
      $transaction: vi.fn(async (callback) => {
        const tx = {
          experiment: {
            create: vi.fn(async ({ data }) => {
              const id = `exp-${experimentsDb.size + 1}`;
              const exp = { ...data, id };
              experimentsDb.set(id, exp);
              return exp;
            }),
          },
          strategyDefinition: {
            create: vi.fn(async ({ data }) => ({
              ...data,
              id: `def-${Math.random()}`,
            })),
          },
          strategyVersion: {
            create: vi.fn(async ({ data }) => ({
              ...data,
              id: `ver-${Math.random()}`,
            })),
            findFirst: vi.fn(async () => null),
          },
        };
        return callback(tx);
      }),
      backtestJob: {
        create: vi.fn(async ({ data }) => {
          const id = `job-${Math.random()}`;
          return { ...data, id };
        }),
        findFirst: vi.fn(async () => null),
      },
      experiment: {
        findMany: vi.fn(async () => []),
      },
      searchRun: {
        create: vi.fn(async ({ data }) => {
          const id = `run-${searchRunsDb.size + 1}`;
          const run = {
            ...data,
            acceptedCandidates: 0,
            bestScore: null,
            consecutiveFailures: 0,
            consecutiveNoImprovement: 0,
            createdAt: new Date(),
            id,
            inFlightJobs: 0,
            startedAt: new Date(),
            status: data.status ?? 'RUNNING',
            stopReason: null,
            stoppedAt: null,
            updatedAt: new Date(),
          };
          searchRunsDb.set(id, run);
          return run;
        }),
        findMany: vi.fn(async () => []),
        update: vi.fn(async ({ data, where }) => {
          const existing = searchRunsDb.get(where.id);
          if (existing) {
            Object.assign(existing, data);
            return existing;
          }
          return { id: where.id, ...data };
        }),
      },
    };
  });

  it('stops at candidate cap and emits StrategyGenerated events', async () => {
    const coordinator = new SearchCoordinator({
      enqueueJob: async (input) => {
        enqueuedJobs.push(input);
        return `job-${enqueuedJobs.length}`;
      },
      eventBus: fakeEventBus,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await coordinator.start();

    const runId = await coordinator.startRun({
      generator: new FakeGenerator(),
      ownerId: 'user-1',
      searchSpace: defaultSearchSpace,
      stopPolicy: {
        maxCandidates: 5,
        maxInFlight: 10,
      },
    });

    // Give generation loop time to complete
    await new Promise((r) => setTimeout(r, 50));

    const state = coordinator.getRun(runId);
    expect(state?.acceptedCandidates).toBe(5);
    expect(state?.status).toBe('STOPPING');
    expect(state?.stopReason).toBe('CANDIDATE_CAP');
    expect(enqueuedJobs.length).toBe(5);

    // Verify StrategyGenerated events were published
    const generatedEvents = fakeEventBus.publishedEvents.filter(
      (e) => e.name === 'StrategyGenerated',
    );
    expect(generatedEvents.length).toBe(5);
  });

  it('deduplicates candidate fingerprints and does not increment failure count', async () => {
    const coordinator = new SearchCoordinator({
      enqueueJob: async (input) => {
        enqueuedJobs.push(input);
        return `job-${enqueuedJobs.length}`;
      },
      eventBus: fakeEventBus,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await coordinator.start();

    // Generator duplicates every 2nd candidate
    const runId = await coordinator.startRun({
      generator: new FakeGenerator(2),
      ownerId: 'user-1',
      searchSpace: defaultSearchSpace,
      stopPolicy: {
        maxCandidates: 3,
        maxInFlight: 10,
      },
    });

    await new Promise((r) => setTimeout(r, 50));

    const state = coordinator.getRun(runId);
    expect(state?.acceptedCandidates).toBe(3);
    expect(state?.consecutiveFailures).toBe(0);
    expect(enqueuedJobs.length).toBe(3);
  });

  it('stops at consecutive no improvement and tracks best score', async () => {
    const coordinator = new SearchCoordinator({
      enqueueJob: async (input) => {
        enqueuedJobs.push(input);
        return `job-${enqueuedJobs.length}`;
      },
      eventBus: fakeEventBus,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await coordinator.start();

    const runId = await coordinator.startRun({
      generator: new FakeGenerator(),
      ownerId: 'user-1',
      searchSpace: defaultSearchSpace,
      stopPolicy: {
        maxCandidates: 100,
        maxInFlight: 10,
        maxNoImprovement: 2,
        scoreEpsilon: 0.01,
      },
    });

    await new Promise((r) => setTimeout(r, 20));

    // First evaluation sets best score
    await coordinator.handleStrategyEvaluated({
      endTime: 1700000000000,
      experimentId: enqueuedJobs[0]?.experimentId ?? '',
      maxDrawdown: '0.1',
      memberStrategies: [],
      ownerId: 'user-1',
      pair: 'BTCUSDT',
      return: '0.2',
      score: '1.5',
      startTime: 1690000000000,
      strategyDisplayName: 'MA',
      strategyKind: 'singular',
      strategyVersionId: 'v1',
      timeframe: '1h',
      totalProfit: '200',
      totalTrades: 10,
      winRate: '0.6',
    });

    let state = coordinator.getRun(runId);
    expect(state?.bestScore).toBe(1.5);
    expect(state?.consecutiveNoImprovement).toBe(0);

    // Second evaluation with worse score -> no improvement = 1
    await coordinator.handleStrategyEvaluated({
      endTime: 1700000000000,
      experimentId: enqueuedJobs[1]?.experimentId ?? '',
      maxDrawdown: '0.1',
      memberStrategies: [],
      ownerId: 'user-1',
      pair: 'BTCUSDT',
      return: '0.1',
      score: '1.2',
      startTime: 1690000000000,
      strategyDisplayName: 'MA',
      strategyKind: 'singular',
      strategyVersionId: 'v1',
      timeframe: '1h',
      totalProfit: '100',
      totalTrades: 10,
      winRate: '0.5',
    });

    state = coordinator.getRun(runId);
    expect(state?.consecutiveNoImprovement).toBe(1);

    // Third evaluation with worse score -> no improvement = 2 >= maxNoImprovement -> STOPPING
    await coordinator.handleStrategyEvaluated({
      endTime: 1700000000000,
      experimentId: enqueuedJobs[2]?.experimentId ?? '',
      maxDrawdown: '0.1',
      memberStrategies: [],
      ownerId: 'user-1',
      pair: 'BTCUSDT',
      return: '0.1',
      score: '1.1',
      startTime: 1690000000000,
      strategyDisplayName: 'MA',
      strategyKind: 'singular',
      strategyVersionId: 'v1',
      timeframe: '1h',
      totalProfit: '50',
      totalTrades: 10,
      winRate: '0.4',
    });

    state = coordinator.getRun(runId);
    expect(state?.status).toBe('STOPPING');
    expect(state?.stopReason).toBe('NO_IMPROVEMENT');
  });

  it('drains in-flight jobs and marks COMPLETED when reaching 0 in-flight', async () => {
    const coordinator = new SearchCoordinator({
      enqueueJob: async (input) => {
        enqueuedJobs.push(input);
        return `job-${enqueuedJobs.length}`;
      },
      eventBus: fakeEventBus,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await coordinator.start();

    const runId = await coordinator.startRun({
      generator: new FakeGenerator(),
      ownerId: 'user-1',
      searchSpace: defaultSearchSpace,
      stopPolicy: {
        maxCandidates: 2,
        maxInFlight: 10,
      },
    });

    await new Promise((r) => setTimeout(r, 30));

    expect(enqueuedJobs.length).toBe(2);

    // Evaluate job 1
    await coordinator.handleStrategyEvaluated({
      endTime: 1700000000000,
      experimentId: enqueuedJobs[0]?.experimentId ?? '',
      maxDrawdown: '0.1',
      memberStrategies: [],
      ownerId: 'user-1',
      pair: 'BTCUSDT',
      return: '0.1',
      score: '1.0',
      startTime: 1690000000000,
      strategyDisplayName: 'MA',
      strategyKind: 'singular',
      strategyVersionId: 'v1',
      timeframe: '1h',
      totalProfit: '100',
      totalTrades: 5,
      winRate: '0.5',
    });

    let state = coordinator.getRun(runId);
    expect(state?.inFlightJobs).toBe(1);
    expect(state?.status).toBe('STOPPING');

    // Evaluate job 2 -> all drained -> COMPLETED
    await coordinator.handleStrategyEvaluated({
      endTime: 1700000000000,
      experimentId: enqueuedJobs[1]?.experimentId ?? '',
      maxDrawdown: '0.1',
      memberStrategies: [],
      ownerId: 'user-1',
      pair: 'BTCUSDT',
      return: '0.2',
      score: '2.0',
      startTime: 1690000000000,
      strategyDisplayName: 'MA',
      strategyKind: 'singular',
      strategyVersionId: 'v1',
      timeframe: '1h',
      totalProfit: '200',
      totalTrades: 5,
      winRate: '0.6',
    });

    state = coordinator.getRun(runId);
    expect(state?.inFlightJobs).toBe(0);
    expect(state?.status).toBe('COMPLETED');
    expect(state?.stopReason).toBe('CANDIDATE_CAP');
  });

  it('stops when time budget is exceeded', async () => {
    const coordinator = new SearchCoordinator({
      enqueueJob: async (input) => {
        enqueuedJobs.push(input);
        return `job-${enqueuedJobs.length}`;
      },
      eventBus: fakeEventBus,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await coordinator.start();

    const runId = await coordinator.startRun({
      generator: new FakeGenerator(),
      ownerId: 'user-1',
      searchSpace: defaultSearchSpace,
      stopPolicy: {
        maxCandidates: 1000,
        maxInFlight: 10,
        timeBudgetMs: 10, // 10ms budget
      },
    });

    await new Promise((r) => setTimeout(r, 60));

    const state = coordinator.getRun(runId);
    expect(state?.status).toBe('STOPPING');
    expect(state?.stopReason).toBe('TIME_BUDGET');
  });

  it('stops when consecutive failures reach limit and marks FAILED', async () => {
    fakePrisma.backtestJob.findFirst = vi.fn(async () => ({
      status: 'FAILED',
    }));

    const coordinator = new SearchCoordinator({
      enqueueJob: async (input) => {
        enqueuedJobs.push(input);
        return `job-${enqueuedJobs.length}`;
      },
      eventBus: fakeEventBus,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await coordinator.start();

    const runId = await coordinator.startRun({
      generator: new FakeGenerator(),
      ownerId: 'user-1',
      searchSpace: defaultSearchSpace,
      stopPolicy: {
        maxCandidates: 10,
        maxConsecutiveFailures: 2,
        maxInFlight: 2,
      },
    });

    await new Promise((r) => setTimeout(r, 30));

    // First backtest completes with failure
    await coordinator.handleBacktestCompleted(
      enqueuedJobs[0]?.experimentId ?? '',
    );
    let state = coordinator.getRun(runId);
    expect(state?.consecutiveFailures).toBe(1);

    // Second backtest completes with failure -> triggers stop and drains to FAILED
    await coordinator.handleBacktestCompleted(
      enqueuedJobs[1]?.experimentId ?? '',
    );
    state = coordinator.getRun(runId);
    expect(state?.consecutiveFailures).toBe(2);
    expect(state?.stopReason).toBe('CONSECUTIVE_FAILURES');
    expect(state?.status).toBe('FAILED');
  });

  it('discards candidates with conflicting timeframe without counting as failure', async () => {
    class ConflictingGenerator implements StrategyGenerator {
      private count = 0;
      public generate(): CandidateStrategy {
        this.count++;
        return {
          fingerprint: `fp-${this.count}`,
          parameterSnapshots: [{ timeframe: '5m' }], // conflicts with searchSpace's '1h'
          provenance: { algorithm: 'fake', generationOrdinal: this.count },
          strategyIds: ['rule'],
        };
      }
    }

    const coordinator = new SearchCoordinator({
      enqueueJob: async (input) => {
        enqueuedJobs.push(input);
        return `job-${enqueuedJobs.length}`;
      },
      eventBus: fakeEventBus,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await coordinator.start();

    const runId = await coordinator.startRun({
      generator: new ConflictingGenerator(),
      ownerId: 'user-1',
      searchSpace: defaultSearchSpace,
      stopPolicy: {
        maxCandidates: 5,
        maxInFlight: 10,
        timeBudgetMs: 20,
      },
    });

    await new Promise((r) => setTimeout(r, 60));

    const state = coordinator.getRun(runId);
    // Should have discarded conflicting candidates without queuing jobs or recording failures
    expect(enqueuedJobs.length).toBe(0);
    expect(state?.consecutiveFailures).toBe(0);
    expect(state?.status).toBe('COMPLETED');
    expect(state?.stopReason).toBe('TIME_BUDGET');
  });

  it('restores running search runs and seen fingerprints from database', async () => {
    fakePrisma.searchRun.findMany = vi.fn(async () => [
      {
        acceptedCandidates: 3,
        algorithm: 'random',
        bestScore: 1.2,
        consecutiveFailures: 0,
        consecutiveNoImprovement: 1,
        id: 'run-existing',
        ownerId: 'user-1',
        searchConfig: {
          searchSpace: defaultSearchSpace,
          stopPolicy: { maxCandidates: 10 },
        },
        startedAt: new Date(),
        status: 'RUNNING',
        stopReason: null,
      },
    ]);

    fakePrisma.experiment.findMany = vi.fn(async () => [
      {
        backtestJob: { status: 'COMPLETED' },
        datasetSnapshotId: 'snapshot-existing',
        fingerprint: 'fp-1',
        id: 'exp-1',
        score: '1.2',
      },
      {
        backtestJob: { status: 'PENDING' },
        datasetSnapshotId: 'snapshot-existing',
        fingerprint: 'fp-2',
        id: 'exp-2',
        score: null,
      },
    ]);

    const coordinator = new SearchCoordinator({
      enqueueJob: async (input) => {
        enqueuedJobs.push(input);
        return `job-${enqueuedJobs.length}`;
      },
      eventBus: fakeEventBus,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await coordinator.start();

    const state = coordinator.getRun('run-existing');
    expect(state).toBeDefined();
    expect(state?.seenFingerprints.has('fp-1')).toBe(true);
    expect(state?.seenFingerprints.has('fp-2')).toBe(true);
    expect(state?.inFlightJobs).toBe(1);
    expect(state?.bestScore).toBe(1.2);
    expect(state?.datasetSnapshotId).toBe('snapshot-existing');
  });

  it('prepares dataset snapshot via historyProvider and attaches datasetSnapshotId to candidate experiments', async () => {
    const createdExperiments: Record<string, unknown>[] = [];
    fakePrisma.$transaction = vi.fn(async (cb) =>
      cb({
        experiment: {
          create: vi.fn(async (args) => {
            const exp = {
              id: `exp-${createdExperiments.length + 1}`,
              ...args.data,
            };
            createdExperiments.push(exp);
            return exp;
          }),
        },
        strategyDefinition: {
          create: vi.fn(async (args) => ({ id: 'def-1', ...args.data })),
        },
        strategyVersion: {
          create: vi.fn(async (args) => ({ id: 'ver-1', ...args.data })),
          findFirst: vi.fn(async () => null),
        },
      }),
    );

    const mockHistoryProvider = {
      prepareHistoricalCandles: vi.fn(async () => ({
        candles: [
          {
            close: 100,
            high: 105,
            low: 95,
            open: 100,
            openTime: 1000,
            volume: 10,
          },
        ],
        warmupCandleCount: 1,
      })),
    };

    fakePrisma.datasetSnapshot = {
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async () => ({ id: 'snapshot-123' })),
    };

    const coordinator = new SearchCoordinator({
      enqueueJob: async (input) => {
        enqueuedJobs.push(input);
        return `job-${enqueuedJobs.length}`;
      },
      eventBus: fakeEventBus,
      historyProvider: mockHistoryProvider as never,
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await coordinator.startRun({
      generator: new FakeGenerator(),
      ownerId: 'user-1',
      searchSpace: defaultSearchSpace,
      stopPolicy: { maxCandidates: 1 },
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(mockHistoryProvider.prepareHistoricalCandles).toHaveBeenCalled();
    expect(fakePrisma.datasetSnapshot.upsert).toHaveBeenCalled();
    expect(createdExperiments.length).toBe(1);
    expect(createdExperiments[0]?.datasetSnapshotId).toBe('snapshot-123');
  });

  it('notifies onProgress callback during candidate generation and evaluation', async () => {
    const progressUpdates: unknown[] = [];
    const coordinator = new SearchCoordinator({
      enqueueJob: async (input) => {
        enqueuedJobs.push(input);
        return `job-${enqueuedJobs.length}`;
      },
      eventBus: fakeEventBus,
      onProgress: (event) => {
        progressUpdates.push(event);
      },
      prisma: fakePrisma as unknown as AppPrismaClient,
    });

    await coordinator.start();

    await coordinator.startRun({
      generator: new FakeGenerator(),
      ownerId: 'user-1',
      searchSpace: defaultSearchSpace,
      stopPolicy: { maxCandidates: 2, maxInFlight: 2 },
    });

    // Wait a bit for candidates to be generated
    await new Promise((r) => setTimeout(r, 50));

    expect(progressUpdates.length).toBeGreaterThanOrEqual(1);

    // Simulate evaluation
    await fakeEventBus.publish(
      createDomainEvent('StrategyEvaluated', {
        endTime: 1700000000000,
        experimentId: 'exp-1',
        maxDrawdown: '0.1',
        memberStrategies: [{ label: 'MA', strategyId: 'ma' }],
        ownerId: 'user-1',
        pair: 'BTCUSDT',
        return: '0.2',
        score: '1.8',
        startTime: 1690000000000,
        strategyDisplayName: 'MA (14)',
        strategyKind: 'singular',
        strategyVersionId: 'ver-1',
        timeframe: '1h',
        totalProfit: '2000',
        totalTrades: 10,
        winRate: '0.6',
      }),
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(progressUpdates.length).toBeGreaterThan(2);

    const lastProgress = progressUpdates[progressUpdates.length - 1] as {
      latestCandidate?: { name: string; pair: string; timeframe: string };
      bestCandidate?: {
        score: number;
        profit?: number;
        winRate?: number;
        experimentId: string;
      };
    };
    expect(lastProgress.latestCandidate).toBeDefined();
    expect(lastProgress.latestCandidate?.pair).toBe('BTCUSDT');
    expect(lastProgress.bestCandidate).toBeDefined();
    expect(lastProgress.bestCandidate?.score).toBe(1.8);
    expect(lastProgress.bestCandidate?.profit).toBe(2000);
    expect(lastProgress.bestCandidate?.winRate).toBe(0.6);
  });
});
