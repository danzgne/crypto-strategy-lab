import {
  type Signal,
  type Strategy,
  type StrategyContext,
  type StrategyFactory,
  type StrategyParamsSchema,
} from '@crypto-strategy-lab/shared';

import { StrategyRegistry } from '../registry';

export const NEWS_SENTIMENT_STRATEGY_ID = 'news-sentiment';

export interface NewsSentimentParams {
  buyThreshold?: number;
  sellThreshold?: number;
  minSampleSize?: number;
}

interface ResolvedNewsSentimentParams {
  buyThreshold: number;
  sellThreshold: number;
  minSampleSize: number;
}

export const NEWS_SENTIMENT_PARAMS_SCHEMA: StrategyParamsSchema = {
  type: 'object',
  properties: {
    buyThreshold: {
      type: 'number',
      default: 0.25,
      minimum: 0,
      maximum: 1,
      description: 'Aggregate score above which to emit BUY',
    },
    sellThreshold: {
      type: 'number',
      default: -0.25,
      minimum: -1,
      maximum: 0,
      description: 'Aggregate score below which to emit SELL',
    },
    minSampleSize: {
      type: 'integer',
      default: 3,
      minimum: 1,
      description: 'Minimum scored news items required for a signal',
    },
  },
};

export class NewsSentimentStrategy implements Strategy<ResolvedNewsSentimentParams> {
  public static readonly paramsSchema = NEWS_SENTIMENT_PARAMS_SCHEMA;

  public readonly id = NEWS_SENTIMENT_STRATEGY_ID;

  public readonly liveOnly = true;

  public readonly params: Readonly<ResolvedNewsSentimentParams>;

  public readonly requiredHistory = 1;

  public constructor(params: NewsSentimentParams = {}) {
    const buyThreshold = params.buyThreshold ?? 0.25;
    const sellThreshold = params.sellThreshold ?? -0.25;
    const minSampleSize = params.minSampleSize ?? 3;

    if (
      !Number.isFinite(buyThreshold) ||
      buyThreshold < 0 ||
      buyThreshold > 1
    ) {
      throw new Error('News sentiment buyThreshold must be within [0, 1]');
    }
    if (
      !Number.isFinite(sellThreshold) ||
      sellThreshold < -1 ||
      sellThreshold > 0
    ) {
      throw new Error('News sentiment sellThreshold must be within [-1, 0]');
    }
    if (sellThreshold >= buyThreshold) {
      throw new Error(
        'News sentiment sellThreshold must be less than buyThreshold',
      );
    }
    if (!Number.isInteger(minSampleSize) || minSampleSize < 1) {
      throw new Error(
        'News sentiment minSampleSize must be a positive integer',
      );
    }

    this.params = { buyThreshold, sellThreshold, minSampleSize };
  }

  public analyze(context: StrategyContext): Signal {
    const { score, sampleSize } = context.sentiment;
    if (!Number.isFinite(score) || sampleSize < this.params.minSampleSize) {
      return { action: 'HOLD' };
    }
    if (score > this.params.buyThreshold) {
      return { action: 'BUY' };
    }
    if (score < this.params.sellThreshold) {
      return { action: 'SELL' };
    }
    return { action: 'HOLD' };
  }
}

const createNewsSentimentStrategy: StrategyFactory = Object.assign(
  (params?: unknown) =>
    new NewsSentimentStrategy(params as NewsSentimentParams | undefined),
  { liveOnly: true, paramsSchema: NewsSentimentStrategy.paramsSchema },
);

StrategyRegistry.register(
  NEWS_SENTIMENT_STRATEGY_ID,
  createNewsSentimentStrategy,
);
