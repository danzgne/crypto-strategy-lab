import {
  type Signal,
  type Strategy,
  type StrategyContext,
  type StrategyFactory,
  type StrategyParamsSchema,
} from '@crypto-strategy-lab/shared';

import { StrategyRegistry } from '../registry';
import { resolveRiskParams } from './utils';

export const WYCKOFF_STRATEGY_ID = 'wyckoff';

export interface WyckoffParams {
  length?: number;
  threshold?: number;
  volumeRatio?: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface ResolvedWyckoffParams {
  length: number;
  threshold: number;
  volumeRatio: number;
  stopLoss?: number;
  takeProfit?: number;
}

export const WYCKOFF_PARAMS_SCHEMA: StrategyParamsSchema = {
  type: 'object',
  properties: {
    length: {
      type: 'integer',
      default: 20,
      minimum: 4,
      description: 'Trailing window length',
    },
    threshold: {
      type: 'number',
      default: 0.02,
      minimum: 0.001,
      description: 'Range-width threshold for consolidation',
    },
    volumeRatio: {
      type: 'number',
      default: 1.5,
      minimum: 0.1,
      description: 'Required volume ratio (second half / first half)',
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

export class WyckoffStrategy implements Strategy<ResolvedWyckoffParams> {
  public static readonly paramsSchema = WYCKOFF_PARAMS_SCHEMA;

  public readonly id = WYCKOFF_STRATEGY_ID;
  public readonly params: Readonly<ResolvedWyckoffParams>;
  public readonly requiredHistory: number;

  public constructor(params: WyckoffParams = {}) {
    const length = params.length ?? 20;
    const threshold = params.threshold ?? 0.02;
    const volumeRatio = params.volumeRatio ?? 1.5;

    if (!Number.isInteger(length) || length < 4) {
      throw new Error('Wyckoff length must be an integer >= 4');
    }
    if (threshold <= 0) {
      throw new Error('Wyckoff threshold must be positive');
    }
    if (volumeRatio <= 0) {
      throw new Error('Wyckoff volume ratio must be positive');
    }

    const resolved: ResolvedWyckoffParams = { length, threshold, volumeRatio };
    resolveRiskParams(params, resolved, 'Wyckoff');

    this.params = resolved;
    this.requiredHistory = length + 1; // +1 to check breakout of previous window
  }

  public analyze(context: StrategyContext): Signal {
    const candles = context.candles;
    if (candles.length < this.requiredHistory) {
      return { action: 'HOLD' as const };
    }

    const { length, threshold, volumeRatio } = this.params;

    // Window prior to the current candle
    const windowCandles = candles.slice(-(length + 1), -1);
    const currentCandle = candles[candles.length - 1];

    let maxHigh = -Infinity;
    let minLow = Infinity;

    for (const c of windowCandles) {
      if (c.high > maxHigh) maxHigh = c.high;
      if (c.low < minLow) minLow = c.low;
    }

    const rangeWidth = (maxHigh - minLow) / minLow;

    // Check volume
    const half = Math.floor(length / 2);
    let firstHalfVolume = 0;
    let secondHalfVolume = 0;

    for (let i = 0; i < half; i++) {
      firstHalfVolume += windowCandles[i]!.volume;
    }
    for (let i = half; i < length; i++) {
      secondHalfVolume += windowCandles[i]!.volume;
    }

    // Avoid division by zero
    if (firstHalfVolume === 0) {
      return { action: 'HOLD' as const };
    }

    const currentVolRatio = secondHalfVolume / firstHalfVolume;

    const indicators = {
      WYCKOFF_RANGE_TOP: maxHigh,
      WYCKOFF_RANGE_BOTTOM: minLow,
    };

    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';

    if (rangeWidth <= threshold && currentVolRatio >= volumeRatio) {
      // It's a valid consolidation phase (accumulation/distribution)
      if (currentCandle!.close > maxHigh) {
        action = 'BUY'; // Breakout above accumulation
      } else if (currentCandle!.close < minLow) {
        action = 'SELL'; // Breakdown below distribution
      }
    }

    return { action, indicators };
  }
}

const createWyckoffStrategy: StrategyFactory = Object.assign(
  (params?: unknown) =>
    new WyckoffStrategy(params as WyckoffParams | undefined),
  { paramsSchema: WyckoffStrategy.paramsSchema },
);

StrategyRegistry.register(WYCKOFF_STRATEGY_ID, createWyckoffStrategy);
