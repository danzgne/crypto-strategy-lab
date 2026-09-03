import {
  type Signal,
  type Strategy,
  type StrategyContext,
  type StrategyFactory,
  type StrategyParamsSchema,
} from '@crypto-strategy-lab/shared';

import { StrategyImplementationRegistry } from '../implementationVersion';
import { StrategyRegistry } from '../registry';
import { resolveRiskParams } from './utils';

export const SMC_STRATEGY_ID = 'smc';

export interface SMCParams {
  n?: number;
  tolerance?: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface ResolvedSMCParams {
  n: number;
  tolerance: number;
  stopLoss?: number;
  takeProfit?: number;
}

export const SMC_PARAMS_SCHEMA: StrategyParamsSchema = {
  type: 'object',
  properties: {
    n: {
      type: 'integer',
      default: 10,
      minimum: 2,
      description: 'Swing lookback N',
    },
    tolerance: {
      type: 'number',
      default: 0.005,
      minimum: 0.0001,
      description: 'Retest tolerance percentage',
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

export class SMCStrategy implements Strategy<ResolvedSMCParams> {
  public static readonly paramsSchema = SMC_PARAMS_SCHEMA;

  public readonly id = SMC_STRATEGY_ID;
  public readonly params: Readonly<ResolvedSMCParams>;
  public readonly requiredHistory: number;

  public constructor(params: SMCParams = {}) {
    const n = params.n ?? 10;
    const tolerance = params.tolerance ?? 0.005;

    if (!Number.isInteger(n) || n < 2) {
      throw new Error('SMC N must be an integer >= 2');
    }
    if (tolerance <= 0) {
      throw new Error('SMC tolerance must be positive');
    }

    const resolved: ResolvedSMCParams = { n, tolerance };
    resolveRiskParams(params, resolved, 'SMC');

    this.params = resolved;
    // Need at least 2N+1 to find a swing, plus some history to find a break
    this.requiredHistory = n * 3;
  }

  public analyze(context: StrategyContext): Signal {
    const candles = context.candles;
    if (candles.length < this.requiredHistory) {
      return { action: 'HOLD' as const };
    }

    const { n, tolerance } = this.params;
    let latestSwingHigh: number | null = null;
    let latestSwingHighIndex: number | null = null;
    let latestSwingLow: number | null = null;
    let latestSwingLowIndex: number | null = null;

    // Order block: { lower: number, upper: number } price range
    let bullishOB: { lower: number; upper: number } | null = null;
    let bearishOB: { lower: number; upper: number } | null = null;

    // We only care if the *current* candle is the FIRST retest.
    // So we need to track if it has been retested before the current candle.
    let bullishOBRetested = false;
    let bearishOBRetested = false;

    // Traverse from left to right up to the previous candle
    for (let i = n; i < candles.length - 1; i++) {
      // 1. Check if candles[i-n] was a swing high/low (since it now has N right candles)
      const checkIndex = i - n;
      if (checkIndex >= n) {
        let isSH = true;
        let isSL = true;
        const candleHigh = candles[checkIndex]!.high;
        const candleLow = candles[checkIndex]!.low;

        for (let j = checkIndex - n; j <= checkIndex + n; j++) {
          if (j === checkIndex) continue;
          if (candles[j]!.high > candleHigh) isSH = false;
          if (candles[j]!.low < candleLow) isSL = false;
        }

        if (isSH) {
          latestSwingHigh = candleHigh;
          latestSwingHighIndex = checkIndex;
        }
        if (isSL) {
          latestSwingLow = candleLow;
          latestSwingLowIndex = checkIndex;
        }
      }

      const currentClose = candles[i]!.close;

      if (latestSwingHigh !== null && currentClose > latestSwingHigh) {
        const limitIndex = latestSwingLowIndex ?? 0;
        for (let k = i - 1; k >= limitIndex; k--) {
          if (candles[k]!.open > candles[k]!.close) {
            bullishOB = { lower: candles[k]!.close, upper: candles[k]!.open };
            bullishOBRetested = false;
            break;
          }
        }
        latestSwingHigh = null;
      }

      if (latestSwingLow !== null && currentClose < latestSwingLow) {
        const limitIndex = latestSwingHighIndex ?? 0;
        for (let k = i - 1; k >= limitIndex; k--) {
          if (candles[k]!.close > candles[k]!.open) {
            bearishOB = { lower: candles[k]!.open, upper: candles[k]!.close };
            bearishOBRetested = false;
            break;
          }
        }
        latestSwingLow = null;
      }

      if (bullishOB && !bullishOBRetested) {
        const candleLow = candles[i]!.low;
        const toleranceValue = bullishOB.upper * tolerance;
        if (candleLow <= bullishOB.upper + toleranceValue) {
          bullishOBRetested = true;
        }
      }
      if (bearishOB && !bearishOBRetested) {
        const candleHigh = candles[i]!.high;
        const toleranceValue = bearishOB.lower * tolerance;
        if (candleHigh >= bearishOB.lower - toleranceValue) {
          bearishOBRetested = true;
        }
      }
    }

    const currentCandle = candles[candles.length - 1]!;
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    const indicators: Record<string, number> = {};

    if (bullishOB) {
      indicators['BULLISH_OB_LOWER'] = bullishOB.lower;
      indicators['BULLISH_OB_UPPER'] = bullishOB.upper;
    }
    if (bearishOB) {
      indicators['BEARISH_OB_LOWER'] = bearishOB.lower;
      indicators['BEARISH_OB_UPPER'] = bearishOB.upper;
    }

    if (bullishOB && !bullishOBRetested) {
      const toleranceValue = bullishOB.upper * tolerance;
      if (currentCandle.low <= bullishOB.upper + toleranceValue) {
        action = 'BUY';
      }
    } else if (bearishOB && !bearishOBRetested) {
      const toleranceValue = bearishOB.lower * tolerance;
      if (currentCandle.high >= bearishOB.lower - toleranceValue) {
        action = 'SELL';
      }
    }

    return { action, indicators };
  }
}

const createSMCStrategy: StrategyFactory = Object.assign(
  (params?: unknown) => new SMCStrategy(params as SMCParams | undefined),
  { paramsSchema: SMCStrategy.paramsSchema },
);

StrategyRegistry.register(SMC_STRATEGY_ID, createSMCStrategy);
StrategyImplementationRegistry.register(SMC_STRATEGY_ID, 'smc-v1');
