import { describe, expect, it } from 'vitest';

import type { SimulatedTrade } from '@crypto-strategy-lab/shared';

import { DefaultEvaluator } from '../../../src/evaluation/defaultEvaluator';

const evaluator = new DefaultEvaluator();

describe('DefaultEvaluator', () => {
  it('returns zero metrics for a no-trade result', () => {
    expect(evaluator.evaluate([], 100)).toEqual({
      return: 0,
      winRate: 0,
      maxDrawdown: 0,
      maxDrawdownAmount: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      profitFactor: 0,
      profitFactorInfinite: false,
      sharpeRatio: 0,
      score: 0,
    });
  });

  it('evaluates closed trades using post-trade equity and sample Sharpe returns', () => {
    const metrics = evaluator.evaluate(
      [
        makeTrade({ investment: 100, profit: 10 }),
        makeTrade({ investment: 110, profit: -5 }),
        makeTrade({ investment: 105, profit: 0 }),
      ],
      100,
    );

    expect(metrics.totalProfit).toBe(5);
    expect(metrics.return).toBe(0.05);
    expect(metrics.winRate).toBeCloseTo(1 / 3);
    expect(metrics.wins).toBe(1);
    expect(metrics.losses).toBe(1);
    expect(metrics.totalTrades).toBe(3);
    expect(metrics.maxDrawdownAmount).toBe(5);
    expect(metrics.maxDrawdown).toBeCloseTo(5 / 110);
    expect(metrics.profitFactor).toBe(2);
    expect(metrics.profitFactorInfinite).toBe(false);
    expect(metrics.sharpeRatio).toBeCloseTo(0.244, 3);
    expect(metrics.score).toBeCloseTo(0.378, 3);
  });

  it('reports positive infinity when profit exists without a loss', () => {
    const metrics = evaluator.evaluate(
      [makeTrade({ investment: 100, profit: 10 })],
      100,
    );

    expect(metrics.profitFactor).toBe(Infinity);
    expect(metrics.profitFactorInfinite).toBe(true);
    expect(metrics.sharpeRatio).toBe(0);
  });

  it('uses zero Sharpe for fewer than two trades and zero variance', () => {
    expect(
      evaluator.evaluate([makeTrade({ profit: 10 })], 100).sharpeRatio,
    ).toBe(0);
    expect(
      evaluator.evaluate(
        [
          makeTrade({ investment: 100, profit: 10 }),
          makeTrade({ investment: 100, profit: 10 }),
        ],
        100,
      ).sharpeRatio,
    ).toBe(0);
  });
});

function makeTrade(
  overrides: Partial<Pick<SimulatedTrade, 'investment' | 'profit'>> = {},
): SimulatedTrade {
  return {
    direction: 'LONG',
    entryPrice: 100,
    entryTime: 1,
    exitPrice: 100,
    exitReason: 'SIGNAL',
    exitTime: 2,
    investment: overrides.investment ?? 100,
    pair: 'BTCUSDT',
    profit: overrides.profit ?? 0,
    slippage: 0,
    stopLoss: null,
    takeProfit: null,
    transactionCost: 0,
  };
}
