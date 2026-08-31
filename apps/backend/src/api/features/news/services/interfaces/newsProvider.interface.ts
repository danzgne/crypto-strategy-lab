import type {
  NewsProviderType,
  NewsSource,
  RawNewsItem,
} from '@crypto-strategy-lab/shared';

export interface NewsProvider {
  readonly providerType: NewsProviderType;
  fetchNews(source: NewsSource): Promise<RawNewsItem[]>;
}
