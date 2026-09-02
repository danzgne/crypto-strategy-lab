import type { AppPrismaClient } from '../../../../database/prismaClient';

export interface TradeRetentionOptions {
  /** Retention window in milliseconds. Default 7 days (7 * 24 * 60 * 60 * 1000). */
  retentionWindowMs?: number | undefined;
  /** Reference timestamp for calculating cutoffs. Default Date.now(). */
  now?: number | undefined;
}

export interface PruneResult {
  prunedTradesCount: number;
  eligibleExperimentsCount: number;
}

export class TradeRetentionService {
  public constructor(
    private readonly prisma: AppPrismaClient,
    private readonly defaultRetentionWindowMs: number = 7 * 24 * 60 * 60 * 1000,
  ) {}

  /**
   * Prunes trades for unpinned, non-leaderboard experiments older than the retention window.
   * Leaves Experiment rows, metrics, and dataset snapshots permanently intact.
   */
  public async pruneTrades(
    options?: TradeRetentionOptions,
  ): Promise<PruneResult> {
    const retentionMs =
      options?.retentionWindowMs ?? this.defaultRetentionWindowMs;
    const now = options?.now ?? Date.now();
    const cutoffDate = new Date(now - retentionMs);

    // 1. Get all experiment IDs currently featured on any Leaderboard
    const leaderboardEntries = await this.prisma.leaderboardEntry.findMany({
      select: { experimentId: true },
    });
    const leaderboardExperimentIds = new Set(
      leaderboardEntries.map((e) => e.experimentId),
    );

    // 2. Find eligible experiments created before cutoffDate that are unpinned and not on leaderboard
    const eligibleExperiments = await this.prisma.experiment.findMany({
      where: {
        createdAt: { lt: cutoffDate },
        isPinned: false,
      },
      select: { id: true },
    });

    const eligibleIds = eligibleExperiments
      .map((e) => e.id)
      .filter((id) => !leaderboardExperimentIds.has(id));

    if (eligibleIds.length === 0) {
      return {
        eligibleExperimentsCount: 0,
        prunedTradesCount: 0,
      };
    }

    // 3. Delete trades for eligible experiments
    const deleteResult = await this.prisma.trade.deleteMany({
      where: {
        experimentId: { in: eligibleIds },
      },
    });

    return {
      eligibleExperimentsCount: eligibleIds.length,
      prunedTradesCount: deleteResult.count,
    };
  }

  /**
   * Pins or unpins an experiment to protect/unprotect its trades from retention pruning.
   */
  public async setExperimentPinned(
    experimentId: string,
    ownerId: string,
    isPinned: boolean,
  ): Promise<boolean> {
    const experiment = await this.prisma.experiment.findFirst({
      where: { id: experimentId, ownerId },
      select: { id: true },
    });

    if (!experiment) {
      return false;
    }

    await this.prisma.experiment.update({
      data: { isPinned },
      where: { id: experimentId },
    });

    return true;
  }
}
