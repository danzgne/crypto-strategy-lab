import { describe, expect, it } from 'vitest';

import { SMCStrategy } from '../src/strategies/smcStrategy';
import { makeContext } from './testUtils';

describe('SMCStrategy', () => {
  it('instantiates with correct defaults', () => {
    const strategy = new SMCStrategy();
    expect(strategy.params.n).toBe(10);
    expect(strategy.params.tolerance).toBe(0.005);
    expect(strategy.requiredHistory).toBe(30);
  });

  it('returns HOLD when not enough history', () => {
    const strategy = new SMCStrategy({ n: 2 });
    const context = makeContext(Array(5).fill(100)); // n*3 = 6 required
    expect(strategy.analyze(context).action).toBe('HOLD');
  });

  it('emits BUY on bullish break of structure and retest', () => {
    const strategy = new SMCStrategy({ n: 2, tolerance: 0.05 });
    
    // 2N+1 = 5 candles to form a swing high.
    // Let's create a swing high at 110.
    // C0: 100, C1: 105, C2: 110 (swing high), C3: 105, C4: 100
    // Then price breaks above 110 (bullish break). The candle before the break should be a down-candle (open > close).
    // Let's make C5 open 105, close 100 (down candle).
    // C6 close 120 (breaks 110). C5 is the bullish OB [100, 105].
    // Then retest: price drops to 105 (within tolerance of OB high).
    
    // Since makeContext sets open = close, we can't create an order block because SMCStrategy checks `open > close`!
    // Let's create a custom context.
    
    const customCandles = [
      { open: 100, high: 101, low: 99, close: 100 },
      { open: 105, high: 106, low: 104, close: 105 },
      { open: 110, high: 111, low: 109, close: 110 }, // Swing high (high 111)
      { open: 105, high: 106, low: 104, close: 105 },
      { open: 100, high: 101, low: 99, close: 100 },
      { open: 105, high: 106, low: 99, close: 100 },  // Down candle: open 105 > close 100. OB: [100, 105]
      { open: 100, high: 125, low: 115, close: 120 },  // Breaks swing high (120 > 111). Bullish OB found.
      { open: 120, high: 121, low: 105, close: 106 }  // Retests OB. low 105 <= OB upper (105 + 105*0.05).
    ].map((c, i) => ({
      pair: 'BTCUSDT' as const, timeframe: '1m' as const, openTime: i, closeTime: i, volume: 10, isClosed: true,
      ...c
    }));

    const signal = strategy.analyze({ candles: customCandles, pair: 'BTCUSDT', timeframe: '1m', sentiment: { positive: 0, neutral: 0, negative: 0, score: 0, sampleSize: 0 } });
    expect(signal.action).toBe('BUY');
    expect(signal.indicators?.['BULLISH_OB_LOWER']).toBe(100);
  });
});
