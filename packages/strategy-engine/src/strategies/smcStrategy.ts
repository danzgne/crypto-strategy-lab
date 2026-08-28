import {
  type Signal,
  type Strategy,
  type StrategyContext,
  type StrategyFactory,
  type StrategyParamsSchema,
} from '@crypto-strategy-lab/shared';

import { StrategyRegistry } from '../registry';

export const SMC_STRATEGY_ID = 'smc';

export interface SMCParams {
  n?: number;
  tolerance?: number;
}

interface ResolvedSMCParams {
  n: number;
  tolerance: number;
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

    this.params = { n, tolerance };
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
    let latestSwingLow: number | null = null;
    
    // Order block: [low, high] price range
    let bullishOB: [number, number] | null = null;
    let bearishOB: [number, number] | null = null;
    
    // We only care if the *current* candle is the FIRST retest.
    // So we need to track if it has been retested before the current candle.
    let bullishOBRetested = false;
    let bearishOBRetested = false;

    // Traverse from left to right up to the previous candle
    for (let i = n; i < candles.length - 1; i++) {
      // 1. Check if candles[i-n] was a swing high/low (since it now has N right candles)
      const checkIdx = i - n;
      if (checkIdx >= n) {
        let isSH = true;
        let isSL = true;
        const cHigh = candles[checkIdx]!.high;
        const cLow = candles[checkIdx]!.low;

        for (let j = checkIdx - n; j <= checkIdx + n; j++) {
          if (j === checkIdx) continue;
          if (candles[j]!.high > cHigh) isSH = false;
          if (candles[j]!.low < cLow) isSL = false;
        }

        if (isSH) latestSwingHigh = cHigh;
        if (isSL) latestSwingLow = cLow;
      }

      const currentClose = candles[i]!.close;
      
      if (latestSwingHigh !== null && currentClose > latestSwingHigh) {
        let foundOB = false;
        for (let k = i - 1; k >= 0; k--) {
          if (candles[k]!.open > candles[k]!.close) {
            bullishOB = [candles[k]!.close, candles[k]!.open];
            bullishOBRetested = false;
            foundOB = true;
            break;
          }
        }
        latestSwingHigh = null;
      }

      if (latestSwingLow !== null && currentClose < latestSwingLow) {
        for (let k = i - 1; k >= 0; k--) {
          if (candles[k]!.close > candles[k]!.open) {
            bearishOB = [candles[k]!.open, candles[k]!.close];
            bearishOBRetested = false;
            break;
          }
        }
        latestSwingLow = null;
      }
      
      if (bullishOB && !bullishOBRetested) {
        const cLow = candles[i]!.low;
        const toleranceValue = bullishOB[1] * tolerance;
        if (cLow <= bullishOB[1] + toleranceValue) {
          bullishOBRetested = true;
        }
      }
      if (bearishOB && !bearishOBRetested) {
        const cHigh = candles[i]!.high;
        const toleranceValue = bearishOB[0] * tolerance;
        if (cHigh >= bearishOB[0] - toleranceValue) {
          bearishOBRetested = true;
        }
      }
    }

    const currentCandle = candles[candles.length - 1]!;
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    const indicators: Record<string, number> = {};

    if (bullishOB) {
      indicators['BULLISH_OB_LOWER'] = bullishOB[0];
      indicators['BULLISH_OB_UPPER'] = bullishOB[1];
    }
    if (bearishOB) {
      indicators['BEARISH_OB_LOWER'] = bearishOB[0];
      indicators['BEARISH_OB_UPPER'] = bearishOB[1];
    }

    if (bullishOB && !bullishOBRetested) {
      const toleranceValue = bullishOB[1] * tolerance;
      if (currentCandle.low <= bullishOB[1] + toleranceValue) {
        action = 'BUY';
      }
    } else if (bearishOB && !bearishOBRetested) {
      const toleranceValue = bearishOB[0] * tolerance;
      if (currentCandle.high >= bearishOB[0] - toleranceValue) {
        action = 'SELL';
      }
    }

    return { action, indicators };
  }
}

const createSMCStrategy: StrategyFactory = Object.assign(
  (params?: unknown) => new SMCStrategy(params as SMCParams | undefined),
  { paramsSchema: SMCStrategy.paramsSchema }
);

StrategyRegistry.register(SMC_STRATEGY_ID, createSMCStrategy);
