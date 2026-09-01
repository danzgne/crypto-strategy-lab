import type {
  DomainEventEnvelope,
  LeaderboardEntrySnapshot,
  LeaderboardSnapshot,
  StrategyEvaluatedPayload,
} from '@crypto-strategy-lab/shared';

export type StrategyEvaluatedEvent = DomainEventEnvelope<'StrategyEvaluated'>;
export type LeaderboardEntryCandidate = Omit<LeaderboardEntrySnapshot, 'rank'>;

export interface EligibleLeaderboardEntry extends LeaderboardEntryCandidate {
  userId: string;
}

export interface LeaderboardProjectionRepository {
  findSnapshot(userId: string): Promise<LeaderboardSnapshot>;
  replaceSnapshot(
    userId: string,
    k: number,
    entries: LeaderboardEntrySnapshot[],
    sourceEventId?: string,
    expectedUpdatedAt?: string | null,
  ): Promise<LeaderboardSnapshot>;
  findEligibleEntries(): Promise<EligibleLeaderboardEntry[]>;
  findLeaderboardUserIds(): Promise<string[]>;
}

export interface LeaderboardEventBus {
  subscribe(
    name: 'StrategyEvaluated',
    handler: (event: StrategyEvaluatedEvent) => void | Promise<void>,
  ): () => void;
}

export class LeaderboardProjectionConflictError extends Error {
  public constructor() {
    super('Leaderboard projection changed while it was being ranked');
    this.name = 'LeaderboardProjectionConflictError';
  }
}

export function candidateFromEvaluation(
  payload: StrategyEvaluatedPayload,
): LeaderboardEntryCandidate {
  return {
    endTime: payload.endTime,
    experimentId: payload.experimentId,
    maxDrawdown: payload.maxDrawdown,
    memberStrategies: payload.memberStrategies.map((member) => ({ ...member })),
    pair: payload.pair,
    return: payload.return,
    score: payload.score,
    startTime: payload.startTime,
    strategyDisplayName: payload.strategyDisplayName,
    strategyVersionId: payload.strategyVersionId,
    timeframe: payload.timeframe,
    totalProfit: payload.totalProfit,
    totalTrades: payload.totalTrades,
    winRate: payload.winRate,
  };
}
