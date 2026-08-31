export type Pair = string;

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export const TIMEFRAMES: readonly Timeframe[] = [
  '1m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
];

export function isTimeframe(value: unknown): value is Timeframe {
  return typeof value === 'string' && TIMEFRAMES.includes(value as Timeframe);
}

export interface MarketKey {
  pair: Pair;
  timeframe: Timeframe;
}

export interface Candle extends MarketKey {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export interface CandleQuery extends MarketKey {
  limit?: number;
  startTime?: number;
  endTime?: number;
}

export interface CandleUpdateMetadata {
  exchangeEventTime?: number;
}

export const DEFAULT_CANDLE_LIMIT = 500;
export const MAX_CANDLE_LIMIT = 1_000;

export function normalizeCandleLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_CANDLE_LIMIT;
  }
  return Math.min(MAX_CANDLE_LIMIT, Math.max(1, Math.trunc(limit)));
}

export function marketKey({ pair, timeframe }: MarketKey): string {
  return `${pair}:${timeframe}`;
}
