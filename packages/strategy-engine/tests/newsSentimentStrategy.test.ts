import { describe, expect, it } from 'vitest';

import {
  NEWS_SENTIMENT_STRATEGY_ID,
  NewsSentimentStrategy,
  StrategyRegistry,
} from '../src';
import { makeContext } from './testUtils';

function contextWithSentiment(
  sentiment: Partial<ReturnType<typeof makeContext>['sentiment']>,
) {
  return {
    ...makeContext([100]),
    sentiment: {
      positive: 0,
      neutral: 0,
      negative: 0,
      score: 0,
      sampleSize: 0,
      ...sentiment,
    },
  };
}

describe('NewsSentimentStrategy', () => {
  it('emits BUY when the aggregate score clears the buy threshold', () => {
    const strategy = new NewsSentimentStrategy({
      buyThreshold: 0.25,
      sellThreshold: -0.25,
      minSampleSize: 2,
    });

    expect(
      strategy.analyze(contextWithSentiment({ score: 0.4, sampleSize: 2 })),
    ).toEqual({ action: 'BUY' });
  });

  it('emits SELL when the aggregate score clears the sell threshold', () => {
    const strategy = new NewsSentimentStrategy({
      buyThreshold: 0.25,
      sellThreshold: -0.25,
      minSampleSize: 2,
    });

    expect(
      strategy.analyze(contextWithSentiment({ score: -0.4, sampleSize: 2 })),
    ).toEqual({ action: 'SELL' });
  });

  it('emits HOLD for an insufficient sample or an in-range score', () => {
    const strategy = new NewsSentimentStrategy({
      buyThreshold: 0.25,
      sellThreshold: -0.25,
      minSampleSize: 2,
    });

    expect(
      strategy.analyze(contextWithSentiment({ score: 0.9, sampleSize: 1 })),
    ).toEqual({ action: 'HOLD' });
    expect(
      strategy.analyze(contextWithSentiment({ score: 0.1, sampleSize: 2 })),
    ).toEqual({ action: 'HOLD' });
  });

  it('is registered as a normal strategy plugin', () => {
    expect(StrategyRegistry.list()).toContain(NEWS_SENTIMENT_STRATEGY_ID);
    expect(StrategyRegistry.create(NEWS_SENTIMENT_STRATEGY_ID)).toBeInstanceOf(
      NewsSentimentStrategy,
    );
  });
});
