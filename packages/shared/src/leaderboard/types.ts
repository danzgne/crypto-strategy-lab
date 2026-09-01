import type { Pair, Timeframe } from '../marketData/candle';

export interface LeaderboardMemberSnapshot {
  strategyId: string;
  label: string;
}

/**
 * The public, immutable snapshot of one completed strategy experiment on a
 * user's current Top-K board.
 */
export interface LeaderboardEntrySnapshot {
  experimentId: string;
  strategyVersionId: string;
  strategyDisplayName: string;
  memberStrategies: LeaderboardMemberSnapshot[];
  pair: Pair;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  score: string;
  return: string;
  winRate: string;
  maxDrawdown: string;
  totalProfit: string;
  totalTrades: number;
  rank: number;
}

export interface LeaderboardSnapshot {
  userId: string;
  k: number;
  updatedAt: string | null;
  entries: LeaderboardEntrySnapshot[];
}

export type LeaderboardResponse = Omit<LeaderboardSnapshot, 'userId'>;
