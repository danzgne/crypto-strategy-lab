import {
  calculateBollingerBands,
  calculateRSI,
  simpleMovingAverage,
  isTimeframe,
  CLOSE_REFERENCE,
  TIMEFRAMES,
  renderRuleConditions,
  type RuleApplicability,
  type RuleCondition,
  type RuleConditionDirections,
  type RuleIndicatorName,
  type RuleRiskManagement,
  type Signal,
  type StrategyContext,
  type Timeframe,
} from '@crypto-strategy-lab/shared';

export interface ResolvedIndicatorDeclaration {
  name: RuleIndicatorName;
  refName: string;
  params: Readonly<Record<string, number>>;
}

export interface ResolvedRuleStrategyParams {
  indicators: readonly ResolvedIndicatorDeclaration[];
  conditions: RuleConditionDirections;
  riskManagement?: RuleRiskManagement;
  timeframe: Timeframe;
  applicability?: RuleApplicability;
  stopLoss?: number;
  takeProfit?: number;
}

interface IndicatorDescriptor {
  defaultBase: string;
  paramKeys: readonly string[];
  resolveParams(
    record: Readonly<Record<string, unknown>>,
  ): Record<string, number>;
  requiredHistory(params: Readonly<Record<string, number>>): number;
  refs(base: string): string[];
  compute(
    params: Readonly<Record<string, number>>,
    closes: number[],
    refs: readonly string[],
  ): Record<string, number | undefined>;
}

const INDICATOR_DESCRIPTORS: Readonly<
  Record<RuleIndicatorName, IndicatorDescriptor>
> = {
  SMA: {
    defaultBase: 'SMA',
    paramKeys: ['period'],
    resolveParams: (record) => ({
      period: resolvePositiveInteger(record, 'period', 20),
    }),
    requiredHistory: ({ period }) => period!,
    refs: (base) => [base],
    compute: ({ period }, closes, [ref]) => ({
      [ref!]: simpleMovingAverage(closes, period!),
    }),
  },
  RSI: {
    defaultBase: 'RSI',
    paramKeys: ['period'],
    resolveParams: (record) => ({
      period: resolvePositiveInteger(record, 'period', 14),
    }),
    requiredHistory: ({ period }) => period! + 1,
    refs: (base) => [base],
    compute: ({ period }, closes, [ref]) => ({
      [ref!]: calculateRSI(closes, period!),
    }),
  },
  BollingerBands: {
    defaultBase: 'BB',
    paramKeys: ['period', 'stdDev'],
    resolveParams: (record) => ({
      period: resolvePositiveInteger(record, 'period', 20),
      stdDev: resolvePositiveNumber(record, 'stdDev', 2),
    }),
    requiredHistory: ({ period }) => period!,
    refs: (base) => [`${base}_Upper`, `${base}_Lower`, `${base}_Middle`],
    compute: ({ period, stdDev }, closes, [upper, lower, middle]) => {
      const bands = calculateBollingerBands(closes, period!, stdDev!);
      return {
        [upper!]: bands?.upper,
        [lower!]: bands?.lower,
        [middle!]: bands?.middle,
      };
    },
  },
};

export function resolveRuleStrategyParams(
  raw: unknown,
): ResolvedRuleStrategyParams {
  const candidate = assertPlainObject(raw, 'RuleStrategy params');
  assertNoUnknownKeys(
    candidate,
    [
      'indicators',
      'conditions',
      'riskManagement',
      'timeframe',
      'applicability',
    ],
    'RuleStrategy params',
  );

  const timeframe = validateTimeframe(candidate['timeframe']);
  const applicability = validateApplicability(candidate['applicability']);
  const indicators = resolveIndicatorDeclarations(candidate['indicators']);
  const knownReferences = collectReferenceNames(indicators);
  const conditions = validateConditions(
    candidate['conditions'],
    knownReferences,
  );

  if (conditions.long.length === 0 && conditions.short.length === 0) {
    throw new Error(
      'RuleStrategy conditions must declare at least one condition in long or short',
    );
  }

  const resolved: ResolvedRuleStrategyParams = {
    indicators,
    conditions,
    timeframe,
    ...(applicability === undefined ? {} : { applicability }),
  };

  const riskManagement = validateRiskManagement(candidate['riskManagement']);
  if (riskManagement !== undefined) {
    resolved.riskManagement = riskManagement;
    if (riskManagement.stopLoss !== undefined) {
      resolved.stopLoss = riskManagement.stopLoss.value / 100;
    }
    if (riskManagement.takeProfit !== undefined) {
      resolved.takeProfit = riskManagement.takeProfit.value / 100;
    }
  }

  return resolved;
}

