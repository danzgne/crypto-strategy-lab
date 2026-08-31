import {
  type Signal,
  type Strategy,
  type StrategyContext,
  type StrategyFactory,
  type StrategyParamsSchema,
} from '@crypto-strategy-lab/shared';

import { StrategyRegistry } from '../registry';
import {
  evaluateRule,
  requiredHistoryForRule,
  resolveRuleStrategyParams,
  type ResolvedRuleStrategyParams,
} from './ruleEvaluation';

export const RULE_STRATEGY_ID = 'rule';

export const RULE_PARAMS_SCHEMA: StrategyParamsSchema = {
  type: 'object',
  properties: {
    indicators: {
      type: 'array',
      description:
        'Declared indicators, each addressable by name from a Condition',
    },
    conditions: {
      type: 'object',
      description: 'Flat AND condition lists for the long and short directions',
    },
    riskManagement: {
      type: 'object',
      description: 'Optional percent-based stopLoss/takeProfit',
    },
    timeframe: {
      type: 'string',
      description: 'The Timeframe this strategy is applicable to',
    },
    applicability: {
      type: 'object',
      description: 'Optional permitted-pairs restriction',
    },
  },
  required: ['indicators', 'conditions', 'timeframe'],
};

export class RuleStrategy implements Strategy<ResolvedRuleStrategyParams> {
  public static readonly paramsSchema = RULE_PARAMS_SCHEMA;

  public readonly id = RULE_STRATEGY_ID;

  public readonly params: Readonly<ResolvedRuleStrategyParams>;

  public readonly requiredHistory: number;

  public constructor(params: unknown = {}) {
    this.params = resolveRuleStrategyParams(params);
    this.requiredHistory = requiredHistoryForRule(this.params);
  }

  public analyze(context: StrategyContext): Signal {
    return evaluateRule(this.params, context);
  }
}

const createRuleStrategy: StrategyFactory = Object.assign(
  (params?: unknown) => new RuleStrategy(params),
  { paramsSchema: RuleStrategy.paramsSchema },
);

StrategyRegistry.register(RULE_STRATEGY_ID, createRuleStrategy);

export function isRuleStrategy(strategy: Strategy): strategy is RuleStrategy {
  return strategy.id === RULE_STRATEGY_ID;
}
