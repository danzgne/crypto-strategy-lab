import type {
  Pair,
  Signal,
  SignalAction,
  Strategy,
  StrategyContext,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import {
  canonicalStrategyVersionId,
  canonicalizeValue,
  formatStrategyType,
} from '@crypto-strategy-lab/shared/strategy';

export type CombinationMode = 'majority' | 'weighted';

export const DEFAULT_COMPOSITE_THRESHOLD = 0.3;

export interface CompositeMemberInput {
  readonly strategy: Strategy;
  readonly weight?: number;
}

export type CompositeMember = Strategy | CompositeMemberInput;

export interface CompositeStrategyDefinition {
  readonly members: readonly CompositeMember[];
  readonly mode: CombinationMode;
  readonly threshold?: number;
  readonly stopLoss?: number;
  readonly takeProfit?: number;
}

export interface NormalizedCompositeMember {
  readonly strategyId: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly versionId: string;
  readonly weight: number;
}

export interface NormalizedCompositeStrategyDefinition {
  readonly members: readonly NormalizedCompositeMember[];
  readonly mode: CombinationMode;
  readonly threshold: number;
  readonly stopLoss: number | undefined;
  readonly takeProfit: number | undefined;
}

interface CompositeRuntimeMember {
  readonly strategy: Strategy;
  readonly versionId: string;
  readonly weight: number;
}

interface NormalizedCompositeAssembly {
  readonly definition: NormalizedCompositeStrategyDefinition;
  readonly runtimeMembers: readonly CompositeRuntimeMember[];
}

export interface RuleApplicabilityDeclaration {
  readonly timeframe?: string;
  readonly applicability?: unknown;
  readonly pairs?: string | readonly string[];
}

export type CombinationValidationCode =
  | 'MINIMUM_MEMBERS'
  | 'DUPLICATE_MEMBER'
  | 'INVALID_MEMBER'
  | 'INVALID_MODE'
  | 'INVALID_THRESHOLD'
  | 'INVALID_WEIGHT'
  | 'ZERO_TOTAL_WEIGHT'
  | 'CONFLICTING_TIMEFRAMES'
  | 'CONFLICTING_APPLICABILITY';

export class CombinationValidationError extends Error {
  public readonly code: CombinationValidationCode;

  public constructor(code: CombinationValidationCode, message: string) {
    super(message);
    this.name = 'CombinationValidationError';
    this.code = code;
  }
}

export class CombinationEvaluationError extends Error {
  public constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CombinationEvaluationError';
  }
}

/**
 * The immutable, signal-producing result of CombinationEngine.assemble().
 * Member failures intentionally escape analyze() so callers can surface them.
 */
export interface CompositeStrategy extends Strategy<NormalizedCompositeStrategyDefinition> {
  readonly id: 'composite';
  readonly members: readonly NormalizedCompositeMember[];
  readonly mode: CombinationMode;
  readonly threshold: number;
  readonly identity: string;
  readonly versionId: string;
  readonly displayName: string;
  readonly stopLoss: number | undefined;
  readonly takeProfit: number | undefined;
}

class CompositeStrategyImplementation implements CompositeStrategy {
  public readonly id = 'composite' as const;

  public readonly params: Readonly<NormalizedCompositeStrategyDefinition>;

  public readonly requiredHistory: number;

  public readonly liveOnly: boolean;

  public readonly members: readonly NormalizedCompositeMember[];

  public readonly mode: CombinationMode;

  public readonly threshold: number;

  public readonly identity: string;

  public readonly versionId: string;

  public readonly displayName: string;

  public readonly stopLoss: number | undefined;

  public readonly takeProfit: number | undefined;

  private readonly runtimeMembers: readonly CompositeRuntimeMember[];

