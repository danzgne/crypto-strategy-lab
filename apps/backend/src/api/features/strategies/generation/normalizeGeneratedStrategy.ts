import type {
  RuleApplicability,
  RuleCondition,
  RuleIndicatorDeclaration,
  RuleRiskManagement,
  RuleStrategyParams,
} from '@crypto-strategy-lab/shared';

import type {
  GenerationWireResponse,
  WireCondition,
  WireIndicator,
} from './wireSchema';

export interface NormalizedGeneratedStrategy {
  name: string;
  description: string;
  tags: string[];
  params: RuleStrategyParams;
  unsupportedRequests: string[];
}

export function normalizeGeneratedStrategy(
  wire: GenerationWireResponse,
): NormalizedGeneratedStrategy {
  const riskManagement = normalizeRiskManagement(wire.riskManagement);
  const applicability = normalizeApplicability(wire.applicability);

  return {
    name: wire.name,
    description: wire.description,
    tags: [...wire.tags],
    unsupportedRequests: [...wire.unsupportedRequests],
    params: {
      indicators: wire.indicators.map(normalizeIndicator),
      conditions: {
        long: wire.conditions.long.map(normalizeCondition),
        short: wire.conditions.short.map(normalizeCondition),
      },
      timeframe: wire.timeframe as RuleStrategyParams['timeframe'],
      ...(riskManagement === undefined ? {} : { riskManagement }),
      ...(applicability === undefined ? {} : { applicability }),
    },
  };
}

function normalizeCondition(condition: WireCondition): RuleCondition {
  const { indicator, operator, value, indicatorRef } = condition;
  if (indicatorRef !== null) return { indicator, operator, indicatorRef };
  if (value !== null) return { indicator, operator, value };
  return { indicator, operator };
}

function normalizeIndicator(
  indicator: WireIndicator,
): RuleIndicatorDeclaration {
  const as = indicator.as !== null ? { as: indicator.as } : {};
  switch (indicator.name) {
    case 'RSI':
      return {
        name: 'RSI',
        ...as,
        ...(indicator.period !== null ? { period: indicator.period } : {}),
      };
    case 'SMA':
      return {
        name: 'SMA',
        ...as,
        ...(indicator.period !== null ? { period: indicator.period } : {}),
      };
    case 'BollingerBands':
      return {
        name: 'BollingerBands',
        ...as,
        ...(indicator.period !== null ? { period: indicator.period } : {}),
        ...(indicator.stdDev !== null ? { stdDev: indicator.stdDev } : {}),
      };
  }
}

function normalizeRiskManagement(
  wire: GenerationWireResponse['riskManagement'],
): RuleRiskManagement | undefined {
  if (wire === null) return undefined;
  const stopLoss = wire.stopLoss !== null ? { ...wire.stopLoss } : undefined;
  const takeProfit =
    wire.takeProfit !== null ? { ...wire.takeProfit } : undefined;
  if (stopLoss === undefined && takeProfit === undefined) return undefined;
  return {
    ...(stopLoss === undefined ? {} : { stopLoss }),
    ...(takeProfit === undefined ? {} : { takeProfit }),
  };
}

function normalizeApplicability(
  wire: GenerationWireResponse['applicability'],
): RuleApplicability | undefined {
  if (wire === null) return undefined;
  if (wire.pairsMode === 'USDT_ALL') return { pairs: 'USDT_ALL' };
  if (wire.customPairs !== null && wire.customPairs.length > 0) {
    return { pairs: wire.customPairs };
  }
  return undefined;
}
