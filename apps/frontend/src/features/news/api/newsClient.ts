import { browserHttpClient } from '../../../shared/api/browserHttpClient';
import type {
  NewsItem,
  NewsSource,
  NewsStats,
  NewsListFilterQuery,
  NewsListResponse,
  NewsProviderType,
} from '../types';

export async function fetchNewsItems(
  query: NewsListFilterQuery = {},
): Promise<NewsListResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.source) params.set('source', query.source);
  if (query.coin) params.set('coin', query.coin);
  if (query.providerType) params.set('providerType', query.providerType);

  const qs = params.toString();
  const endpoint = `/api/v1/news${qs ? `?${qs}` : ''}`;
  return browserHttpClient<NewsListResponse>(endpoint);
}

export async function fetchNewsSources(): Promise<NewsSource[]> {
  return browserHttpClient<NewsSource[]>('/api/v1/news/sources');
}

export async function fetchNewsStats(): Promise<NewsStats> {
  return browserHttpClient<NewsStats>('/api/v1/news/stats');
}

export async function triggerCrawl(): Promise<{
  success: boolean;
  message?: string;
}> {
  return browserHttpClient<{ success: boolean; message?: string }>(
    '/api/v1/admin/crawl/start',
    {
      method: 'POST',
    },
  );
}

export async function fetchCrawlInterval(): Promise<{
  intervalMinutes: number;
}> {
  return browserHttpClient<{ intervalMinutes: number }>(
    '/api/v1/news/interval',
  );
}

export async function updateCrawlInterval(
  intervalMinutes: number,
): Promise<{ intervalMinutes: number }> {
  return browserHttpClient<{ intervalMinutes: number }>(
    '/api/v1/admin/crawl/interval',
    {
      method: 'PUT',
      body: JSON.stringify({ intervalMinutes }),
    },
  );
}

export async function createNewsSource(data: {
  name: string;
  url: string;
  providerType: NewsProviderType;
  isActive?: boolean | undefined;
}): Promise<NewsSource> {
  return browserHttpClient<NewsSource>('/api/v1/admin/news-sources', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function ingestHtml(data: {
  title: string;
  html: string;
  url?: string | undefined;
  source?: string | undefined;
  relatedCoins?: string[] | undefined;
}): Promise<NewsItem> {
  return browserHttpClient<NewsItem>('/api/v1/admin/ingest/html', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
