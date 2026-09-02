import { describe, expect, it } from 'vitest';

import { calculateSentimentAnalytics } from '@/api/features/news/services/sentimentAnalytics';

describe('calculateSentimentAnalytics', () => {
  it('aggregates scored items by pair, publication time, and event type', () => {
    const now = new Date('2026-09-02T12:00:00.000Z');
    const items = [
      {
        publishedAt: '2026-09-02T11:00:00.000Z',
        relatedCoins: ['BTC'],
        sentiment: {
          label: 'POSITIVE' as const,
          score: 0.8,
          eventType: 'ETF_FUND_FLOW' as const,
        },
      },
      {
        publishedAt: '2026-09-02T10:00:00.000Z',
        relatedCoins: ['BTC', 'ETH'],
        sentiment: {
          label: 'NEGATIVE' as const,
          score: -0.2,
          eventType: 'REGULATION' as const,
        },
      },
      {
        publishedAt: '2026-09-02T09:00:00.000Z',
        relatedCoins: ['ETH'],
        sentiment: {
          label: 'NEUTRAL' as const,
          score: 0,
          eventType: 'OTHER' as const,
        },
      },
      {
        publishedAt: '2026-09-01T11:59:59.000Z',
        relatedCoins: ['BTC'],
        sentiment: {
          label: 'POSITIVE' as const,
          score: 1,
          eventType: 'PARTNERSHIP' as const,
        },
      },
    ];

    expect(calculateSentimentAnalytics(items, 'BTCUSDT', now)).toEqual({
      aggregate: {
        positive: 50,
        neutral: 0,
        negative: 50,
        score: 0.3,
        sampleSize: 2,
      },
      eventTypes: {
        ETF_FUND_FLOW: 50,
        PROTOCOL_UPGRADE: 0,
        REGULATION: 50,
        PARTNERSHIP: 0,
        MARKET_TREND: 0,
        OTHER: 0,
      },
      analyzedCount: 2,
    });
  });

  it('counts a multi-coin item once for each matching pair', () => {
    const now = new Date('2026-09-02T12:00:00.000Z');
    const items = [
      {
        publishedAt: '2026-09-02T11:00:00.000Z',
        relatedCoins: ['btc', 'BTCUSDT', 'ETH'],
        sentiment: {
          label: 'POSITIVE' as const,
          score: 0.5,
          eventType: 'MARKET_TREND' as const,
        },
      },
    ];

    expect(calculateSentimentAnalytics(items, 'ETH', now).aggregate).toEqual({
      positive: 100,
      neutral: 0,
      negative: 0,
      score: 0.5,
      sampleSize: 1,
    });
  });
});