  public constructor(
    definition: NormalizedCompositeStrategyDefinition,
    runtimeMembers: readonly CompositeRuntimeMember[],
    identity: string,
    displayName: string,
  ) {
    const members = Object.freeze(
      definition.members.map((member) => Object.freeze({ ...member })),
    );
    const normalizedDefinition: NormalizedCompositeStrategyDefinition =
      Object.freeze({
        members,
        mode: definition.mode,
        threshold: definition.threshold,
        stopLoss: definition.stopLoss,
        takeProfit: definition.takeProfit,
      });

    this.members = members;
    this.mode = normalizedDefinition.mode;
    this.threshold = normalizedDefinition.threshold;
    this.params = normalizedDefinition;
    this.stopLoss = normalizedDefinition.stopLoss;
    this.takeProfit = normalizedDefinition.takeProfit;
    this.runtimeMembers = Object.freeze(
      runtimeMembers.map((member) => Object.freeze({ ...member })),
    );
    this.requiredHistory = Math.max(
      ...this.runtimeMembers.map((member) => member.strategy.requiredHistory),
    );
    this.liveOnly = this.runtimeMembers.some(
      (member) => member.strategy.liveOnly === true,
    );
    this.identity = identity;
    this.versionId = identity;
    this.displayName = displayName;
  }

  public analyze(context: StrategyContext): Signal {
    const signals: Signal[] = [];
    for (const member of this.runtimeMembers) {
      // Do not catch or replace member failures: a composite failure is useful
      // information and HOLD would make it indistinguishable from a real vote.
      signals.push(member.strategy.analyze(context));
    }

    const result =
      this.mode === 'majority'
        ? majoritySignal(signals)
        : weightedSignal(signals, this.runtimeMembers, this.threshold);
    const indicators = mergeIndicators(signals, this.runtimeMembers);
    if (Object.keys(indicators).length > 0) {
      return { ...result, indicators };
    }
    return result;
  }
}

export class CombinationEngine {
  public assemble(definition: CompositeStrategyDefinition): CompositeStrategy {
    const normalized = normalizeDefinition(definition);
    const identity = canonicalizeValue({
      members: normalized.definition.members.map(({ versionId, weight }) => ({
        versionId,
        weight,
      })),
      mode: normalized.definition.mode,
      threshold: normalized.definition.threshold,
      ...(normalized.definition.stopLoss === undefined
        ? {}
        : { stopLoss: normalized.definition.stopLoss }),
      ...(normalized.definition.takeProfit === undefined
        ? {}
        : { takeProfit: normalized.definition.takeProfit }),
    });
    const displayName = normalized.runtimeMembers
      .map(({ strategy }) => formatStrategyName(strategy))
      .join(' + ')
      .concat(` · ${normalized.definition.mode}`);

    return createCompositeStrategy(
      normalized.definition,
      normalized.runtimeMembers,
      identity,
      displayName,
    );
  }
}

export function strategyVersionIdentity(strategy: Strategy): string {
  const explicitVersionId = (strategy as Strategy & { versionId?: unknown })
    .versionId;
  if (typeof explicitVersionId === 'string' && explicitVersionId.length > 0) {
    return explicitVersionId;
  }
  return canonicalStrategyVersionId(strategy.id, strategy.params);
}

function createCompositeStrategy(
  definition: NormalizedCompositeStrategyDefinition,
  runtimeMembers: readonly CompositeRuntimeMember[],
  identity: string,
  displayName: string,
): CompositeStrategy {
  return new CompositeStrategyImplementation(
    definition,
    runtimeMembers,
    identity,
    displayName,
  );
}

