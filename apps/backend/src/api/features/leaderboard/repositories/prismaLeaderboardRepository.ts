import {
  createDomainEvent,
  formatCompositeStrategyDisplay,
  type LeaderboardEntrySnapshot,
  type LeaderboardSnapshot,
} from '@crypto-strategy-lab/shared';
import { Prisma } from '../../../../../../../generated/prisma/client';

import type { AppPrismaClient } from '../../../../database/prismaClient';
import {
  LeaderboardProjectionConflictError,
  type EligibleLeaderboardEntry,
  type LeaderboardProjectionRepository,
} from '../types';
import { snapshotEntriesEqual } from '../services/ranking';

export class PrismaLeaderboardRepository implements LeaderboardProjectionRepository {
  public constructor(
    private readonly prisma: AppPrismaClient,
    private readonly topK = 10,
  ) {}

  public async findSnapshot(userId: string): Promise<LeaderboardSnapshot> {
    const leaderboard = await this.prisma.leaderboard.findUnique({
      include: { entries: { orderBy: { rank: 'asc' } } },
      where: { ownerId: userId },
    });
    if (leaderboard === null) {
      return {
        entries: [],
        k: this.topK,
        updatedAt: null,
        userId,
      };
    }

    return {
      entries: leaderboard.entries.map(toSnapshotEntry),
      k: this.topK,
      updatedAt: leaderboard.updatedAt.toISOString(),
      userId,
    };
  }

