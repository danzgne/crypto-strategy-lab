import type {
  NewsProviderType,
  NewsSource,
  RawNewsItem,
} from '@crypto-strategy-lab/shared';

export interface NewsProvider {
  readonly providerType: NewsProviderType;
  fetchNews(source: NewsSource): Promise<RawNewsItem[]>;
}

export interface ExtractionAttemptMetrics {
  templateVersionId: string;
  emptyFieldRate: number;
  malformedFieldRate: number;
  avgConfidence: number;
}

/**
 * An extended, optional capability a provider may implement alongside NewsProvider
 * so the Crawler can record per-template validation metrics on the crawl attempt
 * without NewsProvider itself growing extraction-specific fields for RSS and HTML.
 */
export interface NewsProviderWithExtractionMetrics extends NewsProvider {
  fetchNewsWithMetrics(
    source: NewsSource,
  ): Promise<{ items: RawNewsItem[]; metrics: ExtractionAttemptMetrics }>;
}

export function hasExtractionMetrics(
  provider: NewsProvider,
): provider is NewsProviderWithExtractionMetrics {
  return (
    typeof (provider as Partial<NewsProviderWithExtractionMetrics>)
      .fetchNewsWithMetrics === 'function'
  );
}
