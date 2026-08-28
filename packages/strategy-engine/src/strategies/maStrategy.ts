import {
  simpleMovingAverage,
  type Signal,
  type Strategy,
  type StrategyContext,
  type StrategyFactory,
  type StrategyParamsSchema,
} from '@crypto-strategy-lab/shared';

import { StrategyRegistry } from '../registry';
import { resolveRiskParams } from './utils';

export const MA_STRATEGY_ID = 'ma';

export interface MAParams {
  fast?: number;
  slow?: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface ResolvedMAParams {
  fast: number;
  slow: number;
  stopLoss?: number;
  takeProfit?: number;
}

export const MA_PARAMS_SCHEMA: StrategyParamsSchema = {
  type: 'object',
  properties: {
    fast: {
      type: 'integer',
      default: 20,
      minimum: 1,
      description: 'Fast SMA period',
    },
    slow: {
      type: 'integer',
      default: 50,
      minimum: 2,
      description: 'Slow SMA period',
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

export class MAStrategy implements Strategy<ResolvedMAParams> {
  public static readonly paramsSchema = MA_PARAMS_SCHEMA;

  public readonly id = MA_STRATEGY_ID;

  public readonly params: Readonly<ResolvedMAParams>;

  public readonly requiredHistory: number;

  public constructor(params: MAParams = {}) {
    const fast = params.fast ?? 20;
    const slow = params.slow ?? 50;
    validatePeriod('fast', fast);
    validatePeriod('slow', slow);
    if (fast >= slow) {
      throw new Error('MA fast period must be less than slow period');
    }

    const resolved: ResolvedMAParams = { fast, slow };
    resolveRiskParams(params, resolved, 'MA');

    this.params = resolved;
    this.requiredHistory = slow + 1;
  }

  public analyze(context: StrategyContext): Signal {
    const currentCandles = context.candles;
    if (currentCandles.length < this.requiredHistory) {
      return { action: 'HOLD' as const };
    }

    const previousCandles = currentCandles.slice(0, -1);
    const currentFast = simpleMovingAverage(
      currentCandles.map((candle) => candle.close),
      this.params.fast,
    );
    const currentSlow = simpleMovingAverage(
      currentCandles.map((candle) => candle.close),
      this.params.slow,
    );
    const previousFast = simpleMovingAverage(
      previousCandles.map((candle) => candle.close),
      this.params.fast,
    );
    const previousSlow = simpleMovingAverage(
      previousCandles.map((candle) => candle.close),
      this.params.slow,
    );

    if (
      currentFast === undefined ||
      currentSlow === undefined ||
      previousFast === undefined ||
      previousSlow === undefined
    ) {
      return { action: 'HOLD' as const };
    }

    const indicators = {
      [`MA_${this.params.fast}`]: currentFast,
      [`MA_${this.params.slow}`]: currentSlow,
    };
    const action =
      previousFast <= previousSlow && currentFast > currentSlow
        ? 'BUY'
        : previousFast >= previousSlow && currentFast < currentSlow
          ? 'SELL'
          : 'HOLD';

    return { action, indicators } as const;
  }
}

const createMAStrategy: StrategyFactory = Object.assign(
  (params?: unknown) => new MAStrategy(params as MAParams | undefined),
  { paramsSchema: MAStrategy.paramsSchema },
);

StrategyRegistry.register(MA_STRATEGY_ID, createMAStrategy);

function validatePeriod(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`MA ${name} period must be a positive integer`);
  }
}
