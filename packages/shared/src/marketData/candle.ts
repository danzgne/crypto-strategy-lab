export type Pair = string;

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

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

export function marketKey({ pair, timeframe }: MarketKey): string {
  return `${pair}:${timeframe}`;
}
