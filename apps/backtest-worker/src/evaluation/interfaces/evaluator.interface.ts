import type {
  BacktestMetrics,
  SimulatedTrade,
} from '@crypto-strategy-lab/shared';

export interface Evaluator {
  evaluate(
    trades: readonly SimulatedTrade[],
    initialCapital: number,
  ): BacktestMetrics;
}
