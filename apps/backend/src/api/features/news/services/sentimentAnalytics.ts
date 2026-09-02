import type {
  NewsAnalytics,
  NewsEventType,
  NewsSentiment,
} from '@crypto-strategy-lab/shared';
import { NEWS_EVENT_TYPES } from '@crypto-strategy-lab/shared';

export interface ScoredNewsItemForAnalytics {
  publishedAt: string;
  relatedCoins: readonly string[];
  sentiment: NewsSentiment;
}

const WINDOW_MS = 24 * 60 * 60 * 1_000;

export function calculateSentimentAnalytics(
  items: readonly ScoredNewsItemForAnalytics[],
  pair?: string,
  now = new Date(),
): NewsAnalytics {
  const pairAsset = pair === undefined ? undefined : normalizeBaseAsset(pair);
  const windowStart = now.getTime() - WINDOW_MS;
  const matchingItems = items.filter((item) => {
    const publishedAt = new Date(item.publishedAt).getTime();
    if (
      !Number.isFinite(publishedAt) ||
      publishedAt < windowStart ||
      publishedAt > now.getTime()
    ) {
      return false;
    }

    if (pairAsset === undefined) return true;
    return item.relatedCoins.some(
      (coin) => normalizeBaseAsset(coin) === pairAsset,
    );
  });

  const eventTypes = createEmptyEventTypeDistribution();
  let positive = 0;
  let neutral = 0;
  let negative = 0;
  let scoreTotal = 0;

  for (const item of matchingItems) {
    if (item.sentiment.label === 'POSITIVE') positive++;
    if (item.sentiment.label === 'NEUTRAL') neutral++;
    if (item.sentiment.label === 'NEGATIVE') negative++;
    eventTypes[item.sentiment.eventType]++;
    scoreTotal += item.sentiment.score;
  }

  const analyzedCount = matchingItems.length;
  return {
    aggregate: {
      positive: toPercentage(positive, analyzedCount),
      neutral: toPercentage(neutral, analyzedCount),
      negative: toPercentage(negative, analyzedCount),
      score: analyzedCount === 0 ? 0 : round(scoreTotal / analyzedCount, 6),
      sampleSize: analyzedCount,
    },
    eventTypes: toPercentages(eventTypes, analyzedCount),
    analyzedCount,
  };
}

function createEmptyEventTypeDistribution(): Record<NewsEventType, number> {
  return Object.fromEntries(
    NEWS_EVENT_TYPES.map((eventType) => [eventType, 0]),
  ) as Record<NewsEventType, number>;
}

function toPercentages(
  counts: Record<NewsEventType, number>,
  total: number,
): Record<NewsEventType, number> {
  return Object.fromEntries(
    NEWS_EVENT_TYPES.map((eventType) => [
      eventType,
      toPercentage(counts[eventType], total),
    ]),
  ) as Record<NewsEventType, number>;
}

function toPercentage(count: number, total: number): number {
  return total === 0 ? 0 : round((count / total) * 100, 2);
}

export function normalizeBaseAsset(value: string): string {
  const normalized = value.trim().toUpperCase();
  return normalized.endsWith('USDT')
    ? normalized.slice(0, -'USDT'.length)
    : normalized;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