function normalizeDefinition(
  definition: CompositeStrategyDefinition,
): NormalizedCompositeAssembly {
  if (!definition || typeof definition !== 'object') {
    throw new CombinationValidationError(
      'MINIMUM_MEMBERS',
      'A Composite Strategy requires at least 2 unique members',
    );
  }
  if (definition.mode !== 'majority' && definition.mode !== 'weighted') {
    throw new CombinationValidationError(
      'INVALID_MODE',
      'Composite mode must be majority or weighted',
    );
  }
  if (!Array.isArray(definition.members) || definition.members.length < 2) {
    throw new CombinationValidationError(
      'MINIMUM_MEMBERS',
      'A Composite Strategy requires at least 2 unique members',
    );
  }

  const members = definition.members.map((member) => resolveMember(member));
  const runtimeMembers = members.map(({ strategy, weight }) => ({
    strategy,
    versionId: strategyVersionIdentity(strategy),
    weight,
  }));
  const versionIds = new Set<string>();
  for (const member of runtimeMembers) {
    if (versionIds.has(member.versionId)) {
      throw new CombinationValidationError(
        'DUPLICATE_MEMBER',
        `Composite Strategy contains duplicate member version ${member.versionId}`,
      );
    }
    versionIds.add(member.versionId);
  }

  validateApplicability(runtimeMembers);

  const rawWeights = members.map(({ weight }, index) =>
    validateWeight(weight === undefined ? 1 : weight, index),
  );
  const membersWithRawWeights = runtimeMembers
    .map((member, index) => ({
      ...member,
      rawWeight: rawWeights[index]!,
    }))
    .sort((left, right) => left.versionId.localeCompare(right.versionId));
  const sortedRawWeights = membersWithRawWeights.map(
    ({ rawWeight }) => rawWeight,
  );
  const totalWeight = sortedRawWeights.reduce(
    (total, weight) => total + weight,
    0,
  );
  if (!Number.isFinite(totalWeight)) {
    throw new CombinationValidationError(
      'INVALID_WEIGHT',
      'Composite Strategy total weight must be finite',
    );
  }
  if (totalWeight <= 0) {
    throw new CombinationValidationError(
      'ZERO_TOTAL_WEIGHT',
      'Composite Strategy total weight must be greater than zero',
    );
  }
  const normalizedWeights = normalizeWeights(sortedRawWeights, totalWeight);
  for (const [index, weight] of normalizedWeights.entries()) {
    if (!Number.isFinite(weight)) {
      throw new CombinationValidationError(
        'INVALID_WEIGHT',
        `Composite Strategy weight at index ${index} is not finite`,
      );
    }
  }

  const threshold =
    definition.mode === 'weighted' ? resolveThreshold(definition.threshold) : 0;

  const stopLoss = resolveRiskRatio(definition.stopLoss, 'stopLoss');
  const takeProfit = resolveRiskRatio(definition.takeProfit, 'takeProfit');

  const sortedRuntimeMembers = membersWithRawWeights.map((member, index) => ({
    strategy: member.strategy,
    versionId: member.versionId,
    weight: normalizedWeights[index]!,
  }));
  const normalizedMembers = sortedRuntimeMembers.map((member) => ({
    strategyId: member.strategy.id,
    params: toSerializableParams(member.strategy),
    versionId: member.versionId,
    weight: member.weight,
  }));

  return {
    definition: {
      members: normalizedMembers,
      mode: definition.mode,
      threshold,
      stopLoss,
      takeProfit,
    },
    runtimeMembers: sortedRuntimeMembers,
  };
}

function resolveMember(member: CompositeMember): {
  strategy: Strategy;
  weight: number | undefined;
} {
  if (isStrategy(member)) {
    return { strategy: member, weight: undefined };
  }
  if (
    member !== null &&
    typeof member === 'object' &&
    isStrategy(member.strategy)
  ) {
    return { strategy: member.strategy, weight: member.weight };
  }
  throw new CombinationValidationError(
    'INVALID_MEMBER',
    'Each Composite Strategy member must be a Strategy Version',
  );
}

function isStrategy(value: unknown): value is Strategy {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<Strategy>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.requiredHistory === 'number' &&
    Number.isFinite(candidate.requiredHistory) &&
    candidate.requiredHistory >= 0 &&
    typeof candidate.analyze === 'function'
  );
}

function validateWeight(weight: number, index: number): number {
  if (!Number.isFinite(weight) || weight < 0) {
    throw new CombinationValidationError(
      'INVALID_WEIGHT',
      `Composite Strategy weight at index ${index} must be finite and non-negative`,
    );
  }
  return weight;
}

function normalizeWeights(
  rawWeights: readonly number[],
  totalWeight: number,
): number[] {
  const normalized = rawWeights.map((weight) => weight / totalWeight);
  const total = normalized.reduce((sum, weight) => sum + weight, 0);
  if (total !== 1) {
    const adjustmentIndex =
      total > 1 ? indexOfLargest(normalized) : normalized.length - 1;
    const remainder = normalized.reduce(
      (sum, weight, index) => (index === adjustmentIndex ? sum : sum + weight),
      0,
    );
    const adjustedWeight = 1 - remainder;
    if (!Number.isFinite(adjustedWeight) || adjustedWeight < 0) {
      throw new CombinationValidationError(
        'INVALID_WEIGHT',
        'Composite Strategy normalization produced an invalid weight',
      );
    }
    normalized[adjustmentIndex] = adjustedWeight;
  }
  return normalized;
}

