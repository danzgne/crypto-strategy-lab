import { describe, expect, it } from 'vitest';

import { WyckoffStrategy } from '../src/strategies/wyckoffStrategy';
import { makeContext } from './testUtils';

describe('WyckoffStrategy', () => {
  it('instantiates with correct defaults', () => {
    const strategy = new WyckoffStrategy();
    expect(strategy.params.length).toBe(20);
    expect(strategy.params.threshold).toBe(0.02);
    expect(strategy.params.volumeRatio).toBe(1.5);
    expect(strategy.requiredHistory).toBe(21);
  });

  it('returns HOLD when not enough history', () => {
    const strategy = new WyckoffStrategy({ length: 4 });
    const context = makeContext(Array(4).fill(100)); // 5 required
    expect(strategy.analyze(context).action).toBe('HOLD');
  });

  it('emits BUY on breakout from accumulation', () => {
    const strategy = new WyckoffStrategy({ length: 4, threshold: 0.05, volumeRatio: 1.5 });
    
    // length = 4. We need a range width <= 0.05.
    // e.g. min 100, max 104 -> width 0.04 <= 0.05.
    // volume ratio >= 1.5 (second half / first half).
    // first half = 2 candles, second half = 2 candles.
    
    const customCandles = [
      { close: 100, volume: 10, high: 102, low: 99, open: 100 },
      { close: 102, volume: 10, high: 103, low: 100, open: 100 },
      // First half vol = 20
      { close: 101, volume: 20, high: 103, low: 100, open: 100 },
      { close: 103, volume: 20, high: 104, low: 101, open: 100 },
      // Second half vol = 40. Ratio = 40/20 = 2.0 >= 1.5.
      // Max high = 104, Min low = 99. Width = 5 / 99 = 0.0505 (wait, > 0.05).
      // Let's adjust lows/highs to be tighter.
      // Current candle breaks out (close > 104).
      { close: 110, volume: 50, high: 115, low: 105, open: 105 },
    ].map((c, i) => ({
      pair: 'BTCUSDT' as const, timeframe: '1m' as const, openTime: i, closeTime: i, isClosed: true,
      ...c
    }));

    // Fix the tight range
    customCandles[0].low = 100;
    customCandles[0].high = 102;
    customCandles[1].low = 100;
    customCandles[1].high = 102;
    customCandles[2].low = 100;
    customCandles[2].high = 102;
    customCandles[3].low = 100;
    customCandles[3].high = 102;
    // maxHigh = 102, minLow = 100. Width = 2 / 100 = 0.02 <= 0.05.

    const signal = strategy.analyze({ candles: customCandles, pair: 'BTCUSDT', timeframe: '1m', sentiment: { positive: 0, neutral: 0, negative: 0, score: 0, sampleSize: 0 } });
    expect(signal.action).toBe('BUY');
  });
});
