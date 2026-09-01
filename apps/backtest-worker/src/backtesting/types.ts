import type { Candle, Pair, Timeframe } from '@crypto-strategy-lab/shared';
import type { SimulatedTrade } from '@crypto-strategy-lab/shared/backtest';
import type { Strategy } from '@crypto-strategy-lab/strategy-engine';

export interface BacktestInput {
  strategy: Strategy;
  pair: Pair;
  timeframe: Timeframe;
  candles: readonly Candle[];
  startTime: number;
  endTime: number;
  initialInvestment: number;
  transactionCost: number;
  /** Slippage in basis points. `5` means 0.05%. */
  slippage: number;
}

export interface BacktestSimulation {
  trades: SimulatedTrade[];
  finalEquity: number;
}

export interface Backtester {
  run(input: BacktestInput): BacktestSimulation;
}
