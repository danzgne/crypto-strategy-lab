import type { Pair } from './candle';

export type TickSide = 'BUY' | 'SELL';

export interface Tick {
  pair: Pair;
  tradeId: string;
  time: number;
  price: number;
  quantity: number;
  side: TickSide;
}

export interface TickQuery {
  pair: Pair;
  limit?: number;
}

export const DEFAULT_TICK_LIMIT = 20;
export const MAX_TICK_LIMIT = 100;

export function normalizeTickLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_TICK_LIMIT;
  }
  return Math.min(MAX_TICK_LIMIT, Math.max(1, Math.trunc(limit)));
}
