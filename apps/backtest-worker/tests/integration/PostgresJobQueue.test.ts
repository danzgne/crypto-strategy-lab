import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { PostgresJobQueue } from '../../src/queue/PostgresJobQueue';
import {
  createPrismaClient,
  type WorkerPrismaClient,
} from '../../src/database/prismaClient';
import { PrismaJobRepository } from '../../src/repositories/prisma/prismaJobRepository';
import {
  InvalidConfigError,
  InvalidDatasetSnapshotError,
} from '../../src/errors';

describe('PostgresJobQueue Integration', () => {
  let prisma: WorkerPrismaClient;
  let queue: PostgresJobQueue;
  let ownerId: string;
  let strategyDefId: string;
  let strategyVerId: string;
  const experimentIds: string[] = [];
  const snapshotIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl =
      process.env.DATABASE_URL ||
      'postgresql://crypto_lab:crypto_lab@localhost:5434/crypto_strategy_lab?schema=public';
    prisma = createPrismaClient(databaseUrl);
    const repo = new PrismaJobRepository(prisma);
    queue = new PostgresJobQueue(repo);

    const user = await prisma.user.upsert({
      where: { email: 'test-queue@example.com' },
      update: {},
      create: {
        email: 'test-queue@example.com',
        passwordHash: 'dummy',
        role: 'USER',
      },
    });
    ownerId = user.id;

    await prisma.backtestJob.deleteMany({ where: { ownerId } });
    await prisma.trade.deleteMany({ where: { ownerId } });
    await prisma.experiment.deleteMany({ where: { ownerId } });
    await prisma.strategyVersion.deleteMany({ where: { ownerId } });
    await prisma.strategyDefinition.deleteMany({ where: { ownerId } });

    const def = await prisma.strategyDefinition.create({
      data: {
        ownerId,
        name: 'test',
        type: 'test',
        source: 'USER_PROMPT',
        sourceInput: 'test',
      },
    });
    strategyDefId = def.id;

    const ver = await prisma.strategyVersion.create({
      data: {
        ownerId,
        strategyDefinitionId: strategyDefId,
        params: {},
        versionTag: 'test-version-tag',
        libraryVersion: '1.0.0',
      },
    });
    strategyVerId = ver.id;
  });

  afterAll(async () => {
    await prisma.trade.deleteMany({
      where: { experimentId: { in: experimentIds } },
    });
    await prisma.backtestJob.deleteMany({
      where: { experimentId: { in: experimentIds } },
    });
    await prisma.experiment.deleteMany({
      where: { id: { in: experimentIds } },
    });
    await prisma.datasetSnapshot.deleteMany({
      where: { id: { in: snapshotIds } },
    });
    await prisma.strategyVersion.deleteMany({ where: { id: strategyVerId } });
    await prisma.strategyDefinition.deleteMany({
      where: { id: strategyDefId },
    });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.trade.deleteMany({
      where: { experimentId: { in: experimentIds } },
    });
    await prisma.backtestJob.deleteMany({
      where: { experimentId: { in: experimentIds } },
    });
    await prisma.experiment.deleteMany({
      where: { id: { in: experimentIds } },
    });
    await prisma.datasetSnapshot.deleteMany({
      where: { id: { in: snapshotIds } },
    });
    experimentIds.length = 0;
    snapshotIds.length = 0;
  });

  async function createExperiment() {
    const snapshot = await prisma.datasetSnapshot.create({
      data: {
        candles: [],
        endTime: 1_000,
        fingerprint: `queue-test-${Date.now()}-${snapshotIds.length}-${Math.random()}`,
        pair: 'BTCUSDT',
        startTime: 0,
        timeframe: '1m',
        warmupCandleCount: 0,
      },
    });
    snapshotIds.push(snapshot.id);
    const experiment = await prisma.experiment.create({
      data: {
        datasetSnapshotId: snapshot.id,
        ownerId,
        strategyVersionId: strategyVerId,
        pair: 'BTCUSDT',
        startTime: 0,
        endTime: 1000,
        initialInvestment: 100,
        transactionCost: 0,
        slippage: 0,
      },
    });
    experimentIds.push(experiment.id);
    return experiment;
  }

  it('should enqueue and claim a job successfully', async () => {
    const exp = await createExperiment();
    const jobId = await queue.enqueue(exp.id, ownerId);

    const claimed = await queue.claim('worker-1');
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(jobId);
    expect(claimed!.status).toBe('CLAIMED');
  });

  it('claims a job even without dataset snapshot, failing permanently on loadInput', async () => {
    const experiment = await prisma.experiment.create({
      data: {
        ownerId,
        pair: 'BTCUSDT',
        startTime: 0,
        endTime: 1_000,
        initialInvestment: 100,
        transactionCost: 0,
        slippage: 0,
        strategyVersionId: strategyVerId,
      },
    });
    experimentIds.push(experiment.id);
    const jobId = await queue.enqueue(experiment.id, ownerId);

    const claimed = await queue.claim('worker-1');
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(jobId);

    await expect(queue.loadInput(claimed!)).rejects.toThrow(
      'Backtest job has no immutable dataset snapshot',
    );

    const failed = await queue.failClaim(
      claimed!,
      new InvalidDatasetSnapshotError(
        'Backtest job has no immutable dataset snapshot',
      ),
      'PERMANENT',
    );
    expect(failed).toBe(true);

    const jobInDb = await prisma.backtestJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(jobInDb.status).toBe('FAILED');
    expect(jobInDb.failureCategory).toBe('PERMANENT');
    expect(jobInDb.retryCount).toBe(1);
  });

  it('should not allow concurrent claims of the same job (SKIP LOCKED)', async () => {
    const exp = await createExperiment();
    await queue.enqueue(exp.id, ownerId);

    const [claim1, claim2] = await Promise.all([
      queue.claim('worker-1'),
      queue.claim('worker-2'),
    ]);

    const successfulClaims = [claim1, claim2].filter((c) => c !== null);
    expect(successfulClaims.length).toBe(1);
  });

  it('handles delayed eligibility: cannot be claimed before nextEligibleAt, claimable after', async () => {
    const exp = await createExperiment();
    const jobId = await queue.enqueue(exp.id, ownerId);

    const claimed = await queue.claim('worker-1');
    expect(claimed).not.toBeNull();

    // Transient failure schedules nextEligibleAt in future (~1s + jitter)
    await queue.failClaim(claimed!, new Error('database timeout'), 'TRANSIENT');

    // Immediate claim should return null (delayed eligibility enforced)
    const tooEarly = await queue.claim('worker-1');
    expect(tooEarly).toBeNull();

    // Fast-forward nextEligibleAt to the past
    await prisma.backtestJob.update({
      where: { id: jobId },
      data: { nextEligibleAt: new Date(Date.now() - 1_000) },
    });

    // Now it should be claimable
    const eligibleClaim = await queue.claim('worker-1');
    expect(eligibleClaim).not.toBeNull();
    expect(eligibleClaim!.id).toBe(jobId);
    expect(eligibleClaim!.retryCount).toBe(1);
  });

  it('handles both failure classes: permanent failure transitions immediately to FAILED', async () => {
    const exp = await createExperiment();
    const jobId = await queue.enqueue(exp.id, ownerId);

    const claimed = await queue.claim('worker-1');
    expect(claimed).not.toBeNull();

    // Permanent failure
    const failed = await queue.failClaim(
      claimed!,
      new InvalidConfigError('unsupported parameters'),
    );
    expect(failed).toBe(true);

    const jobInDb = await prisma.backtestJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(jobInDb.status).toBe('FAILED');
    expect(jobInDb.failureCategory).toBe('PERMANENT');
    expect(jobInDb.failedAt).not.toBeNull();
    expect(jobInDb.error).toBe('unsupported parameters');

    // Job cannot be claimed again
    const nextClaim = await queue.claim('worker-1');
    expect(nextClaim).toBeNull();

    // Terminal BacktestCompleted event created
    const outbox = await prisma.outboxEvent.findMany({
      where: {
        name: 'BacktestCompleted',
      },
    });
    const jobEvent = outbox.find(
      (e) => (e.payload as { jobId?: string }).jobId === jobId,
    );
    expect(jobEvent).toBeDefined();
  });

  it('handles lease expiry: reclaim consumes the attempt (bumps retryCount)', async () => {
    const exp = await createExperiment();
    const jobId = await queue.enqueue(exp.id, ownerId);

    // Initial claim (attempt 1, retryCount 0)
    const claimed1 = await queue.claim('worker-1');
    expect(claimed1).not.toBeNull();
    expect(claimed1!.retryCount).toBe(0);

    // Stale lease: worker-1 crashed, lease expired
    const past = new Date(Date.now() - 10_000);
    await prisma.backtestJob.update({
      where: { id: jobId },
      data: { claimedAt: past, leaseExpiresAt: past },
    });

    // Worker 2 reclaims: expired-lease reclaim consumes the attempt!
    const reclaimed = await queue.claim('worker-2');
    expect(reclaimed).not.toBeNull();
    expect(reclaimed!.id).toBe(jobId);
    expect(reclaimed!.workerId).toBe('worker-2');
    expect(reclaimed!.retryCount).toBe(1);
  });

  it('reaches FAILED after retry exhaustion (4 total attempts)', async () => {
    const exp = await createExperiment();
    const jobId = await queue.enqueue(exp.id, ownerId);

    // Helper to fast-forward nextEligibleAt
    const makeEligible = async () => {
      await prisma.backtestJob.update({
        where: { id: jobId },
        data: { nextEligibleAt: new Date(Date.now() - 1_000) },
      });
    };

    // Attempt 1 (retryCount 0)
    const c1 = await queue.claim('worker-1');
    expect(c1!.retryCount).toBe(0);
    await queue.failClaim(c1!, new Error('error 1'), 'TRANSIENT');
    await makeEligible();

    // Attempt 2 (retryCount 1)
    const c2 = await queue.claim('worker-1');
    expect(c2!.retryCount).toBe(1);
    await queue.failClaim(c2!, new Error('error 2'), 'TRANSIENT');
    await makeEligible();

    // Attempt 3 (retryCount 2)
    const c3 = await queue.claim('worker-1');
    expect(c3!.retryCount).toBe(2);
    await queue.failClaim(c3!, new Error('error 3'), 'TRANSIENT');
    await makeEligible();

    // Attempt 4 (retryCount 3)
    const c4 = await queue.claim('worker-1');
    expect(c4!.retryCount).toBe(3);
    await queue.failClaim(c4!, new Error('error 4'), 'TRANSIENT');

    // 5th claim should be null: job exhausted 4 attempts
    const c5 = await queue.claim('worker-1');
    expect(c5).toBeNull();

    const jobInDb = await prisma.backtestJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(jobInDb.status).toBe('FAILED');
    expect(jobInDb.retryCount).toBe(4);
    expect(jobInDb.failedAt).not.toBeNull();
    expect(jobInDb.failureCategory).toBe('TRANSIENT');
  });

  it('reaps terminal expired leases: 4th attempt lease expiry transitions to FAILED', async () => {
    const exp = await createExperiment();
    const jobId = await queue.enqueue(exp.id, ownerId);

    // Simulate a job on its 4th attempt (retryCount: 3) whose lease expired
    const past = new Date(Date.now() - 10_000);
    await prisma.backtestJob.update({
      where: { id: jobId },
      data: {
        status: 'CLAIMED',
        workerId: 'worker-crashed',
        leaseToken: '00000000-0000-0000-0000-000000000001',
        claimedAt: past,
        leaseExpiresAt: past,
        retryCount: 3,
      },
    });

    // Claim next job will reap the terminal expired lease
    const claimed = await queue.claim('worker-active');
    expect(claimed).toBeNull(); // No other pending jobs

    const jobInDb = await prisma.backtestJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(jobInDb.status).toBe('FAILED');
    expect(jobInDb.retryCount).toBe(4);
    expect(jobInDb.workerId).toBe('worker-crashed');
    expect(jobInDb.failedAt).not.toBeNull();
    expect(jobInDb.failureCategory).toBe('TRANSIENT');

    // Emitted BacktestCompleted
    const outbox = await prisma.outboxEvent.findMany({
      where: { name: 'BacktestCompleted' },
    });
    const terminalEvent = outbox.find(
      (e) => (e.payload as { jobId?: string }).jobId === jobId,
    );
    expect(terminalEvent).toBeDefined();
  });

  it('enforces stale fencing: stale worker cannot fail or complete a reclaimed job', async () => {
    const exp = await createExperiment();
    const jobId = await queue.enqueue(exp.id, ownerId);

    // Worker 1 claims
    const staleClaim = await queue.claim('worker-1');
    expect(staleClaim).not.toBeNull();

    // Expire lease
    const past = new Date(Date.now() - 10_000);
    await prisma.backtestJob.update({
      where: { id: jobId },
      data: { leaseExpiresAt: past },
    });

    // Worker 2 reclaims
    const activeClaim = await queue.claim('worker-2');
    expect(activeClaim).not.toBeNull();
    expect(activeClaim!.workerId).toBe('worker-2');

    // Stale Worker 1 tries to record failure -> fenced!
    const failedAttempt = await queue.failClaim(
      staleClaim!,
      new Error('stale error'),
    );
    expect(failedAttempt).toBe(false);

    // Job in DB is still in Worker 2's active claim
    const jobInDb = await prisma.backtestJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(jobInDb.status).toBe('CLAIMED');
    expect(jobInDb.workerId).toBe('worker-2');
    expect(jobInDb.error).toBeNull();
  });

  it('enforces stale fencing: stale worker cannot emit BacktestCompleted terminal event on failure', async () => {
    const exp = await createExperiment();
    const jobId = await queue.enqueue(exp.id, ownerId);

    // Worker 1 claims
    const staleClaim = await queue.claim('worker-1');
    expect(staleClaim).not.toBeNull();

    // Expire lease
    const past = new Date(Date.now() - 10_000);
    await prisma.backtestJob.update({
      where: { id: jobId },
      data: { leaseExpiresAt: past },
    });

    // Worker 2 reclaims
    const activeClaim = await queue.claim('worker-2');
    expect(activeClaim).not.toBeNull();

    // Stale worker 1 tries to fail terminal with PERMANENT
    const failedAttempt = await queue.failClaim(
      staleClaim!,
      new InvalidConfigError('stale bad config'),
      'PERMANENT',
    );
    expect(failedAttempt).toBe(false);

    // Verify NO BacktestCompleted was emitted for this job
    const outbox = await prisma.outboxEvent.findMany({
      where: { name: 'BacktestCompleted' },
    });
    const terminalEvent = outbox.find(
      (e) => (e.payload as { jobId?: string }).jobId === jobId,
    );
    expect(terminalEvent).toBeUndefined();
  });

  it('fails permanently when snapshot candles are invalid or empty', async () => {
    const snapshot = await prisma.datasetSnapshot.create({
      data: {
        candles: [{ invalid: 'candle' }],
        endTime: 1_000,
        fingerprint: `malformed-snap-${Date.now()}`,
        pair: 'BTCUSDT',
        startTime: 0,
        timeframe: '1m',
        warmupCandleCount: 0,
      },
    });
    snapshotIds.push(snapshot.id);
    const experiment = await prisma.experiment.create({
      data: {
        datasetSnapshotId: snapshot.id,
        ownerId,
        strategyVersionId: strategyVerId,
        pair: 'BTCUSDT',
        startTime: 0,
        endTime: 1000,
        initialInvestment: 100,
        transactionCost: 0,
        slippage: 0,
      },
    });
    experimentIds.push(experiment.id);
    const jobId = await queue.enqueue(experiment.id, ownerId);

    const claimed = await queue.claim('worker-1');
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(jobId);

    await expect(queue.loadInput(claimed!)).rejects.toThrow(
      'Dataset snapshot contains malformed candle data',
    );
  });

  it('fails permanently when execution parameters are invalid', async () => {
    const snapshot = await prisma.datasetSnapshot.create({
      data: {
        candles: [
          {
            close: 100,
            closeTime: 59_999,
            high: 101,
            isClosed: true,
            low: 99,
            open: 100,
            openTime: 0,
            pair: 'BTCUSDT',
            timeframe: '1m',
            volume: 10,
          },
        ],
        endTime: 60_000,
        fingerprint: `valid-snap-${Date.now()}`,
        pair: 'BTCUSDT',
        startTime: 0,
        timeframe: '1m',
        warmupCandleCount: 0,
      },
    });
    snapshotIds.push(snapshot.id);
    const experiment = await prisma.experiment.create({
      data: {
        datasetSnapshotId: snapshot.id,
        ownerId,
        strategyVersionId: strategyVerId,
        pair: 'BTCUSDT',
        startTime: 0,
        endTime: 60_000,
        initialInvestment: -500,
        transactionCost: 0,
        slippage: 0,
      },
    });
    experimentIds.push(experiment.id);
    const jobId = await queue.enqueue(experiment.id, ownerId);

    const claimed = await queue.claim('worker-1');
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(jobId);

    await expect(queue.loadInput(claimed!)).rejects.toThrow(
      'Initial investment must be a finite positive number',
    );
  });
});
