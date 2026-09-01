import type {
  BacktestResourceStatus,
  BacktestResultResponse,
  BacktestSubmissionRequest,
  BacktestSubmissionResponse,
  Candle,
  SimulatedTrade,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import type { Strategy } from '@crypto-strategy-lab/strategy-engine';

export interface PreparedDataset {
  pair: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  warmupCandleCount: number;
  candles: Candle[];
  fingerprint: string;
}

export interface ResolvedBacktestTarget {
  strategy: Strategy;
  strategyVersionId?: string;
  strategyId: string;
  params: unknown;
  canonicalIdentity: string;
  requiredHistory: number;
}

export interface BacktestSubmissionInput {
  target: ResolvedBacktestTarget;
  dataset: PreparedDataset;
  pair: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  initialInvestment: string;
  transactionCost: string;
  slippage: number;
}

export interface BacktestSubmissionResult {
  experimentId: string;
  jobId: string;
  strategyVersionId: string;
}

export interface StoredStrategyVersion {
  id: string;
  strategyId: string;
  params: unknown;
  canonicalIdentity: string | null;
}

export interface StoredBacktestResource {
  experimentId: string;
  jobId: string;
  status: BacktestResourceStatus;
  strategyVersionId: string;
  strategyId: string;
  strategyParams: unknown;
  pair: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  initialInvestment: string;
  transactionCost: string;
  slippage: string;
  simulationRulesVersion: string;
  evaluatorVersion: string;
  failureReason: string | null;
  metrics: StoredBacktestMetrics | null;
  candles: Candle[];
  trades: StoredBacktestTrade[];
  datasetFingerprint: string | null;
}

export interface StoredBacktestMetrics {
  return: string;
  winRate: string;
  maxDrawdown: string;
  maxDrawdownAmount: string;
  totalTrades: number;
  wins: number;
  losses: number;
  totalProfit: string;
  profitFactor: string;
  profitFactorInfinite: boolean;
  sharpeRatio: string;
  score: string;
}

export interface StoredBacktestTrade {
  id: string;
  pair: string;
  entryTime: number;
  exitTime: number;
  direction: SimulatedTrade['direction'];
  investment: string;
  entryPrice: string;
  stopLoss: string | null;
  takeProfit: string | null;
  exitPrice: string;
  transactionCost: string;
  slippage: string;
  profit: string;
  exitReason: SimulatedTrade['exitReason'];
}

export interface BacktestRepository {
  findStrategyVersion(
    ownerId: string,
    versionId: string,
  ): Promise<StoredStrategyVersion | null>;
  createSubmission(
    ownerId: string,
    input: BacktestSubmissionInput,
  ): Promise<BacktestSubmissionResult>;
  findResource(
    ownerId: string,
    experimentId: string,
  ): Promise<StoredBacktestResource | null>;
}

export interface BacktestHistoryProvider {
  prepareHistoricalCandles(
    query: {
      pair: string;
      timeframe: Timeframe;
      startTime: number;
      endTime: number;
    },
    requiredHistory: number,
    maxSelectedCandles: number,
  ): Promise<{
    candles: Candle[];
    selectedCandles: Candle[];
    warmupCandleCount: number;
  }>;
}

export type BacktestRequest = BacktestSubmissionRequest;
export type BacktestSubmission = BacktestSubmissionResponse;
export type BacktestResult = BacktestResultResponse;
