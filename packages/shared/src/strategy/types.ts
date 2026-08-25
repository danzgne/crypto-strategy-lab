import type { Candle, Pair, Timeframe } from '../marketData/candle';

export type SignalAction = 'BUY' | 'SELL' | 'HOLD';

export interface Signal {
  action: SignalAction;
  strength?: number;
  reason?: string;
  indicators?: Readonly<Record<string, number>>;
}

export interface SentimentAggregate {
  positive: number;
  neutral: number;
  negative: number;
  score: number;
  sampleSize: number;
}

export interface StrategyContext {
  candles: readonly Candle[];
  pair: Pair;
  timeframe: Timeframe;
  sentiment: SentimentAggregate;
}

export type Context = StrategyContext;

export interface StrategyParamDefinition {
  type: 'integer' | 'number';
  default?: number;
  minimum?: number;
  maximum?: number;
  description?: string;
}

export interface StrategyParamsSchema {
  type: 'object';
  properties: Readonly<Record<string, StrategyParamDefinition>>;
  required?: readonly string[];
}

export interface Strategy<TParams = unknown> {
  readonly id: string;
  readonly params: Readonly<TParams>;
  readonly requiredHistory: number;
  analyze(context: StrategyContext): Signal;
}

export interface StrategyFactory {
  (params?: unknown): Strategy;
  readonly paramsSchema: StrategyParamsSchema;
}

export interface StrategyConstructor<TParams = unknown> {
  readonly paramsSchema: StrategyParamsSchema;
  new (params?: TParams): Strategy<TParams>;
}