  public async replaceSnapshot(
    userId: string,
    k: number,
    entries: LeaderboardEntrySnapshot[],
    sourceEventId?: string,
    expectedUpdatedAt?: string | null,
  ): Promise<LeaderboardSnapshot> {
    return this.prisma.$transaction(async (transaction) => {
      // A transaction-scoped advisory lock serializes projection replacement
      // for one user while allowing unrelated users to update concurrently.
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
      `;

      const previous = await transaction.leaderboard.findUnique({
        where: { ownerId: userId },
      });
      if (
        expectedUpdatedAt !== undefined &&
        (previous?.updatedAt.toISOString() ?? null) !== expectedUpdatedAt
      ) {
        throw new LeaderboardProjectionConflictError();
      }
      const leaderboard =
        previous ??
        (await transaction.leaderboard.create({ data: { ownerId: userId } }));

      const current = await transaction.leaderboard.findUniqueOrThrow({
        include: { entries: { orderBy: { rank: 'asc' } } },
        where: { id: leaderboard.id },
      });
      const currentSnapshot: LeaderboardSnapshot = {
        entries: current.entries.map(toSnapshotEntry),
        k: this.topK,
        updatedAt: current.updatedAt.toISOString(),
        userId,
      };

      if (sourceEventId !== undefined) {
        const existingReceipt =
          await transaction.leaderboardEventReceipt.findUnique({
            where: { eventId: sourceEventId },
          });
        if (existingReceipt !== null) {
          return currentSnapshot;
        }
        await transaction.leaderboardEventReceipt.create({
          data: { eventId: sourceEventId, leaderboardId: leaderboard.id },
        });
      }

      if (snapshotEntriesEqual(currentSnapshot.entries, entries)) {
        return currentSnapshot;
      }

      await transaction.leaderboardEntry.deleteMany({
        where: { leaderboardId: leaderboard.id },
      });
      if (entries.length > 0) {
        await transaction.leaderboardEntry.createMany({
          data: entries.map((entry) => ({
            endTime: BigInt(entry.endTime),
            experimentId: entry.experimentId,
            leaderboardId: leaderboard.id,
            maxDrawdown: entry.maxDrawdown,
            memberStrategies: toInputJson(entry.memberStrategies),
            pair: entry.pair,
            rank: entry.rank,
            return: entry.return,
            score: entry.score,
            startTime: BigInt(entry.startTime),
            strategyDisplayName: entry.strategyDisplayName,
            strategyVersionId: entry.strategyVersionId,
            timeframe: entry.timeframe,
            totalProfit: entry.totalProfit,
            totalTrades: entry.totalTrades,
            winRate: entry.winRate,
          })),
        });
      }

      const updatedAt = new Date();
      await transaction.leaderboard.update({
        data: { updatedAt },
        where: { id: leaderboard.id },
      });
      const snapshot = {
        entries,
        k,
        updatedAt: updatedAt.toISOString(),
        userId,
      };
      const event = createDomainEvent('LeaderboardUpdated', snapshot);
      await transaction.outboxEvent.create({
        data: {
          eventId: event.eventId,
          name: event.name,
          occurredAt: new Date(event.occurredAt),
          payload: event.payload as unknown as Prisma.InputJsonValue,
          version: event.version,
        },
      });
      return snapshot;
    });
  }

  public async findEligibleEntries(): Promise<EligibleLeaderboardEntry[]> {
    const experiments = await this.prisma.experiment.findMany({
      include: {
        strategyVersion: { include: { strategyDefinition: true } },
      },
      orderBy: { id: 'asc' },
      where: {
        backtestJob: { is: { status: 'COMPLETED' } },
        maxDrawdown: { not: null },
        return: { not: null },
        score: { not: null },
        totalProfit: { not: null },
        totalTrades: { not: null },
        winRate: { not: null },
        strategyVersion: {
          strategyDefinition: { type: 'composite' },
        },
      },
    });

    return experiments.flatMap((experiment) => {
      const display = formatCompositeStrategyDisplay(
        experiment.strategyVersion.params,
        experiment.strategyVersion.strategyDefinition.name,
      );
      if (display.members.length < 2) return [];
      return [
        {
          endTime: Number(experiment.endTime),
          experimentId: experiment.id,
          maxDrawdown: decimalString(experiment.maxDrawdown),
          memberStrategies: display.members,
          pair: experiment.pair,
          return: decimalString(experiment.return),
          score: decimalString(experiment.score),
          startTime: Number(experiment.startTime),
          strategyDisplayName: display.name,
          strategyVersionId: experiment.strategyVersionId,
          timeframe:
            experiment.timeframe as EligibleLeaderboardEntry['timeframe'],
          totalProfit: decimalString(experiment.totalProfit),
          totalTrades: experiment.totalTrades ?? 0,
          userId: experiment.ownerId,
          winRate: decimalString(experiment.winRate),
        },
      ];
    });
  }

  public async findLeaderboardUserIds(): Promise<string[]> {
    const leaderboards = await this.prisma.leaderboard.findMany({
      select: { ownerId: true },
    });
    return leaderboards.map(({ ownerId }) => ownerId);
  }
}

function toSnapshotEntry(entry: {
  experimentId: string;
  strategyVersionId: string;
  strategyDisplayName: string;
  memberStrategies: unknown;
  pair: string;
  timeframe: string;
  startTime: bigint;
  endTime: bigint;
  score: Prisma.Decimal;
  return: Prisma.Decimal;
  winRate: Prisma.Decimal;
  maxDrawdown: Prisma.Decimal;
  totalProfit: Prisma.Decimal;
  totalTrades: number;
  rank: number;
}): LeaderboardEntrySnapshot {
  return {
    endTime: Number(entry.endTime),
    experimentId: entry.experimentId,
    maxDrawdown: entry.maxDrawdown.toString(),
    memberStrategies: parseMemberStrategies(entry.memberStrategies),
    pair: entry.pair,
    rank: entry.rank,
    return: entry.return.toString(),
    score: entry.score.toString(),
    startTime: Number(entry.startTime),
    strategyDisplayName: entry.strategyDisplayName,
    strategyVersionId: entry.strategyVersionId,
    timeframe: entry.timeframe as LeaderboardEntrySnapshot['timeframe'],
    totalProfit: entry.totalProfit.toString(),
    totalTrades: entry.totalTrades,
    winRate: entry.winRate.toString(),
  };
}

function parseMemberStrategies(
  value: unknown,
): LeaderboardEntrySnapshot['memberStrategies'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((member) => {
    if (
      member === null ||
      typeof member !== 'object' ||
      Array.isArray(member) ||
      typeof (member as { strategyId?: unknown }).strategyId !== 'string' ||
      typeof (member as { label?: unknown }).label !== 'string'
    ) {
      return [];
    }
    const parsed = member as { strategyId: string; label: string };
    return [{ label: parsed.label, strategyId: parsed.strategyId }];
  });
}

function decimalString(value: unknown): string {
  return value === null || value === undefined ? '0' : String(value);
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