export function requiredHistoryForRule(
  resolved: ResolvedRuleStrategyParams,
): number {
  const needs =
    resolved.indicators.length === 0
      ? [1]
      : resolved.indicators.map((declaration) =>
          INDICATOR_DESCRIPTORS[declaration.name].requiredHistory(
            declaration.params,
          ),
        );
  return Math.max(...needs) + 1;
}

export function evaluateRule(
  resolved: ResolvedRuleStrategyParams,
  context: StrategyContext,
): Signal {
  const requiredHistory = requiredHistoryForRule(resolved);
  const currentCandles = context.candles;
  if (currentCandles.length < requiredHistory) {
    return { action: 'HOLD' as const };
  }

  const currentCloses = currentCandles.map((candle) => candle.close);
  const previousCloses = currentCloses.slice(0, -1);

  const currentSnapshot = computeSnapshot(resolved.indicators, currentCloses);
  const previousSnapshot = computeSnapshot(resolved.indicators, previousCloses);
  if (
    Object.values(currentSnapshot).some((value) => value === undefined) ||
    Object.values(previousSnapshot).some((value) => value === undefined)
  ) {
    return { action: 'HOLD' as const };
  }

  const currentValues = {
    ...currentSnapshot,
    [CLOSE_REFERENCE]: currentCloses.at(-1),
  };
  const previousValues = {
    ...previousSnapshot,
    [CLOSE_REFERENCE]: previousCloses.at(-1),
  };

  const currentLong = evaluateDirection(
    resolved.conditions.long,
    currentValues,
  );
  const previousLong = evaluateDirection(
    resolved.conditions.long,
    previousValues,
  );
  const currentShort = evaluateDirection(
    resolved.conditions.short,
    currentValues,
  );
  const previousShort = evaluateDirection(
    resolved.conditions.short,
    previousValues,
  );

  const longFired = currentLong && !previousLong;
  const shortFired = currentShort && !previousShort;
  const indicators = indicatorValuesOnly(currentValues);

  if (longFired && shortFired) {
    return {
      action: 'HOLD',
      indicators,
      reason: `long and short both fired: long(${renderRuleConditions(resolved.conditions.long)}) short(${renderRuleConditions(resolved.conditions.short)})`,
    };
  }
  if (longFired) {
    return {
      action: 'BUY',
      indicators,
      reason: renderRuleConditions(resolved.conditions.long),
    };
  }
  if (shortFired) {
    return {
      action: 'SELL',
      indicators,
      reason: renderRuleConditions(resolved.conditions.short),
    };
  }
  return { action: 'HOLD', indicators };
}

function computeSnapshot(
  indicators: readonly ResolvedIndicatorDeclaration[],
  closes: number[],
): Record<string, number | undefined> {
  const snapshot: Record<string, number | undefined> = {};
  for (const declaration of indicators) {
    const descriptor = INDICATOR_DESCRIPTORS[declaration.name];
    const refs = descriptor.refs(declaration.refName);
    Object.assign(
      snapshot,
      descriptor.compute(declaration.params, closes, refs),
    );
  }
  return snapshot;
}

export function evaluateDirection(
  conditions: readonly RuleCondition[],
  values: Readonly<Record<string, number | undefined>>,
): boolean {
  if (conditions.length === 0) return false;
  return conditions.every((condition) => evaluateCondition(condition, values));
}

function evaluateCondition(
  condition: RuleCondition,
  values: Readonly<Record<string, number | undefined>>,
): boolean {
  const left = values[condition.indicator];
  const right =
    condition.indicatorRef === undefined
      ? condition.value
      : values[condition.indicatorRef];
  if (left === undefined || right === undefined) return false;
  switch (condition.operator) {
    case '<':
      return left < right;
    case '>':
      return left > right;
    case '<=':
      return left <= right;
    case '>=':
      return left >= right;
  }
}

function indicatorValuesOnly(
  values: Readonly<Record<string, number | undefined>>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [name, value] of Object.entries(values)) {
    if (name === CLOSE_REFERENCE || value === undefined) continue;
    result[name] = value;
  }
  return result;
}

