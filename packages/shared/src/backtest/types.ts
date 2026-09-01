import type { Candle, Pair, Timeframe } from '../marketData/candle';
import type { CompositeStrategyRequest } from '../realtime/transport';

export type TradeDirection = 'LONG' | 'SHORT';

export type TradeExitReason =
  'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'FINAL_CANDLE';

/** A closed simulated position. Monetary and price values are in quote currency. */
export interface SimulatedTrade {
  pair: Pair;
  entryTime: number;
  exitTime: number;
  direction: TradeDirection;
  investment: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  exitPrice: number;
  transactionCost: number;
  slippage: number;
  profit: number;
  exitReason: TradeExitReason;
}

export interface BacktestMetrics {
  return: number;
  winRate: number;
  maxDrawdown: number;
  maxDrawdownAmount: number;
  totalTrades: number;
  wins: number;
  losses: number;
  totalProfit: number;
  profitFactor: number;
  profitFactorInfinite: boolean;
  sharpeRatio: number;
  score: number;
}

export interface BacktestOutcome {
  trades: SimulatedTrade[];
  metrics: BacktestMetrics;
}

export interface BacktestTargetRequest {
  strategyVersionId?: string;
  strategyId?: string;
  params?: unknown;
  composite?: CompositeStrategyRequest;
}

export interface BacktestSubmissionRequest extends BacktestTargetRequest {
  pair: Pair;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  initialInvestment: number | string;
  transactionCost: number | string;
  slippage: number | string;
}

export type BacktestResourceStatus =
  'queued' | 'running' | 'completed' | 'failed';

export interface BacktestSubmissionResponse {
  experimentId: string;
  jobId: string;
  status: 'queued';
}

export interface BacktestCandleResponse {
  pair: Pair;
  timeframe: Timeframe;
  openTime: number;
  closeTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  isClosed: boolean;
}

export interface BacktestTradeResponse {
  id: string;
  pair: Pair;
  entryTime: number;
  exitTime: number;
  direction: TradeDirection;
  investment: string;
  entryPrice: string;
  stopLoss: string | null;
  takeProfit: string | null;
  exitPrice: string;
  transactionCost: string;
  slippage: string;
  profit: string;
  exitReason: TradeExitReason;
}

export interface BacktestMetricsResponse {
  return: string;
  winRate: string;
  maxDrawdown: string;
  maxDrawdownAmount: string;
  totalTrades: number;
  wins: number;
  losses: number;
  totalProfit: string;
  profitFactor: string | null;
  profitFactorInfinite: boolean;
  sharpeRatio: string;
  score: string;
}

export interface BacktestResultResponse {
  experimentId: string;
  jobId: string;
  status: BacktestResourceStatus;
  strategyVersionId: string;
  strategyId: string;
  strategyParams: unknown;
  pair: Pair;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  initialInvestment: string;
  transactionCost: string;
  slippage: string;
  simulationRulesVersion: string;
  evaluatorVersion: string;
  failureReason: string | null;
  metrics: BacktestMetricsResponse | null;
  candles: BacktestCandleResponse[];
  trades: BacktestTradeResponse[];
  datasetFingerprint: string | null;
}

export interface BacktestHistoryMetricsResponse {
  return: string;
  totalProfit: string;
  totalTrades: number;
  winRate: string;
}

export interface BacktestHistoryItem {
  experimentId: string;
  jobId: string;
  status: BacktestResourceStatus;
  strategyVersionId: string;
  strategyId: string;
  strategyName: string;
  pair: Pair;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  createdAt: number;
  failureReason: string | null;
  metrics: BacktestHistoryMetricsResponse | null;
}

export type BacktestHistoryResponse = BacktestHistoryItem[];

export function backtestCandleFromResponse(
  candle: BacktestCandleResponse,
): Candle {
  return {
    close: Number(candle.close),
    closeTime: candle.closeTime,
    high: Number(candle.high),
    isClosed: candle.isClosed,
    low: Number(candle.low),
    open: Number(candle.open),
    openTime: candle.openTime,
    pair: candle.pair,
    timeframe: candle.timeframe,
    volume: Number(candle.volume),
  };
}
