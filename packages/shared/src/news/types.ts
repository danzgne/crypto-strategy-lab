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
