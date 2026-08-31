import type {
  NewsItem,
  NewsSource,
  NewsStats,
  NewsListFilterQuery,
  NewsProviderType,
  NewsCrawlAttempt,
  CrawlResult,
  CrawlSummary,
  CrawlStatus,
} from '@crypto-strategy-lab/shared';

export type {
  NewsItem,
  NewsSource,
  NewsStats,
  NewsListFilterQuery,
  NewsProviderType,
  NewsCrawlAttempt,
  CrawlResult,
  CrawlSummary,
  CrawlStatus,
};

export interface NewsListResponse {
  items: NewsItem[];
  total: number;
  page: number;
  limit: number;
}
