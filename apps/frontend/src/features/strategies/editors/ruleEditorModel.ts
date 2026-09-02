import type { Timeframe } from '@crypto-strategy-lab/shared';
import {
  CLOSE_REFERENCE,
  type RuleCondition,
  type RuleConditionDirections,
  type RuleIndicatorDeclaration,
  type RuleIndicatorName,
  type RuleOperator,
  type RulePercentAmount,
  type RuleRiskManagement,
  type RuleStrategyParams,
} from '@crypto-strategy-lab/shared/strategy';

export const RULE_TIMEFRAMES: readonly Timeframe[] = [
  '1m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
];

export const RULE_INDICATOR_NAMES: readonly RuleIndicatorName[] = [
  'RSI',
  'BollingerBands',
  'SMA',
];

export const RULE_OPERATORS: readonly RuleOperator[] = ['<', '>', '<=', '>='];

const DEFAULT_BASE: Record<RuleIndicatorName, string> = {
  RSI: 'RSI',
  SMA: 'SMA',
  BollingerBands: 'BB',
};

export function indicatorBase(declaration: RuleIndicatorDeclaration): string {
  return declaration.as ?? DEFAULT_BASE[declaration.name];
}

export function indicatorReferences(
  declaration: RuleIndicatorDeclaration,
): string[] {
  const base = indicatorBase(declaration);
  return declaration.name === 'BollingerBands'
    ? [`${base}_Upper`, `${base}_Lower`, `${base}_Middle`]
    : [base];
}

export function availableReferences(
  indicators: readonly RuleIndicatorDeclaration[],
): string[] {
  const refs = new Set<string>([CLOSE_REFERENCE]);
  for (const declaration of indicators) {
    for (const ref of indicatorReferences(declaration)) refs.add(ref);
  }
  return [...refs];
}

export function emptyRuleParams(
  timeframe: Timeframe = '1h',
): RuleStrategyParams {
  return {
    indicators: [],
    conditions: { long: [], short: [] },
    timeframe,
  };
}

export function isRuleStrategyParams(
  value: unknown,
): value is RuleStrategyParams {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Partial<RuleStrategyParams>).indicators) &&
    typeof (value as Partial<RuleStrategyParams>).conditions === 'object'
  );
}

export function coerceRuleParams(value: unknown): RuleStrategyParams {
  return isRuleStrategyParams(value) ? value : emptyRuleParams();
}

export function setTimeframe(
  params: RuleStrategyParams,
  timeframe: Timeframe,
): RuleStrategyParams {
  return { ...params, timeframe };
}

export function addIndicator(
  params: RuleStrategyParams,
  name: RuleIndicatorName,
): RuleStrategyParams {
  const declaration: RuleIndicatorDeclaration =
    name === 'BollingerBands'
      ? { name, period: 20, stdDev: 2 }
      : { name, period: name === 'RSI' ? 14 : 20 };
  return { ...params, indicators: [...params.indicators, declaration] };
}

export function removeIndicator(
  params: RuleStrategyParams,
  index: number,
): RuleStrategyParams {
  const removed = params.indicators[index];
  if (removed === undefined) return params;
  const removedRefs = new Set(indicatorReferences(removed));
  const dropsCondition = (condition: RuleCondition): boolean =>
    !removedRefs.has(condition.indicator) &&
    (condition.indicatorRef === undefined ||
      !removedRefs.has(condition.indicatorRef));
  return {
    ...params,
    indicators: params.indicators.filter((_, i) => i !== index),
    conditions: {
      long: params.conditions.long.filter(dropsCondition),
      short: params.conditions.short.filter(dropsCondition),
    },
  };
}

export interface IndicatorFieldUpdate {
  as?: string | undefined;
  period?: number | undefined;
  stdDev?: number | undefined;
}

export function updateIndicatorField(
  params: RuleStrategyParams,
  index: number,
  update: IndicatorFieldUpdate,
): RuleStrategyParams {
  const declaration = params.indicators[index];
  if (declaration === undefined) return params;
  const nextDeclaration = {
    ...declaration,
    ...update,
  } as RuleIndicatorDeclaration;
  const oldRefs = indicatorReferences(declaration);
  const newRefs = indicatorReferences(nextDeclaration);
  const renameMap = new Map(oldRefs.map((ref, i) => [ref, newRefs[i]!]));
  const rename = (condition: RuleCondition): RuleCondition => ({
    ...condition,
    indicator: renameMap.get(condition.indicator) ?? condition.indicator,
    ...(condition.indicatorRef === undefined
      ? {}
      : {
          indicatorRef:
            renameMap.get(condition.indicatorRef) ?? condition.indicatorRef,
        }),
  });
  return {
    ...params,
    indicators: params.indicators.map((declarationEntry, i) =>
      i === index ? nextDeclaration : declarationEntry,
    ),
    conditions: {
      long: params.conditions.long.map(rename),
      short: params.conditions.short.map(rename),
    },
  };
}

type ConditionDirection = keyof RuleConditionDirections;

export function addCondition(
  params: RuleStrategyParams,
  direction: ConditionDirection,
  firstReference: string,
): RuleStrategyParams {
  const condition: RuleCondition = {
    indicator: firstReference,
    operator: '<',
    value: 0,
  };
  return {
    ...params,
    conditions: {
      ...params.conditions,
      [direction]: [...params.conditions[direction], condition],
    },
  };
}

export function removeCondition(
  params: RuleStrategyParams,
  direction: ConditionDirection,
  index: number,
): RuleStrategyParams {
  return {
    ...params,
    conditions: {
      ...params.conditions,
      [direction]: params.conditions[direction].filter((_, i) => i !== index),
    },
  };
}

export interface ConditionFieldUpdate {
  indicator?: string | undefined;
  operator?: RuleOperator | undefined;
  value?: number | undefined;
  indicatorRef?: string | undefined;
}

export function updateCondition(
  params: RuleStrategyParams,
  direction: ConditionDirection,
  index: number,
  update: ConditionFieldUpdate,
): RuleStrategyParams {
  return {
    ...params,
    conditions: {
      ...params.conditions,
      [direction]: params.conditions[direction].map((condition, i) =>
        i === index ? { ...condition, ...update } : condition,
      ),
    },
  };
}

export function setRiskManagement(
  params: RuleStrategyParams,
  riskManagement: RuleRiskManagement | undefined,
): RuleStrategyParams {
  if (riskManagement === undefined) {
    const rest = { ...params };
    delete rest.riskManagement;
    return rest;
  }
  return { ...params, riskManagement };
}

export function percentAmount(value: number): RulePercentAmount {
  return { type: 'percent', value };
}

export function setApplicabilityMode(
  params: RuleStrategyParams,
  mode: 'any' | 'usdtAll' | 'custom',
  customPairs: readonly string[] = [],
): RuleStrategyParams {
  if (mode === 'any') {
    const rest = { ...params };
    delete rest.applicability;
    return rest;
  }
  if (mode === 'usdtAll') {
    return { ...params, applicability: { pairs: 'USDT_ALL' } };
  }
  return { ...params, applicability: { pairs: customPairs } };
}

export function applicabilityMode(
  params: RuleStrategyParams,
): 'any' | 'usdtAll' | 'custom' {
  const pairs = params.applicability?.pairs;
  if (pairs === undefined) return 'any';
  if (pairs === 'USDT_ALL') return 'usdtAll';
  return 'custom';
}
