export type NewsProviderType = 'RSS' | 'WEBSITE' | 'HTML';

export type CrawlStatus = 'SUCCESS' | 'FAILURE';

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  source: string;
  url: string;
  publishedAt: string;
  relatedCoins: string[];
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
