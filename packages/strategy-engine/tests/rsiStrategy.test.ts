
import { describe, expect, it } from 'vitest';

import { RSIStrategy } from '../src/strategies/rsiStrategy';
import { makeContext } from './testUtils';



describe('RSIStrategy', () => {
  it('instantiates with correct defaults', () => {
    const strategy = new RSIStrategy();
    expect(strategy.params.period).toBe(14);
    expect(strategy.params.oversold).toBe(30);
    expect(strategy.params.overbought).toBe(70);
    // period + 2 = 16
    expect(strategy.requiredHistory).toBe(16);
  });

  it('returns HOLD when not enough history', () => {
    const strategy = new RSIStrategy({ period: 14 });
    const context = makeContext(Array(15).fill(100)); // One less than requiredHistory
    expect(strategy.analyze(context).action).toBe('HOLD');
  });

  it('can emit a signal when given exactly requiredHistory candles', () => {
    const strategy = new RSIStrategy({ period: 2, oversold: 30, overbought: 70 });
    // requiredHistory for period=2 is 4.
    // For RSI period=2, we need 4 candles.
    // Candle 0, 1, 2 -> calculate previous RSI.
    // Candle 0, 1, 2, 3 -> calculate current RSI.
    
    // Let's create a drop to trigger BUY (oversold)
    // C0: 100, C1: 105, C2: 100 -> RSI is 50
    // C3: 50 -> RSI drops heavily < 30
    const context = makeContext([100, 105, 100, 50]);
    const signal = strategy.analyze(context);
    expect(signal.action).toBe('BUY');
  });

  it('emits SELL when crossing above overbought', () => {
    const strategy = new RSIStrategy({ period: 2, oversold: 30, overbought: 70 });
    // C0: 100, C1: 100 (RSI 100)
    // C2: 110 (gain=10, loss=0 -> RSI 100)
    // C3: 150 (gain=40, loss=0 -> RSI 100 > 70)
    // Wait, if previous is 100, and current is 100, it's not a cross.
    // We need previous <= 70, current > 70.
    // Let's make previous RSI around 50.
    // C0: 100, C1: 105 (gain=5), C2: 100 (loss=5). RSI(2) on [100, 105, 100] is roughly 50.
    // C3: 120 (gain=20). RSI goes up.
    const context = makeContext([100, 105, 100, 120]);
    const signal = strategy.analyze(context);
    expect(signal.action).toBe('SELL');
  });
});
