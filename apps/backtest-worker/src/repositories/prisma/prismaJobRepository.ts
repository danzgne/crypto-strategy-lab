import type { Job } from '@crypto-strategy-lab/shared';
import type { WorkerPrismaClient } from '../../database/prismaClient';
import type { JobRepository } from '../interfaces/jobRepository.interface';

export class PrismaJobRepository implements JobRepository {
  constructor(private prisma: WorkerPrismaClient) {}

  async createJob(experimentId: string, ownerId: string): Promise<string> {
    const job = await this.prisma.backtestJob.create({
      data: {
        experimentId,
        ownerId,
        status: 'PENDING',
      },
    });
    return job.id;
  }

  async claimNextJob(_workerId: string): Promise<Job | null> {
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

  async updateJobStatus(jobId: string, status: Job['status']): Promise<void> {
    await this.prisma.backtestJob.update({
      where: { id: jobId },
      data: { status },
    });
  }

  async findById(jobId: string): Promise<Job | null> {
    const job = await this.prisma.backtestJob.findUnique({
      where: { id: jobId },
    });
    // Cast JobStatus to Job['status'] explicitly or return directly if it matches
    return job as unknown as Job | null;
  }

  async updateJobFailure(
    jobId: string,
    error: string,
    retryCount: number,
    status: Job['status'],
    claimedAt: Date | null,
  ): Promise<void> {
    await this.prisma.backtestJob.update({
      where: { id: jobId },
      data: {
        status,
        retryCount,
        error,
        claimedAt,
      },
    });
  }
}
