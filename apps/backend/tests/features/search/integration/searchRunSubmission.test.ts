import '@crypto-strategy-lab/strategy-engine/strategies';

import type {
  AnyDomainEvent,
  Candle,
  CandidateStrategy,
  DomainEventEnvelope,
  DomainEventName,
  StrategyGenerator,
} from '@crypto-strategy-lab/shared';
import { createDomainEvent } from '@crypto-strategy-lab/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createPrismaClient,
  type AppPrismaClient,
} from '@/database/prismaClient';
import type { BacktestHistoryProvider } from '@/api/features/backtests';
import {
  DatasetSnapshotPreparationError,
  SearchCoordinator,
  type EnqueueJobFn,
  type SearchEventBus,
} from '@/api/features/search/services/searchCoordinator';
import { getTestDatabaseUrl } from '../../../helpers/testDatabaseUrl';
import { defaultSearchSpace } from '../../../helpers/searchFixtures';

class TestEventBus implements SearchEventBus {
  private handlers = new Map<
    string,
    ((event: DomainEventEnvelope<DomainEventName>) => void | Promise<void>)[]
  >();

  public async publish(event: AnyDomainEvent): Promise<void> {
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

class SequentialGenerator implements StrategyGenerator {
  private count = 0;
  public constructor(private readonly fingerprintPrefix: string) {}

  public generate(): CandidateStrategy {
    this.count += 1;
    return {
      fingerprint: `${this.fingerprintPrefix}-${this.count}`,
      parameterSnapshots: [{ period: 20 + this.count }],
      provenance: {
        algorithm: this.fingerprintPrefix,
        generationOrdinal: this.count,
      },
      strategyIds: ['ma'],
    };
  }
}

// Repeats the same fingerprint for its first two calls (simulating a candidate
// whose first submission attempt fails and is retried), then yields fresh ones.
class RetryOnceGenerator implements StrategyGenerator {
  private count = 0;
  public constructor(private readonly fingerprintPrefix: string) {}

  public generate(): CandidateStrategy {
    this.count += 1;
    const id = this.count <= 2 ? 'retry-candidate' : `unique-${this.count}`;
    return {
      fingerprint: `${this.fingerprintPrefix}-${id}`,
      parameterSnapshots: [{ period: 42 }],
      provenance: {
        algorithm: this.fingerprintPrefix,
        generationOrdinal: this.count,
      },
      strategyIds: ['ma'],
    };
  }
}

function makeCandles(pair: string): Candle[] {
  return [
    {
      close: 101,
      closeTime: 59_999,
      high: 102,
      isClosed: true,
      low: 99,
      open: 100,
      openTime: 0,
      pair,
      timeframe: '1h',
      volume: 10,
    },
    {
      close: 103,
      closeTime: 119_999,
      high: 104,
      isClosed: true,
      low: 100,
      open: 101,
      openTime: 60_000,
      pair,
      timeframe: '1h',
      volume: 12,
    },
  ];
}

function workingHistoryProvider(pair: string): BacktestHistoryProvider {
  const candles = makeCandles(pair);
  return {
    prepareHistoricalCandles: vi.fn(async () => ({
      candles,
      selectedCandles: candles,
      warmupCandleCount: 0,
    })),
  };
}

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('waitUntil timed out');
}

describe('SearchRun use-case seam: atomic and fail-fast candidate submission', () => {
  let prisma: AppPrismaClient;
  let ownerId: string;
  const searchRunIds: string[] = [];
  const experimentIds: string[] = [];
  const datasetSnapshotIds: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient(getTestDatabaseUrl());
    await prisma.$connect();
    const user = await prisma.user.create({
      data: {
        email: `issue88-${Date.now()}@example.com`,
        passwordHash: 'integration-test',
      },
    });
    ownerId = user.id;
  });