function resolveIndicatorDeclarations(
  value: unknown,
): ResolvedIndicatorDeclaration[] {
  if (!Array.isArray(value)) {
    throw new Error('RuleStrategy indicators must be an array');
  }
  const resolved = value.map((entry, index) =>
    resolveIndicatorDeclaration(entry, index),
  );
  const seen = new Set<string>();
  for (const declaration of resolved) {
    for (const ref of referenceOutputNames(declaration)) {
      if (seen.has(ref)) {
        throw new Error(
          `Duplicate indicator reference "${ref}"; give one declaration an "as" alias`,
        );
      }
      seen.add(ref);
    }
  }
  return resolved;
}

function resolveIndicatorDeclaration(
  value: unknown,
  index: number,
): ResolvedIndicatorDeclaration {
  const record = assertPlainObject(value, `Indicator at index ${index}`);
  const name = record['name'];
  if (name !== 'SMA' && name !== 'RSI' && name !== 'BollingerBands') {
    throw new Error(
      `Indicator at index ${index} has unknown name "${String(name)}"`,
    );
  }
  const descriptor = INDICATOR_DESCRIPTORS[name];
  assertNoUnknownKeys(
    record,
    ['name', 'as', ...descriptor.paramKeys],
    `Indicator at index ${index}`,
  );

  const as = record['as'];
  if (as !== undefined && (typeof as !== 'string' || as.trim().length === 0)) {
    throw new Error(`Indicator at index ${index} has an invalid "as" alias`);
  }

  return {
    name,
    refName: as ?? descriptor.defaultBase,
    params: descriptor.resolveParams(record),
  };
}

function referenceOutputNames(
  declaration: ResolvedIndicatorDeclaration,
): string[] {
  return INDICATOR_DESCRIPTORS[declaration.name].refs(declaration.refName);
}

function collectReferenceNames(
  indicators: readonly ResolvedIndicatorDeclaration[],
): Set<string> {
  const names = new Set<string>([CLOSE_REFERENCE]);
  for (const declaration of indicators) {
    for (const ref of referenceOutputNames(declaration)) names.add(ref);
  }
  return names;
}

function validateConditions(
  value: unknown,
  knownReferences: ReadonlySet<string>,
): RuleConditionDirections {
  const record = assertPlainObject(value, 'RuleStrategy conditions');
  assertNoUnknownKeys(record, ['long', 'short'], 'RuleStrategy conditions');
  const long = resolveConditionList(record['long'], 'long', knownReferences);
  const short = resolveConditionList(record['short'], 'short', knownReferences);
  return { long, short };
}

function resolveConditionList(
  value: unknown,
  label: string,
  knownReferences: ReadonlySet<string>,
): RuleCondition[] {
  if (!Array.isArray(value)) {
    throw new Error(`RuleStrategy conditions.${label} must be an array`);
  }
  return value.map((entry, index) =>
    resolveCondition(entry, label, index, knownReferences),
  );
}

function resolveCondition(
  value: unknown,
  label: string,
  index: number,
  knownReferences: ReadonlySet<string>,
): RuleCondition {
  const record = assertPlainObject(
    value,
    `RuleStrategy conditions.${label}[${index}]`,
  );
  assertNoUnknownKeys(
    record,
    ['indicator', 'operator', 'value', 'indicatorRef'],
    `RuleStrategy conditions.${label}[${index}]`,
  );

  const indicator = record['indicator'];
  if (typeof indicator !== 'string' || indicator.trim().length === 0) {
    throw new Error(
      `RuleStrategy conditions.${label}[${index}].indicator must be a non-empty string`,
    );
  }
  assertKnownReference(indicator, label, index, 'indicator', knownReferences);

  const operator = record['operator'];
  if (
    operator !== '<' &&
    operator !== '>' &&
    operator !== '<=' &&
    operator !== '>='
  ) {
    throw new Error(
      `RuleStrategy conditions.${label}[${index}].operator must be one of <, >, <=, >=`,
    );
  }

  const hasValue = record['value'] !== undefined;
  const hasIndicatorRef = record['indicatorRef'] !== undefined;
  if (hasValue === hasIndicatorRef) {
    throw new Error(
      `RuleStrategy conditions.${label}[${index}] must set exactly one of "value" or "indicatorRef"`,
    );
  }

  if (hasIndicatorRef) {
    const indicatorRef = record['indicatorRef'];
    if (typeof indicatorRef !== 'string' || indicatorRef.trim().length === 0) {
      throw new Error(
        `RuleStrategy conditions.${label}[${index}].indicatorRef must be a non-empty string`,
      );
    }
    assertKnownReference(
      indicatorRef,
      label,
      index,
      'indicatorRef',
      knownReferences,
    );
    return { indicator, operator, indicatorRef };
  }

  const numericValue = record['value'];
  if (typeof numericValue !== 'number' || !Number.isFinite(numericValue)) {
    throw new Error(
      `RuleStrategy conditions.${label}[${index}].value must be a finite number`,
    );
  }
  return { indicator, operator, value: numericValue };
}

