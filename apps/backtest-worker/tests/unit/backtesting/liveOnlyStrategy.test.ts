import { describe, expect, it } from 'vitest';

import type { Candle, Strategy } from '@crypto-strategy-lab/shared';

import { HistoricalBacktester } from '../../../src/backtesting/historicalBacktester';

describe('HistoricalBacktester live-only guard', () => {
  it('rejects a live-only strategy until historical sentiment snapshots exist', () => {
    const strategy: Strategy = {
      id: 'news-sentiment',
      liveOnly: true,
      params: {},
      requiredHistory: 1,
      analyze: () => ({ action: 'HOLD' }),
    };
    const candle: Candle = {
      pair: 'BTCUSDT',
      timeframe: '1m',
      openTime: 0,
      closeTime: 59_999,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1,
      isClosed: true,
    };

    expect(() =>
      new HistoricalBacktester().run({
        candles: [candle],
        endTime: 60_000,
        initialInvestment: 100,
        pair: 'BTCUSDT',
        slippage: 0,
        startTime: 0,
        strategy,
        timeframe: '1m',
        transactionCost: 0,
      }),
    ).toThrow(/live-only/);
  });
});
