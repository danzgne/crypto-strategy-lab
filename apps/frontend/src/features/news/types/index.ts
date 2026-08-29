import type {
  NewsItem,
  NewsSource,
  NewsStats,
  NewsListFilterQuery,
  NewsProviderType,
} from '@crypto-strategy-lab/shared';

export type {
  NewsItem,
  NewsSource,
  NewsStats,
  NewsListFilterQuery,
  NewsProviderType,
};

export interface NewsListResponse {
  items: NewsItem[];
  total: number;
  page: number;
  limit: number;
}
