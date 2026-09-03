import {
  calculateBollingerBands,
  type Signal,
  type Strategy,
  type StrategyContext,
  type StrategyFactory,
  type StrategyParamsSchema,
} from '@crypto-strategy-lab/shared';

import { StrategyImplementationRegistry } from '../implementationVersion';
import { StrategyRegistry } from '../registry';
import { resolveRiskParams } from './utils';

export const BB_STRATEGY_ID = 'bb';
export const BOLLINGER_STRATEGY_ID = 'bollinger';

export interface BBParams {
  period?: number;
  stdDev?: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface ResolvedBBParams {
  period: number;
  stdDev: number;
  stopLoss?: number;
  takeProfit?: number;
}

export const BB_PARAMS_SCHEMA: StrategyParamsSchema = {
  type: 'object',
  properties: {
    period: {
      type: 'integer',
      default: 20,
      minimum: 2,
      description: 'Bollinger Bands lookback period',
    },
    stdDev: {
      type: 'number',
      default: 2,
      minimum: 0.1,
      description: 'Standard deviation multiplier',
    },
    stopLoss: {
      type: 'number',
      minimum: 0,
      description: 'Optional strategy-level stop loss ratio',
    },
    takeProfit: {
      type: 'number',
      minimum: 0,
      description: 'Optional strategy-level take profit ratio',
    },
  },
};

export class BBStrategy implements Strategy<ResolvedBBParams> {
  public static readonly paramsSchema = BB_PARAMS_SCHEMA;

  public readonly id = BB_STRATEGY_ID;
  public readonly params: Readonly<ResolvedBBParams>;
  public readonly requiredHistory: number;

  public constructor(params: BBParams = {}) {
    const period = params.period ?? 20;
    const stdDev = params.stdDev ?? 2;

    if (!Number.isInteger(period) || period < 2) {
      throw new Error('BB period must be an integer >= 2');
    }
    if (stdDev <= 0) {
      throw new Error('BB stdDev must be positive');
    }

    const resolved: ResolvedBBParams = { period, stdDev };
    resolveRiskParams(params, resolved, 'BB');

    this.params = resolved;
    this.requiredHistory = period + 1;
  }

  public analyze(context: StrategyContext): Signal {
    const currentCandles = context.candles;
    if (currentCandles.length < this.requiredHistory) {
      return { action: 'HOLD' as const };
    }

    const currentCloses = currentCandles.map((c) => c.close);
    const previousCloses = currentCloses.slice(0, -1);

    const currentBB = calculateBollingerBands(
      currentCloses,
      this.params.period,
      this.params.stdDev,
    );
    const previousBB = calculateBollingerBands(
      previousCloses,
      this.params.period,
      this.params.stdDev,
    );

    if (!currentBB || !previousBB) {
      return { action: 'HOLD' as const };
    }

    const indicators = {
      BB_UPPER: currentBB.upper,
      BB_LOWER: currentBB.lower,
      BB_MIDDLE: currentBB.middle,
    };

    const currentClose = currentCloses[currentCloses.length - 1]!;
    const previousClose = previousCloses[previousCloses.length - 1]!;

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';

    if (previousClose >= previousBB.lower && currentClose < currentBB.lower) {
      action = 'BUY';
    } else if (
      previousClose <= previousBB.upper &&
      currentClose > currentBB.upper
    ) {
      action = 'SELL';
    }

    return { action, indicators };
  }
}

const createBBStrategy: StrategyFactory = Object.assign(
  (params?: unknown) => new BBStrategy(params as BBParams | undefined),
  { paramsSchema: BBStrategy.paramsSchema },
);

StrategyRegistry.register(BB_STRATEGY_ID, createBBStrategy);
StrategyRegistry.registerAlias(BOLLINGER_STRATEGY_ID, BB_STRATEGY_ID);
StrategyImplementationRegistry.register(BB_STRATEGY_ID, 'bb-v1');
