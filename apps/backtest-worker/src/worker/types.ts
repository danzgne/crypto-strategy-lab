import type { Candle, Pair, Timeframe } from '@crypto-strategy-lab/shared';
import type {
  BacktestMetrics,
  SimulatedTrade,
} from '@crypto-strategy-lab/shared/backtest';
import type { Job } from '@crypto-strategy-lab/shared';

export interface ClaimedBacktestJob extends Job {
  workerId: string;
  leaseToken: string;
  leaseExpiresAt: Date;
}

export interface BacktestExecutionInput {
  jobId: string;
  experimentId: string;
  strategyVersionId: string;
  strategyId: string;
  strategyParams: unknown;
  pair: Pair;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  initialInvestment: number;
  transactionCost: number;
  slippage: number;
  candles: Candle[];
}

export interface PersistedBacktestOutcome {
  trades: SimulatedTrade[];
  metrics: BacktestMetrics;
}
