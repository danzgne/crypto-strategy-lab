import type {
  BacktestMetrics,
  SimulatedTrade,
} from '@crypto-strategy-lab/shared';

import type { Evaluator } from './interfaces/evaluator.interface';

export class DefaultEvaluator implements Evaluator {
  public evaluate(
    trades: readonly SimulatedTrade[],
    initialCapital: number,
  ): BacktestMetrics {
    assertInitialCapital(initialCapital);

    let equity = initialCapital;
    let peakEquity = initialCapital;
    let maxDrawdown = 0;
    let maxDrawdownAmount = 0;
    let totalProfit = 0;
    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    const tradeReturns: number[] = [];

    for (const trade of trades) {
      assertTrade(trade);
      totalProfit += trade.profit;
      if (trade.profit > 0) {
        wins += 1;
        grossProfit += trade.profit;
      } else if (trade.profit < 0) {
        losses += 1;
        grossLoss += trade.profit;
      }

      equity = Math.max(0, equity + trade.profit);
      if (equity > peakEquity) peakEquity = equity;
      const drawdownAmount = peakEquity - equity;
      const drawdown = peakEquity === 0 ? 0 : drawdownAmount / peakEquity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownAmount = drawdownAmount;
      }

      tradeReturns.push(trade.profit / trade.investment);
    }

    const totalTrades = trades.length;
    const returnRate = totalProfit / initialCapital;
    const winRate = totalTrades === 0 ? 0 : wins / totalTrades;
    const profitFactor =
      grossLoss < 0
        ? grossProfit / Math.abs(grossLoss)
        : grossProfit > 0
          ? Infinity
          : 0;
    const score =
      totalTrades === 0
        ? 0
        : 0.5 * clamp(returnRate) +
          0.2 * winRate +
          0.3 * (1 - clamp(maxDrawdown));

    return {
      return: returnRate,
      winRate,
      maxDrawdown,
      maxDrawdownAmount,
      totalTrades,
      wins,
      losses,
      totalProfit,
      profitFactor,
      profitFactorInfinite: profitFactor === Infinity,
      sharpeRatio: calculateSampleSharpe(tradeReturns),
      score,
    };
  }
}

export function evaluateTrades(
  trades: readonly SimulatedTrade[],
  initialCapital: number,
): BacktestMetrics {
  return new DefaultEvaluator().evaluate(trades, initialCapital);
}

function assertInitialCapital(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Initial capital must be a finite positive number');
  }
}

function assertTrade(trade: SimulatedTrade): void {
  if (
    !Number.isFinite(trade.profit) ||
    !Number.isFinite(trade.investment) ||
    trade.investment <= 0
  ) {
    throw new Error(
      'Every closed Trade must have finite positive investment and profit',
    );
  }
}

function calculateSampleSharpe(returns: readonly number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const squaredDeviation = returns.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  );
  const sampleVariance = squaredDeviation / (returns.length - 1);
  const standardDeviation = Math.sqrt(sampleVariance);
  return standardDeviation === 0 ? 0 : mean / standardDeviation;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
