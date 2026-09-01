import type { Pair, Timeframe } from '../marketData/candle';
import type { StrategyParamsSchema } from '../strategy/types';

export interface RandomSource {
  random(): number;
}

export interface CombinationConfig {
  mode: 'majority' | 'weighted';
  weights?: number[] | undefined;
  threshold?: number | undefined;
  stopLoss?: number | undefined;
  takeProfit?: number | undefined;
}

export interface CandidateProvenance {
  algorithm: string;
  seed?: number | undefined;
  generationOrdinal: number;
}

export interface CandidateStrategy {
  readonly strategyIds: readonly string[];
  readonly parameterSnapshots: readonly Readonly<Record<string, unknown>>[];
  readonly combinationConfig?: Readonly<CombinationConfig> | undefined;
  readonly fingerprint: string;
  readonly provenance: Readonly<CandidateProvenance>;
}

export interface StrategySearchParamDomain {
  type?: 'integer' | 'number' | 'string' | 'boolean' | undefined;
  minimum?: number | undefined;
  maximum?: number | undefined;
  step?: number | undefined;
  default?: unknown | undefined;
  options?: readonly unknown[] | undefined;
}

export interface EnabledStrategyDescriptor {
  readonly id: string;
  readonly paramsSchema?: StrategyParamsSchema | undefined;
  readonly paramDomains?:
    Readonly<Record<string, StrategySearchParamDomain>> | undefined;
  readonly timeframe?: string | undefined;
  readonly applicability?: unknown | undefined;
}

export interface SearchSpace {
  readonly enabledStrategies: readonly EnabledStrategyDescriptor[];
  readonly permittedCombinationModes: readonly ('majority' | 'weighted')[];
  readonly pair: Pair;
  readonly timeframe: Timeframe;
  readonly startTime: number;
  readonly endTime: number;
  readonly initialInvestment?: string | undefined;
  readonly transactionCost?: string | undefined;
  readonly slippage?: string | undefined;
}

export interface StopPolicy {
  readonly maxCandidates?: number | undefined;
  readonly timeBudgetMs?: number | undefined;
  readonly maxNoImprovement?: number | undefined;
  readonly maxConsecutiveFailures?: number | undefined;
  readonly maxInFlight?: number | undefined;
  readonly scoreEpsilon?: number | undefined;
}

export interface DefaultStopPolicy {
  readonly maxCandidates: number;
  readonly timeBudgetMs: number;
  readonly maxNoImprovement: number;
  readonly maxConsecutiveFailures: number;
  readonly maxInFlight: number;
  readonly scoreEpsilon: number;
}

export const DEFAULT_STOP_POLICY: DefaultStopPolicy = {
  maxCandidates: 100,
  maxConsecutiveFailures: 5,
  maxInFlight: 10,
  maxNoImprovement: 25,
  scoreEpsilon: 1e-6,
  timeBudgetMs: 15 * 60 * 1000,
};

export interface StrategyGenerator {
  generate(): CandidateStrategy;
}

export type SearchRunStatus = 'RUNNING' | 'STOPPING' | 'COMPLETED' | 'FAILED';

export type StopReason =
  | 'CANDIDATE_CAP'
  | 'TIME_BUDGET'
  | 'NO_IMPROVEMENT'
  | 'CONSECUTIVE_FAILURES'
  | 'USER_STOPPED';
