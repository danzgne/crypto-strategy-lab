import {
  type Signal,
  type Strategy,
  type StrategyContext,
  type StrategyFactory,
  type StrategyParamsSchema,
} from '@crypto-strategy-lab/shared';

import { StrategyRegistry } from '../registry';
import { resolveRiskParams } from './utils';

export const SR_STRATEGY_ID = 'sr';

export interface SRParams {
  n?: number;
  levelsTracked?: number;
  tolerance?: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface ResolvedSRParams {
  n: number;
  levelsTracked: number;
  tolerance: number;
  stopLoss?: number;
  takeProfit?: number;
}

export const SR_PARAMS_SCHEMA: StrategyParamsSchema = {
  type: 'object',
  properties: {
    n: {
      type: 'integer',
      default: 10,
      minimum: 2,
      description: 'Fractal pivot lookback/lookforward period N',
    },
    levelsTracked: {
      type: 'integer',
      default: 3,
      minimum: 1,
      description: 'Number of recent pivot levels to track',
    },
    tolerance: {
      type: 'number',
      default: 0.005,
      minimum: 0.0001,
      description: 'Tolerance percentage to trigger signal',
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

export class SRStrategy implements Strategy<ResolvedSRParams> {
  public static readonly paramsSchema = SR_PARAMS_SCHEMA;

  public readonly id = SR_STRATEGY_ID;
  public readonly params: Readonly<ResolvedSRParams>;
  public readonly requiredHistory: number;

  public constructor(params: SRParams = {}) {
    const n = params.n ?? 10;
    const levelsTracked = params.levelsTracked ?? 3;
    const tolerance = params.tolerance ?? 0.005;

    if (!Number.isInteger(n) || n < 2) {
      throw new Error('SR N must be an integer >= 2');
    }
    if (!Number.isInteger(levelsTracked) || levelsTracked < 1) {
      throw new Error('SR levelsTracked must be a positive integer');
    }
    if (!Number.isFinite(tolerance) || tolerance <= 0) {
      throw new Error('SR tolerance must be a finite positive number');
    }

    const resolved: ResolvedSRParams = { n, levelsTracked, tolerance };
    resolveRiskParams(params, resolved, 'SR');

    this.params = resolved;
    // A complete pivot needs n candles on either side. Scale the required
    // history with the number of levels requested so callers do not silently
    // receive too little context for larger levelsTracked values.
    this.requiredHistory = (2 * n + 1) * levelsTracked;
  }

  public analyze(context: StrategyContext): Signal {
    const candles = context.candles;
    if (candles.length < this.requiredHistory) {
      return { action: 'HOLD' as const };
    }

    const { n, levelsTracked, tolerance } = this.params;

    const supports: number[] = [];
    const resistances: number[] = [];

    for (let i = candles.length - 1 - n; i >= n; i--) {
      let isSupport = true;
      let isResistance = true;
      const currentLow = candles[i]!.low;
      const currentHigh = candles[i]!.high;

      for (let j = i - n; j <= i + n; j++) {
        if (i === j) continue;
        if (candles[j]!.low <= currentLow) {
          isSupport = false;
        }
        if (candles[j]!.high >= currentHigh) {
          isResistance = false;
        }
      }

      if (isSupport && !isResistance && supports.length < levelsTracked) {
        supports.push(currentLow);
      }
      if (isResistance && !isSupport && resistances.length < levelsTracked) {
        resistances.push(currentHigh);
      }

      if (
        supports.length === levelsTracked &&
        resistances.length === levelsTracked
      ) {
        break;
      }
    }

    const indicators: Record<string, number> = {};
    supports.forEach((val, idx) => {
      indicators[`SUPPORT_${idx + 1}`] = val;
    });
    resistances.forEach((val, idx) => {
      indicators[`RESISTANCE_${idx + 1}`] = val;
    });

    const currentClose = candles[candles.length - 1]!.close;
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';

    const nearSupport = supports.some(
      (support) =>
        support !== 0 &&
        Math.abs(currentClose - support) / Math.abs(support) <= tolerance,
    );
    const nearResistance = resistances.some(
      (resistance) =>
        resistance !== 0 &&
        Math.abs(currentClose - resistance) / Math.abs(resistance) <= tolerance,
    );

    if (nearSupport !== nearResistance) {
      action = nearSupport ? 'BUY' : 'SELL';
    }

    return { action, indicators };
  }
}

const createSRStrategy: StrategyFactory = Object.assign(
  (params?: unknown) => new SRStrategy(params as SRParams | undefined),
  { paramsSchema: SRStrategy.paramsSchema },
);

StrategyRegistry.register(SR_STRATEGY_ID, createSRStrategy);
