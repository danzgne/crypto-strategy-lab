import type {
  NewsItem,
  NewsSource,
  NewsCrawlAttempt,
  NewsProviderType,
  CrawlStatus,
  RawNewsItem,
  NewsListFilterQuery,
  NewsStats,
} from '@crypto-strategy-lab/shared';

export interface CreateNewsSourceData {
  name: string;
  url: string;
  providerType: NewsProviderType;
  isActive?: boolean | undefined;
  config?: Record<string, unknown> | null | undefined;
}

export interface UpdateNewsSourceData {
  name?: string | undefined;
  url?: string | undefined;
  providerType?: NewsProviderType | undefined;
  isActive?: boolean | undefined;
  config?: Record<string, unknown> | null | undefined;
}

export interface NewsRepository {
  // Sources
  findSources(onlyActive?: boolean): Promise<NewsSource[]>;
  findSourceById(id: string): Promise<NewsSource | null>;
  findSourceByUrl(url: string): Promise<NewsSource | null>;
  createSource(data: CreateNewsSourceData): Promise<NewsSource>;
  updateSource(id: string, data: UpdateNewsSourceData): Promise<NewsSource>;
  deleteSource(id: string): Promise<void>;

  // News Items
  findNewsItems(
    query: NewsListFilterQuery,
  ): Promise<{ items: NewsItem[]; total: number }>;
  findNewsItemById(id: string): Promise<NewsItem | null>;
  persistRawNewsItems(
    items: RawNewsItem[],
    newsSourceId?: string,
  ): Promise<{ persistedItems: NewsItem[]; skippedCount: number }>;

  // Crawl Attempts
  recordCrawlAttempt(data: {
    newsSourceId: string;
    status: CrawlStatus;
    itemsFound: number;
    itemsPersisted: number;
    errorMessage?: string | null | undefined;
  }): Promise<NewsCrawlAttempt>;
  getRecentCrawlAttempts(limit?: number): Promise<NewsCrawlAttempt[]>;

  // Stats
  getNewsStats(): Promise<NewsStats>;

  // System Settings
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}
