import { PrismaClient, BacktestJob } from '@prisma/client';

export class BacktestQueue {
  constructor(private prisma: PrismaClient) {}

  /**
   * Safely claims a PENDING job (or reclaims a stale RUNNING job)
   * using an atomic PostgreSQL FOR UPDATE SKIP LOCKED query.
   * 
   * @param workerId UUID of the worker attempting to claim
   * @param staleTimeoutMinutes The time in minutes after which a RUNNING job is considered stalled/crashed
   * @returns The claimed BacktestJob, or null if queue is empty
   */
  async claimJob(workerId: string, staleTimeoutMinutes: number = 30): Promise<BacktestJob | null> {
    // This query is atomic. SKIP LOCKED ensures multiple workers don't block each other.
    const results = await this.prisma.$queryRaw<BacktestJob[]>`
      UPDATE "BacktestJob"
      SET 
        status = 'RUNNING',
        "claimedAt" = NOW(),
        "workerId" = ${workerId},
        attempts = attempts + 1
      WHERE id = (
        SELECT id FROM "BacktestJob"
        WHERE status = 'PENDING'
           OR (status = 'RUNNING' AND "claimedAt" < NOW() - (${staleTimeoutMinutes} || ' minutes')::interval)
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `;

    return results.length > 0 ? results[0] : null;
  }

  /**
   * Marks a job as completed.
   */
  async completeJob(jobId: string): Promise<BacktestJob> {
    return this.prisma.backtestJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
  }

  /**
   * Marks a job as failed, recording the error.
   */
  async failJob(jobId: string, errorMsg: string): Promise<BacktestJob> {
    return this.prisma.backtestJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error: errorMsg,
      },
    });
  }
}
