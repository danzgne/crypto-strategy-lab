import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { PostgresJobQueue } from '../../src/queue/PostgresJobQueue';
import {
  createPrismaClient,
  WorkerPrismaClient,
} from '../../src/database/prismaClient';
import { PrismaJobRepository } from '../../src/repositories/prisma/prismaJobRepository';

describe('PostgresJobQueue Integration', () => {
  let prisma: WorkerPrismaClient;
  let queue: PostgresJobQueue;
  let ownerId: string;
  let strategyDefId: string;
  let strategyVerId: string;

  beforeAll(async () => {
    const databaseUrl =
      process.env.DATABASE_URL ||
      'postgresql://crypto_lab:crypto_lab@localhost:5434/crypto_strategy_lab?schema=public';
    prisma = createPrismaClient(databaseUrl);
    const repo = new PrismaJobRepository(prisma);
    queue = new PostgresJobQueue(repo);

    // Create a dedicated test user
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

    // create def
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

    // create version
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
    // clean up
    await prisma.backtestJob.deleteMany();
    await prisma.experiment.deleteMany();
    await prisma.strategyVersion.deleteMany();
    await prisma.strategyDefinition.deleteMany();
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.backtestJob.deleteMany();
    await prisma.experiment.deleteMany();
  });

  async function createExperiment() {
    return prisma.experiment.create({
      data: {
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
  }

  it('should enqueue and claim a job successfully', async () => {
    const exp = await createExperiment();
    const jobId = await queue.enqueue(exp.id, ownerId);

    const claimed = await queue.claim('worker-1');
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(jobId);
    expect(claimed!.status).toBe('CLAIMED');
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

  it('should transition to FAILED after 3 retries', async () => {
    const exp = await createExperiment();
    const jobId = await queue.enqueue(exp.id, ownerId);

    // 1st fail
    const c1 = await queue.claim('worker-1');
    await queue.fail(c1!.id, new Error('error 1'));

    // 2nd fail
    const c2 = await queue.claim('worker-1');
    expect(c2!.retryCount).toBe(1);
    await queue.fail(c2!.id, new Error('error 2'));

    // 3rd fail
    const c3 = await queue.claim('worker-1');
    expect(c3!.retryCount).toBe(2);
    await queue.fail(c3!.id, new Error('error 3'));

    // 4th fail
    const c4 = await queue.claim('worker-1');
    expect(c4!.retryCount).toBe(3);
    await queue.fail(c4!.id, new Error('error 4'));

    // 5th claim should be null (failed)
    const c5 = await queue.claim('worker-1');
    expect(c5).toBeNull();

    const jobInDb = await prisma.backtestJob.findUnique({
      where: { id: jobId },
    });
    expect(jobInDb!.status).toBe('FAILED');
    expect(jobInDb!.retryCount).toBe(4);
  });

  it('should reclaim a job that has been stuck in CLAIMED for >5 mins', async () => {
    const exp = await createExperiment();
    const jobId = await queue.enqueue(exp.id, ownerId);

    // Claim it
    await queue.claim('worker-1');

    // Manually push claimedAt back by 6 minutes
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    await prisma.backtestJob.update({
      where: { id: jobId },
      data: { claimedAt: sixMinutesAgo },
    });

    // Should be able to claim again
    const reclaimed = await queue.claim('worker-2');
    expect(reclaimed).not.toBeNull();
    expect(reclaimed!.id).toBe(jobId);
  });
});
