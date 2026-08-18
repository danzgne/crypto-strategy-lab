import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, queue } from './db';

// NOTE: This test requires a running Postgres database.
describe('BacktestQueue Concurrency', () => {

  beforeAll(async () => {
    // Clear out jobs before testing
    await prisma.backtestJob.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should prevent multiple workers from claiming the same job (FOR UPDATE SKIP LOCKED)', async () => {
    // 1. Seed 2 pending jobs
    await prisma.backtestJob.createMany({
      data: [
        { experimentId: 'exp-1' },
        { experimentId: 'exp-2' },
      ],
    });

    // 2. Simulate 3 concurrent workers trying to claim jobs at the exact same time
    const worker1 = 'worker-A';
    const worker2 = 'worker-B';
    const worker3 = 'worker-C';

    const claims = await Promise.all([
      queue.claimJob(worker1),
      queue.claimJob(worker2),
      queue.claimJob(worker3),
    ]);

    // 3. Evaluate results
    const successfulClaims = claims.filter(job => job !== null);
    const nullClaims = claims.filter(job => job === null);

    // We only seeded 2 jobs, so exactly 2 workers should successfully claim a job.
    expect(successfulClaims).toHaveLength(2);
    // The 3rd worker should get null because the queue was locked and exhausted.
    expect(nullClaims).toHaveLength(1);

    // Verify that the two claimed jobs are DIFFERENT jobs (no double-claim)
    const claimedExpIds = successfulClaims.map(job => job!.experimentId).sort();
    expect(claimedExpIds).toEqual(['exp-1', 'exp-2']);

    // Verify that the workers who won the race are assigned properly
    expect(successfulClaims[0]!.workerId).toBeDefined();
    expect(successfulClaims[1]!.workerId).toBeDefined();
    expect(successfulClaims[0]!.status).toBe('RUNNING');
    expect(successfulClaims[1]!.status).toBe('RUNNING');
  });

  it('should reclaim a stale job that has been RUNNING for more than 30 minutes', async () => {
    const staleJob = await prisma.backtestJob.create({
      data: {
        experimentId: 'exp-stale',
        status: 'RUNNING',
        workerId: 'dead-worker',
        claimedAt: new Date(Date.now() - 35 * 60 * 1000), // 35 minutes ago
      },
    });

    const newClaim = await queue.claimJob('rescue-worker');
    expect(newClaim).not.toBeNull();
    expect(newClaim!.id).toBe(staleJob.id);
    expect(newClaim!.workerId).toBe('rescue-worker');
    expect(newClaim!.attempts).toBe(1);
  });
});
