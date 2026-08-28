import type { Candle } from '@crypto-strategy-lab/shared';
import type { StrategyContext } from '../src/types';

export const EMPTY_SENTIMENT = {
  positive: 0,
  neutral: 0,
  negative: 0,
  score: 0,
  sampleSize: 0,
} as const;

export function makeContext(closes: number[]): StrategyContext {
  const candles: Candle[] = closes.map((close, index) => ({
    pair: 'BTCUSDT',
    timeframe: '1m',
    openTime: 1_756_000_000_000 + index * 60_000,
    closeTime: 1_756_000_059_999 + index * 60_000,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10 + index,
    isClosed: true,
  }));

  return {
    candles,
    pair: 'BTCUSDT',
    timeframe: '1m',
    sentiment: EMPTY_SENTIMENT,
  };
}