  afterAll(async () => {
    let strategyVersionIds: string[] = [];
    let strategyDefinitionIds: string[] = [];

    if (experimentIds.length > 0) {
      const experiments = await prisma.experiment.findMany({
        select: { strategyVersion: { select: { strategyDefinitionId: true } } },
        where: { id: { in: experimentIds } },
      });
      strategyDefinitionIds = experiments.map(
        (e) => e.strategyVersion.strategyDefinitionId,
      );

      await prisma.backtestJob.deleteMany({
        where: { experimentId: { in: experimentIds } },
      });
      await prisma.trade.deleteMany({
        where: { experimentId: { in: experimentIds } },
      });
      await prisma.experiment.deleteMany({
        where: { id: { in: experimentIds } },
      });
    }
    if (searchRunIds.length > 0) {
      await prisma.searchRun.deleteMany({
        where: { id: { in: searchRunIds } },
      });
    }
    if (strategyDefinitionIds.length > 0) {
      strategyVersionIds = (
        await prisma.strategyVersion.findMany({
          select: { id: true },
          where: { strategyDefinitionId: { in: strategyDefinitionIds } },
        })
      ).map((v) => v.id);
      await prisma.strategyVersion.deleteMany({
        where: { id: { in: strategyVersionIds } },
      });
      await prisma.strategyDefinition.deleteMany({
        where: { id: { in: strategyDefinitionIds } },
      });
    }
    if (datasetSnapshotIds.length > 0) {
      await prisma.datasetSnapshot.deleteMany({
        where: { id: { in: datasetSnapshotIds } },
      });
    }
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('fails search startup fast and creates no SearchRun, Experiment, or Backtest Job when Dataset Snapshot preparation fails', async () => {
    const failingHistoryProvider: BacktestHistoryProvider = {
      prepareHistoricalCandles: vi
        .fn()
        .mockRejectedValue(new Error('upstream history source unavailable')),
    };

    const coordinator = new SearchCoordinator({
      eventBus: new TestEventBus(),
      historyProvider: failingHistoryProvider,
      prisma,
    });
    await coordinator.start();

    const [runsBefore, experimentsBefore, jobsBefore] = await Promise.all([
      prisma.searchRun.count({ where: { ownerId } }),
      prisma.experiment.count({ where: { ownerId } }),
      prisma.backtestJob.count({ where: { ownerId } }),
    ]);

    await expect(
      coordinator.startRun({
        generator: new SequentialGenerator('issue88-failfast'),
        ownerId,
        searchSpace: { ...defaultSearchSpace, pair: 'ISSUE88FAILFAST' },
        stopPolicy: { maxCandidates: 3, maxInFlight: 5 },
      }),
    ).rejects.toBeInstanceOf(DatasetSnapshotPreparationError);

    expect(await prisma.searchRun.count({ where: { ownerId } })).toBe(
      runsBefore,
    );
    expect(await prisma.experiment.count({ where: { ownerId } })).toBe(
      experimentsBefore,
    );
    expect(await prisma.backtestJob.count({ where: { ownerId } })).toBe(
      jobsBefore,
    );

    coordinator.stop();
  });

  it('rolls back a failed candidate submission atomically, leaving no orphan Experiment and freeing its fingerprint for retry', async () => {
    let enqueueAttempts = 0;
    const flakyEnqueueJob: EnqueueJobFn = async (transaction, input) => {
      enqueueAttempts += 1;
      if (enqueueAttempts === 1) {
        throw new Error('simulated transient enqueue failure');
      }
      const job = await transaction.backtestJob.create({
        data: {
          experimentId: input.experimentId,
          ownerId: input.ownerId,
          searchRunId: input.searchRunId,
          status: 'PENDING',
        },
      });
      return job.id;
    };

    const coordinator = new SearchCoordinator({
      enqueueJob: flakyEnqueueJob,
      eventBus: new TestEventBus(),
      historyProvider: workingHistoryProvider('ISSUE88ATOMIC'),
      prisma,
    });
    await coordinator.start();

    const runId = await coordinator.startRun({
      generator: new RetryOnceGenerator('issue88-atomic'),
      ownerId,
      searchSpace: { ...defaultSearchSpace, pair: 'ISSUE88ATOMIC' },
      stopPolicy: { maxCandidates: 2, maxInFlight: 10 },
    });
    searchRunIds.push(runId);

    await waitUntil(
      () => (coordinator.getRun(runId)?.acceptedCandidates ?? 0) >= 2,
    );

    expect(enqueueAttempts).toBeGreaterThanOrEqual(2);

    const retried = await prisma.experiment.findMany({
      where: {
        fingerprint: 'issue88-atomic-retry-candidate',
        ownerId,
      },
    });
    expect(retried).toHaveLength(1);
    experimentIds.push(...retried.map((e) => e.id));

    const retriedJobs = await prisma.backtestJob.findMany({
      where: { experimentId: retried[0]!.id },
    });
    expect(retriedJobs).toHaveLength(1);

    // The candidate that failed its first submission attempt was not permanently
    // blocked: it was retried and counted as one of the run's accepted candidates.
    expect(
      coordinator
        .getRun(runId)
        ?.seenFingerprints.has('issue88-atomic-retry-candidate'),
    ).toBe(true);

    const otherExperiments = await prisma.experiment.findMany({
      where: { ownerId, searchRunId: runId },
    });
    experimentIds.push(
      ...otherExperiments
        .map((e) => e.id)
        .filter((id) => !experimentIds.includes(id)),
    );

    coordinator.stop();
  });

  it('persists a Dataset Snapshot reference on every searched Experiment and drains both a completed and a failed job to a terminal SearchRun state', async () => {
    const historyProvider = workingHistoryProvider('ISSUE88SUCCESS');
    const eventBus = new TestEventBus();
    const coordinator = new SearchCoordinator({
      eventBus,
      historyProvider,
      prisma,
    });
    await coordinator.start();

    const runId = await coordinator.startRun({
      generator: new SequentialGenerator('issue88-success'),
      ownerId,
      searchSpace: { ...defaultSearchSpace, pair: 'ISSUE88SUCCESS' },
      stopPolicy: { maxCandidates: 2, maxInFlight: 10 },
    });
    searchRunIds.push(runId);

    await waitUntil(
      () => (coordinator.getRun(runId)?.acceptedCandidates ?? 0) >= 2,
    );

    const experiments = await prisma.experiment.findMany({
      orderBy: { createdAt: 'asc' },
      where: { ownerId, searchRunId: runId },
    });
    expect(experiments).toHaveLength(2);
    experimentIds.push(...experiments.map((e) => e.id));

    for (const experiment of experiments) {
      expect(experiment.datasetSnapshotId).not.toBeNull();
      datasetSnapshotIds.push(experiment.datasetSnapshotId!);
    }
    expect(new Set(datasetSnapshotIds.slice(-2)).size).toBe(1);

    const persistedRun = await prisma.searchRun.findUniqueOrThrow({
      where: { id: runId },
    });
    expect(persistedRun.datasetSnapshotId).toBe(
      experiments[0]!.datasetSnapshotId,
    );

    const [succeeding, failing] = experiments;

    // Simulate the Backtest Worker completing the first job successfully.
    await eventBus.publish(
      createDomainEvent('StrategyEvaluated', {
        endTime: Number(succeeding!.endTime),
        experimentId: succeeding!.id,
        maxDrawdown: '0.1',
        memberStrategies: [{ label: 'MA', strategyId: 'ma' }],
        ownerId,
        pair: succeeding!.pair,
        return: '0.2',
        score: '1.5',
        startTime: Number(succeeding!.startTime),
        strategyDisplayName: 'MA',
        strategyKind: 'singular',
        strategyVersionId: succeeding!.strategyVersionId,
        timeframe: succeeding!.timeframe as '1h',
        totalProfit: '200',
        totalTrades: 5,
        winRate: '0.6',
      }),
    );

    // Simulate the Backtest Worker failing the second job permanently.
    await prisma.backtestJob.update({
      data: { status: 'FAILED', failedAt: new Date() },
      where: { experimentId: failing!.id },
    });
    await eventBus.publish(
      createDomainEvent('BacktestCompleted', {
        experimentId: failing!.id,
        jobId: (
          await prisma.backtestJob.findFirstOrThrow({
            where: { experimentId: failing!.id },
          })
        ).id,
      }),
    );

    await waitUntil(() => coordinator.getRun(runId)?.status === 'COMPLETED');

    const finalState = coordinator.getRun(runId);
    expect(finalState?.status).toBe('COMPLETED');
    expect(finalState?.inFlightJobs).toBe(0);

    const finalRunRecord = await prisma.searchRun.findUniqueOrThrow({
      where: { id: runId },
    });
    expect(finalRunRecord.status).toBe('COMPLETED');
    expect(finalRunRecord.inFlightJobs).toBe(0);

    coordinator.stop();
  });

  it('persists complete, typed provenance on every searched Experiment', async () => {
    const historyProvider = workingHistoryProvider('ISSUE90PROVENANCE');
    const eventBus = new TestEventBus();
    const coordinator = new SearchCoordinator({
      eventBus,
      historyProvider,
      prisma,
    });
    await coordinator.start();

    const runId = await coordinator.startRun({
      generator: new SequentialGenerator('issue90-provenance'),
      ownerId,
      searchSpace: { ...defaultSearchSpace, pair: 'ISSUE90PROVENANCE' },
      stopPolicy: { maxCandidates: 1, maxInFlight: 10 },
    });
    searchRunIds.push(runId);

    await waitUntil(
      () => (coordinator.getRun(runId)?.acceptedCandidates ?? 0) >= 1,
    );
    coordinator.stop();

    const experiment = await prisma.experiment.findFirstOrThrow({
      where: { ownerId, searchRunId: runId },
    });
    experimentIds.push(experiment.id);
    if (experiment.datasetSnapshotId) {
      datasetSnapshotIds.push(experiment.datasetSnapshotId);
    }

    const persistedRun = await prisma.searchRun.findUniqueOrThrow({
      where: { id: runId },
    });

    expect(experiment.strategyImplementationVersion).toBe('ma-v1');
    expect(experiment.simulationRulesVersion).toBe('historical-v1');
    expect(experiment.evaluatorVersion).toBe('default-v1');
    expect(experiment.buildRevision).not.toBeNull();
    expect(experiment.generatorAlgorithm).toBe('issue90-provenance');
    expect(experiment.generatorVersion).toBe('issue90-provenance');
    expect(experiment.generatorSeed).toBe(persistedRun.seed);
    expect(experiment.generationOrdinal).toBe(1);
  });

  it('reconciles a persisted terminal job on restart and lets a restored STOPPING run become terminal', async () => {
    const firstCoordinator = new SearchCoordinator({
      eventBus: new TestEventBus(),
      historyProvider: workingHistoryProvider('ISSUE88RESTART'),
      prisma,
    });
    await firstCoordinator.start();

    const runId = await firstCoordinator.startRun({
      generator: new SequentialGenerator('issue88-restart'),
      ownerId,
      searchSpace: { ...defaultSearchSpace, pair: 'ISSUE88RESTART' },
      stopPolicy: { maxCandidates: 1, maxInFlight: 10 },
    });
    searchRunIds.push(runId);

    // maxCandidates: 1 means the run transitions to STOPPING as soon as its single
    // candidate is accepted, while the job itself is still PENDING (in-flight).
    await waitUntil(
      () => firstCoordinator.getRun(runId)?.status === 'STOPPING',
    );

    const experiment = await prisma.experiment.findFirstOrThrow({
      where: { ownerId, searchRunId: runId },
    });
    experimentIds.push(experiment.id);

    // The process stops observing this run without it ever draining.
    firstCoordinator.stop();

    // Work finishes while no coordinator instance is watching.
    await prisma.backtestJob.update({
      data: { status: 'COMPLETED' },
      where: { experimentId: experiment.id },
    });

    const restoredCoordinator = new SearchCoordinator({
      eventBus: new TestEventBus(),
      prisma,
    });
    await restoredCoordinator.start();

    const restoredState = restoredCoordinator.getRun(runId);
    expect(restoredState?.status).toBe('COMPLETED');
    expect(restoredState?.inFlightJobs).toBe(0);

    const persisted = await prisma.searchRun.findUniqueOrThrow({
      where: { id: runId },
    });
    expect(persisted.status).toBe('COMPLETED');
    expect(persisted.inFlightJobs).toBe(0);

    restoredCoordinator.stop();
  });
});
