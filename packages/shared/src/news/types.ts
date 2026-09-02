import type { SentimentAggregate } from '../strategy/types';

export type NewsProviderType = 'RSS' | 'WEBSITE' | 'HTML';

export const SENTIMENT_LABELS = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const;

export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

export const NEWS_EVENT_TYPES = [
  'ETF_FUND_FLOW',
  'PROTOCOL_UPGRADE',
  'REGULATION',
  'PARTNERSHIP',
  'MARKET_TREND',
  'OTHER',
] as const;

export type NewsEventType = (typeof NEWS_EVENT_TYPES)[number];

export interface NewsSentiment {
  label: SentimentLabel;
  score: number;
  eventType: NewsEventType;
}

export interface NewsAnalytics {
  aggregate: SentimentAggregate;
  eventTypes: Record<NewsEventType, number>;
  analyzedCount: number;
}

export type CrawlStatus = 'SUCCESS' | 'FAILURE';

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  source: string;
  url: string;
  publishedAt: string;
  relatedCoins: string[];
  sentiment?: NewsSentiment | null | undefined;
  newsSourceId?: string | null | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  providerType: NewsProviderType;
  isActive: boolean;
  config?: Record<string, unknown> | null | undefined;
  lastCrawlAttempt?: NewsCrawlAttempt | null | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface RawNewsItem {
  title: string;
  content: string;
  url: string;
  publishedAt: Date;
  source: string;
  relatedCoins?: string[] | undefined;
}

export interface NewsCrawlAttempt {
  id: string;
  newsSourceId: string;
  status: CrawlStatus;
  itemsFound: number;
  itemsPersisted: number;
  errorMessage?: string | null | undefined;
  crawledAt: string;
}

export interface CrawlResult {
  sourceId: string;
  sourceName: string;
  status: CrawlStatus;
  itemsFound: number;
  itemsPersisted: number;
  error?: string | undefined;
}

export interface CrawlSummary {
  startedAt: string;
  completedAt: string;
  sourcesProcessed: number;
  totalFound: number;
  totalPersisted: number;
  results: CrawlResult[];
}

export interface NewsListFilterQuery {
  page?: number | undefined;
  limit?: number | undefined;
  source?: string | undefined;
  coin?: string | undefined;
  providerType?: NewsProviderType | undefined;
}

export interface NewsStats {
  totalItems: number;
  totalSources: number;
  activeSources: number;
  coveragePercent: number;
  analytics?: NewsAnalytics | null | undefined;
}

export const DEFAULT_NEWS_SOURCES = [
  {
    name: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    providerType: 'RSS' as const,
    isActive: true,
  },
  {
    name: 'Cointelegraph',
    url: 'https://cointelegraph.com/rss',
    providerType: 'RSS' as const,
    isActive: true,
  },
  {
    name: 'Decrypt',
    url: 'https://decrypt.co/feed',
    providerType: 'RSS' as const,
    isActive: true,
  },
  {
    name: 'The Block',
    url: 'https://www.theblock.co/rss.xml',
    providerType: 'RSS' as const,
    isActive: true,
  },
  {
    name: 'Bankless',
    url: 'https://www.bankless.com/rss/feed',
    providerType: 'RSS' as const,
    isActive: true,
  },
];
