import type { IJobQueue, Job } from '@crypto-strategy-lab/shared';
import type { WorkerPrismaClient } from '../database/prismaClient';

export class PostgresJobQueue implements IJobQueue {
  constructor(private prisma: WorkerPrismaClient) {}

  async enqueue(experimentId: string, ownerId: string): Promise<string> {
    const job = await this.prisma.backtestJob.create({
      data: {
        experimentId,
        ownerId,
        status: 'PENDING',
      },
    });
    return job.id;
  }

  async claim(workerId: string): Promise<Job | null> {
    const jobs = await this.prisma.$queryRaw<Job[]>`
      UPDATE backtest_jobs
      SET status = 'CLAIMED',
          "claimedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE id = (
        SELECT id
        FROM backtest_jobs
        WHERE status = 'PENDING'
           OR (status = 'CLAIMED' AND "claimedAt" < NOW() - INTERVAL '5 minutes')
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `;

    return jobs[0] || null;
  }

  async complete(jobId: string, result?: any): Promise<void> {
    await this.prisma.backtestJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
      },
    });
  }

  async fail(jobId: string, error: Error): Promise<void> {
    const job = await this.prisma.backtestJob.findUnique({
      where: { id: jobId },
    });
    if (!job) return;

    const nextRetry = job.retryCount + 1;
    const status = nextRetry >= 3 ? 'FAILED' : 'PENDING';

    await this.prisma.backtestJob.update({
      where: { id: jobId },
      data: {
        status,
        retryCount: nextRetry,
        error: error.message,
        claimedAt: status === 'PENDING' ? null : job.claimedAt,
      },
    });
  }
}
