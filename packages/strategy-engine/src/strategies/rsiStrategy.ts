import {
  calculateRSI,
  type Signal,
  type Strategy,
  type StrategyContext,
  type StrategyFactory,
  type StrategyParamsSchema,
} from '@crypto-strategy-lab/shared';

import { StrategyRegistry } from '../registry';

export const RSI_STRATEGY_ID = 'rsi';

export interface RSIParams {
  period?: number;
  oversold?: number;
  overbought?: number;
}

interface ResolvedRSIParams {
  period: number;
  oversold: number;
  overbought: number;
}

export const RSI_PARAMS_SCHEMA: StrategyParamsSchema = {
  type: 'object',
  properties: {
    period: {
      type: 'integer',
      default: 14,
      minimum: 2,
      description: 'RSI lookback period',
    },
    oversold: {
      type: 'integer',
      default: 30,
      minimum: 1,
      maximum: 99,
      description: 'RSI oversold threshold',
    },
    overbought: {
      type: 'integer',
      default: 70,
      minimum: 2,
      maximum: 99,
      description: 'RSI overbought threshold',
    },
  },
};

export class RSIStrategy implements Strategy<ResolvedRSIParams> {
  public static readonly paramsSchema = RSI_PARAMS_SCHEMA;

  public readonly id = RSI_STRATEGY_ID;
  public readonly params: Readonly<ResolvedRSIParams>;
  public readonly requiredHistory: number;

  public constructor(params: RSIParams = {}) {
    const period = params.period ?? 14;
    const oversold = params.oversold ?? 30;
    const overbought = params.overbought ?? 70;

    if (!Number.isInteger(period) || period < 2) {
      throw new Error('RSI period must be an integer >= 2');
    }
    if (oversold >= overbought) {
      throw new Error('RSI oversold must be less than overbought');
    }

    this.params = { period, oversold, overbought };
    this.requiredHistory = period + 1;
  }

  public analyze(context: StrategyContext): Signal {
    const currentCandles = context.candles;
    if (currentCandles.length < this.requiredHistory) {
      return { action: 'HOLD' as const };
    }

    const currentCloses = currentCandles.map((c) => c.close);
    const previousCloses = currentCloses.slice(0, -1);

    const currentRsi = calculateRSI(currentCloses, this.params.period);
    const previousRsi = calculateRSI(previousCloses, this.params.period);

    if (currentRsi === undefined || previousRsi === undefined) {
      return { action: 'HOLD' as const };
    }

    const indicators = {
      RSI: currentRsi,
    };

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';

    if (previousRsi >= this.params.oversold && currentRsi < this.params.oversold) {
      action = 'BUY';
    } else if (previousRsi <= this.params.overbought && currentRsi > this.params.overbought) {
      action = 'SELL';
    }

    return { action, indicators };
  }
}

const createRSIStrategy: StrategyFactory = Object.assign(
  (params?: unknown) => new RSIStrategy(params as RSIParams | undefined),
  { paramsSchema: RSIStrategy.paramsSchema }
);

StrategyRegistry.register(RSI_STRATEGY_ID, createRSIStrategy);