function assertKnownReference(
  name: string,
  label: string,
  index: number,
  field: string,
  known: ReadonlySet<string>,
): void {
  if (!known.has(name)) {
    throw new Error(
      `RuleStrategy conditions.${label}[${index}].${field} references unknown indicator "${name}"`,
    );
  }
}

function validateRiskManagement(
  value: unknown,
): RuleRiskManagement | undefined {
  if (value === undefined) return undefined;
  const record = assertPlainObject(value, 'RuleStrategy riskManagement');
  assertNoUnknownKeys(
    record,
    ['stopLoss', 'takeProfit'],
    'RuleStrategy riskManagement',
  );
  const stopLoss = validatePercentAmount(
    record['stopLoss'],
    'riskManagement.stopLoss',
  );
  const takeProfit = validatePercentAmount(
    record['takeProfit'],
    'riskManagement.takeProfit',
  );
  if (stopLoss === undefined && takeProfit === undefined) return undefined;
  return {
    ...(stopLoss === undefined ? {} : { stopLoss }),
    ...(takeProfit === undefined ? {} : { takeProfit }),
  };
}

function validatePercentAmount(
  value: unknown,
  label: string,
): { type: 'percent'; value: number } | undefined {
  if (value === undefined) return undefined;
  const record = assertPlainObject(value, `RuleStrategy ${label}`);
  assertNoUnknownKeys(record, ['type', 'value'], `RuleStrategy ${label}`);
  if (record['type'] !== 'percent') {
    throw new Error(`RuleStrategy ${label}.type must be "percent"`);
  }
  const amount = record['value'];
  if (typeof amount !== 'number' || !(amount > 0) || !(amount <= 100)) {
    throw new Error(
      `RuleStrategy ${label}.value must satisfy 0 < value <= 100`,
    );
  }
  return { type: 'percent', value: amount };
}

function validateApplicability(value: unknown): RuleApplicability | undefined {
  if (value === undefined) return undefined;
  const record = assertPlainObject(value, 'RuleStrategy applicability');
  assertNoUnknownKeys(record, ['pairs'], 'RuleStrategy applicability');
  const pairs = record['pairs'];
  if (pairs === undefined) return {};
  if (pairs === 'USDT_ALL') return { pairs: 'USDT_ALL' };
  if (Array.isArray(pairs) && pairs.every((pair) => typeof pair === 'string')) {
    return { pairs: pairs.map((pair: string) => pair.toUpperCase()) };
  }
  throw new Error(
    'RuleStrategy applicability.pairs must be "USDT_ALL" or an array of pair strings',
  );
}

function validateTimeframe(value: unknown): Timeframe {
  if (!isTimeframe(value)) {
    throw new Error(
      `RuleStrategy timeframe must be one of ${TIMEFRAMES.join(', ')}`,
    );
  }
  return value;
}

function resolvePositiveInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  defaultValue: number,
): number {
  const raw = record[key];
  const value = raw === undefined ? defaultValue : raw;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 2) {
    throw new Error(`Indicator ${key} must be an integer >= 2`);
  }
  return value;
}

function resolvePositiveNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
  defaultValue: number,
): number {
  const raw = record[key];
  const value = raw === undefined ? defaultValue : raw;
  if (typeof value !== 'number' || !(value > 0)) {
    throw new Error(`Indicator ${key} must be a positive number`);
  }
  return value;
}

function assertPlainObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertNoUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  allowedKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} has an unexpected key "${key}"`);
    }
  }
}