function indexOfLargest(values: readonly number[]): number {
  return values.reduce(
    (largestIndex, value, index) =>
      value > values[largestIndex]! ? index : largestIndex,
    0,
  );
}

function resolveThreshold(threshold: number | undefined): number {
  const resolved =
    threshold === undefined ? DEFAULT_COMPOSITE_THRESHOLD : threshold;
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > 1) {
    throw new CombinationValidationError(
      'INVALID_THRESHOLD',
      'Composite Strategy threshold must be finite and within [0, 1]',
    );
  }
  return resolved;
}

function resolveRiskRatio(
  value: number | undefined,
  name: 'stopLoss' | 'takeProfit',
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new CombinationValidationError(
      'INVALID_THRESHOLD',
      `Composite Strategy ${name} must be finite and within [0, 1)`,
    );
  }
  return value;
}

function majoritySignal(signals: readonly Signal[]): Signal {
  const buyCount = signals.filter(({ action }) => action === 'BUY').length;
  const sellCount = signals.filter(({ action }) => action === 'SELL').length;
  const memberCount = signals.length;

  if (buyCount > memberCount / 2) {
    return { action: 'BUY', strength: buyCount / memberCount };
  }
  if (sellCount > memberCount / 2) {
    return { action: 'SELL', strength: sellCount / memberCount };
  }
  return { action: 'HOLD', strength: 0 };
}

function weightedSignal(
  signals: readonly Signal[],
  members: readonly CompositeRuntimeMember[],
  threshold: number,
): Signal {
  const score = signals.reduce((total, signal, index) => {
    const strength = resolveSignalStrength(signal, index);
    const signedAction = signedActionValue(signal.action, index);
    return total + members[index]!.weight * signedAction * strength;
  }, 0);

  if (score > threshold) {
    return { action: 'BUY', strength: Math.abs(score) };
  }
  if (score < -threshold) {
    return { action: 'SELL', strength: Math.abs(score) };
  }
  return { action: 'HOLD', strength: 0 };
}

function resolveSignalStrength(signal: Signal, index: number): number {
  const strength = signal.strength === undefined ? 1 : signal.strength;
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new CombinationEvaluationError(
      `Composite member at index ${index} returned a strength outside [0, 1]`,
    );
  }
  return strength;
}

function signedActionValue(action: SignalAction, index: number): number {
  if (action === 'BUY') return 1;
  if (action === 'SELL') return -1;
  if (action === 'HOLD') return 0;
  throw new CombinationEvaluationError(
    `Composite member at index ${index} returned an unsupported action`,
  );
}

function mergeIndicators(
  signals: readonly Signal[],
  members: readonly CompositeRuntimeMember[],
): Record<string, number> {
  const occurrences = new Map<string, number>();
  for (const signal of signals) {
    for (const [name, value] of Object.entries(signal.indicators ?? {})) {
      if (!Number.isFinite(value)) continue;
      occurrences.set(name, (occurrences.get(name) ?? 0) + 1);
    }
  }

  const merged: Record<string, number> = {};
  for (const [index, signal] of signals.entries()) {
    for (const [name, value] of Object.entries(signal.indicators ?? {})) {
      if (!Number.isFinite(value)) continue;
      const key =
        occurrences.get(name) === 1
          ? name
          : `${members[index]!.versionId}:${name}`;
      merged[key] = value;
    }
  }
  return merged;
}

function validateApplicability(
  members: readonly { strategy: Strategy }[],
): void {
  const declarations = members
    .map(({ strategy }) => readRuleApplicability(strategy))
    .filter((declaration) => declaration !== undefined);
  const timeframes = new Set(
    declarations
      .map((declaration) => declaration.timeframe)
      .filter((timeframe): timeframe is string => timeframe !== undefined),
  );
  if (timeframes.size > 1) {
    throw new CombinationValidationError(
      'CONFLICTING_TIMEFRAMES',
      'Composite Strategy members declare conflicting timeframes',
    );
  }

  const applicabilityValues = declarations
    .map((declaration) => declaration.applicability)
    .filter((applicability) => applicability !== undefined)
    .map((applicability) => canonicalizeApplicability(applicability));
  if (applicabilityValues.length > 1 && new Set(applicabilityValues).size > 1) {
    throw new CombinationValidationError(
      'CONFLICTING_APPLICABILITY',
      'Composite Strategy members declare conflicting applicability values',
    );
  }
}

