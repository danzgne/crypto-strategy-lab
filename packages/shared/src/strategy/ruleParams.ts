import type { Pair, Timeframe } from '../marketData/candle';

export const CLOSE_REFERENCE = 'Close';

export const STRATEGY_PROVENANCES = [
  'USER_PROMPT',
  'WEB_IMPORT',
  'MANUAL',
] as const;

export type StrategyProvenance = (typeof STRATEGY_PROVENANCES)[number];

export function isStrategyProvenance(
  value: unknown,
): value is StrategyProvenance {
  return (
    typeof value === 'string' &&
    STRATEGY_PROVENANCES.includes(value as StrategyProvenance)
  );
}

export type RuleIndicatorName = 'RSI' | 'BollingerBands' | 'SMA';

export interface RSIIndicatorDeclaration {
  name: 'RSI';
  as?: string;
  period?: number;
}

export interface BollingerBandsIndicatorDeclaration {
  name: 'BollingerBands';
  as?: string;
  period?: number;
  stdDev?: number;
}

export interface SMAIndicatorDeclaration {
  name: 'SMA';
  as?: string;
  period?: number;
}

export type RuleIndicatorDeclaration =
  | RSIIndicatorDeclaration
  | BollingerBandsIndicatorDeclaration
  | SMAIndicatorDeclaration;

export type RuleOperator = '<' | '>' | '<=' | '>=';

export interface RuleCondition {
  indicator: string;
  operator: RuleOperator;
  value?: number;
  indicatorRef?: string;
}

export interface RuleConditionDirections {
  long: readonly RuleCondition[];
  short: readonly RuleCondition[];
}

export interface RulePercentAmount {
  type: 'percent';
  value: number;
}

export interface RuleRiskManagement {
  stopLoss?: RulePercentAmount;
  takeProfit?: RulePercentAmount;
}

export type RuleApplicabilityPairs = 'USDT_ALL' | readonly string[];

export interface RuleApplicability {
  pairs?: RuleApplicabilityPairs;
}

export interface RuleStrategyParams {
  indicators: readonly RuleIndicatorDeclaration[];
  conditions: RuleConditionDirections;
  riskManagement?: RuleRiskManagement;
  timeframe: Timeframe;
  applicability?: RuleApplicability;
}

export function renderRuleConditionOperand(condition: RuleCondition): string {
  return condition.indicatorRef ?? String(condition.value);
}

export function renderRuleCondition(condition: RuleCondition): string {
  return `${condition.indicator} ${condition.operator} ${renderRuleConditionOperand(condition)}`;
}

export function renderRuleConditions(
  conditions: readonly RuleCondition[],
): string {
  return conditions.map(renderRuleCondition).join(' AND ');
}

export function pairMatchesRuleApplicability(
  pair: Pair,
  applicability: RuleApplicability | undefined,
): boolean {
  const pairs = applicability?.pairs;
  if (pairs === undefined) return true;
  const upperPair = pair.toUpperCase();
  if (pairs === 'USDT_ALL') return upperPair.endsWith('USDT');
  return pairs.length === 0 || pairs.includes(upperPair);
}
