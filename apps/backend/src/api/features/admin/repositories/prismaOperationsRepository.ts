import type { AppPrismaClient } from '@/database/prismaClient';
import type {
  OperationsRepository,
  RawDeadLetter,
  RawJobCounts,
  RawJobFailure,
  RawOutboxMetrics,
  RawRolling24hMetrics,
  RawWorkerHeartbeat,
} from './interfaces/operationsRepository.interface';

export class PrismaOperationsRepository implements OperationsRepository {
  public constructor(private readonly prisma: AppPrismaClient) {}

  public async getJobStatusCounts(): Promise<RawJobCounts> {
    const grouped = await this.prisma.backtestJob.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const counts: Record<
      'PENDING' | 'CLAIMED' | 'COMPLETED' | 'FAILED',
      number
    > = {
      PENDING: 0,
      CLAIMED: 0,
      COMPLETED: 0,
      FAILED: 0,
    };

    for (const item of grouped) {
      if (item.status in counts) {
        counts[item.status as keyof typeof counts] = item._count._all;
      }
    }

    const oldestPending = await this.prisma.backtestJob.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    return {
      counts,
      oldestPendingCreatedAt: oldestPending?.createdAt ?? null,
    };
  }

  public async getRolling24hMetrics(
    since: Date,
  ): Promise<RawRolling24hMetrics> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        throughput: number | bigint;
        failures: number | bigint;
        retries: number | bigint;
        leaseLosses: number | bigint;
        queueWaitP50Ms: number | null;
        queueWaitP95Ms: number | null;
        executionP50Ms: number | null;
        executionP95Ms: number | null;
      }>
    >`
      SELECT
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS throughput,
        COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failures,
        COALESCE(SUM("retryCount"), 0)::int AS retries,
        COUNT(*) FILTER (WHERE "error" ~* '\\mlease\\M')::int AS "leaseLosses",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("claimedAt" - "createdAt")) * 1000) FILTER (WHERE "claimedAt" IS NOT NULL) AS "queueWaitP50Ms",
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("claimedAt" - "createdAt")) * 1000) FILTER (WHERE "claimedAt" IS NOT NULL) AS "queueWaitP95Ms",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("updatedAt" - "claimedAt")) * 1000) FILTER (WHERE status = 'COMPLETED' AND "claimedAt" IS NOT NULL) AS "executionP50Ms",
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("updatedAt" - "claimedAt")) * 1000) FILTER (WHERE status = 'COMPLETED' AND "claimedAt" IS NOT NULL) AS "executionP95Ms"
      FROM backtest_jobs
      WHERE "updatedAt" >= ${since};
    `;

    const row = rows[0];

    return {
      throughput: Number(row?.throughput ?? 0),
      failures: Number(row?.failures ?? 0),
      retries: Number(row?.retries ?? 0),
      leaseLosses: Number(row?.leaseLosses ?? 0),
      queueWaitP50Ms:
        row?.queueWaitP50Ms !== null && row?.queueWaitP50Ms !== undefined
          ? Math.round(Number(row.queueWaitP50Ms))
          : null,
      queueWaitP95Ms:
        row?.queueWaitP95Ms !== null && row?.queueWaitP95Ms !== undefined
          ? Math.round(Number(row.queueWaitP95Ms))
          : null,
      executionP50Ms:
        row?.executionP50Ms !== null && row?.executionP50Ms !== undefined
          ? Math.round(Number(row.executionP50Ms))
          : null,
      executionP95Ms:
        row?.executionP95Ms !== null && row?.executionP95Ms !== undefined
          ? Math.round(Number(row.executionP95Ms))
          : null,
    };
  }

  public async getWorkerHeartbeats(): Promise<RawWorkerHeartbeat[]> {
    const heartbeats = await this.prisma.serviceHeartbeat.findMany({
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    });

    return heartbeats.map((hb) => ({
      service: hb.service,
      instanceId: hb.instanceId,
      startedAt: hb.startedAt,
      lastSeenAt: hb.lastSeenAt,
      stoppedAt: hb.stoppedAt,
    }));
  }

  public async getOutboxMetrics(): Promise<RawOutboxMetrics> {
    const eligibleBacklog = await this.prisma.outboxEvent.count({
      where: { publishedAt: null, deadLetteredAt: null },
    });

    const oldestUnpublished = await this.prisma.outboxEvent.findFirst({
      where: { publishedAt: null, deadLetteredAt: null },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    const retryingCount = await this.prisma.outboxEvent.count({
      where: {
        publishedAt: null,
        deadLetteredAt: null,
        attemptCount: { gt: 0 },
      },
    });

    const deadLetterCount = await this.prisma.outboxEvent.count({
      where: { deadLetteredAt: { not: null } },
    });

    const recentDeadLetters = await this.prisma.outboxEvent.findMany({
      where: { deadLetteredAt: { not: null } },
      orderBy: { deadLetteredAt: 'desc' },
      take: 20,
      select: {
        id: true,
        eventId: true,
        name: true,
        attemptCount: true,
        deadLetteredAt: true,
        lastError: true,
      },
    });

    return {
      eligibleBacklog,
      oldestUnpublishedCreatedAt: oldestUnpublished?.createdAt ?? null,
      retryingCount,
      deadLetterCount,
      recentDeadLetters: recentDeadLetters.map((dl): RawDeadLetter => ({
        id: dl.id,
        eventId: dl.eventId,
        name: dl.name,
        attemptCount: dl.attemptCount,
        deadLetteredAt: dl.deadLetteredAt!,
        lastError: dl.lastError,
      })),
    };
  }

  public async getRecentJobFailures(limit = 20): Promise<RawJobFailure[]> {
    const failures = await this.prisma.backtestJob.findMany({
      where: { status: 'FAILED' },
      orderBy: [{ failedAt: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        experimentId: true,
        workerId: true,
        retryCount: true,
        failureCategory: true,
        failedAt: true,
        createdAt: true,
        error: true,
      },
    });

    return failures.map((f) => ({
      jobId: f.id,
      experimentId: f.experimentId,
      workerId: f.workerId,
      retryCount: f.retryCount,
      failureCategory: f.failureCategory,
      failedAt: f.failedAt,
      createdAt: f.createdAt,
      error: f.error,
    }));
  }
}