export function readRuleApplicability(
  strategy: Strategy,
): RuleApplicabilityDeclaration | undefined {
  if (strategy.id !== 'rule' || !isRecord(strategy.params)) return undefined;
  const timeframe =
    typeof strategy.params['timeframe'] === 'string'
      ? strategy.params['timeframe']
      : undefined;
  const applicability = strategy.params['applicability'];
  const pairs =
    isRecord(applicability) &&
    (typeof applicability['pairs'] === 'string' ||
      Array.isArray(applicability['pairs']))
      ? applicability['pairs']
      : undefined;
  if (timeframe !== undefined || applicability !== undefined) {
    return {
      ...(timeframe === undefined ? {} : { timeframe }),
      ...(applicability === undefined ? {} : { applicability }),
      ...(pairs === undefined ? {} : { pairs }),
    };
  }
  return undefined;
}

export function assertStrategyApplicable(
  strategy: Strategy,
  pair: Pair,
  timeframe: Timeframe,
): void {
  const declaration = readRuleApplicability(strategy);
  if (declaration === undefined) return;

  if (
    declaration.timeframe !== undefined &&
    declaration.timeframe !== timeframe
  ) {
    throw new Error(
      `Strategy ${strategy.id} only applies to timeframe ${declaration.timeframe}, not ${timeframe}`,
    );
  }
  if (
    declaration.pairs !== undefined &&
    !pairMatchesApplicability(pair, declaration.pairs)
  ) {
    throw new Error(
      `Strategy ${strategy.id} is not applicable to pair ${pair}`,
    );
  }
}

export function assertStrategyBacktestable(strategy: Strategy): void {
  if (strategy.liveOnly === true) {
    throw new Error(
      `Strategy ${strategy.id} is live-only and requires a sentiment snapshot for backtesting`,
    );
  }
}

function pairMatchesApplicability(
  pair: Pair,
  pairs: string | readonly string[],
): boolean {
  const upperPair = pair.toUpperCase();
  if (pairs === 'USDT_ALL') return upperPair.endsWith('USDT');
  if (!Array.isArray(pairs)) return false;
  if (
    !pairs.every(
      (candidate): candidate is string => typeof candidate === 'string',
    )
  ) {
    return false;
  }
  return (
    pairs.length === 0 ||
    pairs.some((candidate) => candidate.toUpperCase() === upperPair)
  );
}

function formatStrategyName(strategy: Strategy): string {
  const type = formatStrategyType(strategy.id);
  const params = isRecord(strategy.params)
    ? Object.entries(strategy.params)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${formatParameter(value)}`)
        .join(',')
    : '';
  return params.length === 0 ? type : `${type}[${params}]`;
}

function formatParameter(value: unknown): string {
  if (typeof value === 'string') return value;
  return canonicalizeValue(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toSerializableParams(
  strategy: Strategy,
): Readonly<Record<string, unknown>> {
  const params = isRecord(strategy.params) ? strategy.params : {};
  return deepFreezeClone(params) as Readonly<Record<string, unknown>>;
}

function deepFreezeClone(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => deepFreezeClone(entry)));
  }
  if (isRecord(value)) {
    const clone = Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        deepFreezeClone(entry),
      ]),
    );
    return Object.freeze(clone);
  }
  return value;
}

function canonicalizeApplicability(value: unknown): string {
  if (!isRecord(value)) return canonicalizeValue(value);
  const pairs = value['pairs'];
  if (
    !Array.isArray(pairs) ||
    !pairs.every((pair): pair is string => typeof pair === 'string')
  ) {
    return canonicalizeValue(value);
  }
  return canonicalizeValue({
    ...value,
    pairs: pairs.map((pair) => pair.toUpperCase()).sort(),
  });
}
