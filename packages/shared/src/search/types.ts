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

// Display-only facts about a member sourced from a version member (see VersionSearchSpaceMember).
// Never influences the candidate fingerprint or a persisted Strategy Version's params: it exists so
// a Leaderboard entry can show "MyRule 1.2.0" instead of a bare registry id.
export interface CandidateMemberSource {
  readonly strategyVersionId: string;
  readonly versionTag: string;
  readonly displayName: string;
}

export interface CandidateStrategy {
  readonly strategyIds: readonly string[];
  readonly parameterSnapshots: readonly Readonly<Record<string, unknown>>[];
  // Parallel to strategyIds/parameterSnapshots; an entry is present only for members sourced from a
  // version member, undefined elsewhere.
  readonly memberSources?:
    readonly (Readonly<CandidateMemberSource> | undefined)[] | undefined;
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

export interface RegistrySearchSpaceMember {
  readonly kind?: 'registry' | undefined;
  readonly id: string;
  readonly paramsSchema?: StrategyParamsSchema | undefined;
  readonly paramDomains?:
    Readonly<Record<string, StrategySearchParamDomain>> | undefined;
  readonly timeframe?: string | undefined;
  readonly applicability?: unknown | undefined;
}

export interface VersionSearchSpaceMember {
  readonly kind: 'version';
  readonly id: string;
  readonly strategyVersionId: string;
  readonly versionTag: string;
  readonly displayName: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly timeframe?: string | undefined;
  readonly applicability?: unknown | undefined;
}

export type EnabledStrategyDescriptor =
  RegistrySearchSpaceMember | VersionSearchSpaceMember;

export function isVersionMember(
  descriptor: EnabledStrategyDescriptor,
): descriptor is VersionSearchSpaceMember {
  return descriptor.kind === 'version';
}

// A run's own member identity: two Library entries can share one registry id, so version members
// are distinct by version rather than by the Strategy they execute on.
export function searchSpaceMemberKey(
  descriptor: EnabledStrategyDescriptor,
): string {
  return isVersionMember(descriptor)
    ? `version:${descriptor.strategyVersionId}`
    : `registry:${descriptor.id}`;
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

export type DiscoverySessionStatus = 'ACTIVE' | 'PAUSED' | 'STOPPED';

export interface EvaluatingCandidateSummary {
  readonly name: string;
  readonly strategyIds: string[];
  readonly mode?: 'majority' | 'weighted' | undefined;
  readonly pair: string;
  readonly timeframe: string;
}

export interface BestCandidateSummary {
  readonly experimentId: string;
  readonly name: string;
  readonly strategyIds: string[];
  readonly mode?: 'majority' | 'weighted' | undefined;
  readonly score: number;
  readonly profit?: number | undefined;
  readonly winRate?: number | undefined;
  readonly maxDrawdown?: number | undefined;
  readonly returnPct?: number | undefined;
}

export const RANDOM_SEARCH_ALGORITHM_ID = 'random-v1';

export interface DiscoverySessionState {
  readonly sessionId: string;
  readonly userId: string;
  readonly status: DiscoverySessionStatus;
  readonly algorithm: string;
  readonly searchSpace: SearchSpace;
  readonly stopPolicy: StopPolicy;
  readonly currentRunId?: string | undefined;
  readonly totalRunsCompleted: number;
  readonly totalAcceptedCandidates: number;
  readonly bestScore: number | null;
  readonly startedAt: number;
  readonly lastRunStopReason?: StopReason | undefined;
  readonly latestCandidate?: EvaluatingCandidateSummary | undefined;
  readonly bestCandidate?: BestCandidateSummary | undefined;
}

export interface SearchRunSummary {
  readonly id: string;
  readonly ownerId: string;
  readonly status: SearchRunStatus;
  readonly algorithm: string;
  readonly acceptedCandidates: number;
  readonly bestScore: number | null;
  readonly stopReason: StopReason | null;
  readonly startedAt: string;
  readonly stoppedAt: string | null;
}

export interface DiscoveryProgressPayload {
  readonly sessionId: string;
  readonly userId: string;
  readonly currentRunId?: string | undefined;
  readonly runStatus?: SearchRunStatus | undefined;
  readonly sessionStatus: DiscoverySessionStatus;
  readonly acceptedCandidates: number;
  readonly maxCandidates: number;
  readonly bestScore: number | null;
  readonly inFlightJobs: number;
  readonly stopReason?: StopReason | undefined;
  readonly totalRunsCompleted: number;
  readonly latestCandidate?: EvaluatingCandidateSummary | undefined;
  readonly bestCandidate?: BestCandidateSummary | undefined;
}

export interface StartDiscoverySessionInput {
  readonly searchSpace: SearchSpace;
  readonly algorithm?: string | undefined;
  readonly stopPolicy?: StopPolicy | undefined;
}
