import { browserHttpClient } from '../../../shared/api/browserHttpClient';
import type {
  NewsItem,
  NewsSource,
  NewsStats,
  NewsListFilterQuery,
  NewsListResponse,
  NewsProviderType,
  CrawlSummary,
  ExtractionTemplate,
  ExtractionTemplateVersion,
  ExtractionSettings,
  ExtractionPanelData,
  TemplatePreviewResult,
  TemplateGenerateResult,
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

export async function fetchNewsStats(
  coin?: string | undefined,
): Promise<NewsStats> {
  const endpoint = coin
    ? `/api/v1/news/stats?coin=${encodeURIComponent(coin)}`
    : '/api/v1/news/stats';
  return browserHttpClient<NewsStats>(endpoint);
}

export async function triggerCrawl(): Promise<CrawlSummary> {
  return browserHttpClient<CrawlSummary>('/api/v1/admin/crawl/start', {
    method: 'POST',
  });
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

export async function updateNewsSource(
  id: string,
  data: {
    name?: string | undefined;
    url?: string | undefined;
    providerType?: NewsProviderType | undefined;
    isActive?: boolean | undefined;
  },
): Promise<NewsSource> {
  return browserHttpClient<NewsSource>(`/api/v1/admin/news-sources/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteNewsSource(
  id: string,
): Promise<{ message: string }> {
  return browserHttpClient<{ message: string }>(
    `/api/v1/admin/news-sources/${id}`,
    {
      method: 'DELETE',
    },
  );
}

export async function fetchExtractionPanel(
  sourceId: string,
): Promise<ExtractionPanelData> {
  return browserHttpClient<ExtractionPanelData>(
    `/api/v1/news/sources/${sourceId}/extraction-panel`,
  );
}

export async function fetchTemplateVersions(
  sourceId: string,
): Promise<ExtractionTemplateVersion[]> {
  return browserHttpClient<ExtractionTemplateVersion[]>(
    `/api/v1/news/sources/${sourceId}/template/versions`,
  );
}

export async function fetchExtractionSettings(): Promise<ExtractionSettings> {
  return browserHttpClient<ExtractionSettings>(
    '/api/v1/news/extraction/settings',
  );
}

export async function updateExtractionSettings(patch: {
  driftDetectionEnabled?: boolean | undefined;
  driftThreshold?: number | undefined;
}): Promise<ExtractionSettings> {
  return browserHttpClient<ExtractionSettings>(
    '/api/v1/admin/extraction/settings',
    {
      method: 'PUT',
      body: JSON.stringify(patch),
    },
  );
}

export async function previewTemplate(
  sourceId: string,
  body: {
    html?: string | undefined;
    template?: ExtractionTemplate | undefined;
  },
): Promise<TemplatePreviewResult> {
  return browserHttpClient<TemplatePreviewResult>(
    `/api/v1/admin/news-sources/${sourceId}/template/preview`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function generateTemplate(
  sourceId: string,
  body: { html?: string | undefined },
): Promise<TemplateGenerateResult> {
  return browserHttpClient<TemplateGenerateResult>(
    `/api/v1/admin/news-sources/${sourceId}/template/generate`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function saveProposedTemplateVersion(
  sourceId: string,
  body: { template: ExtractionTemplate; generatedBy: string },
): Promise<ExtractionTemplateVersion> {
  return browserHttpClient<ExtractionTemplateVersion>(
    `/api/v1/admin/news-sources/${sourceId}/template/versions`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function activateTemplateVersion(
  sourceId: string,
  versionId: string,
): Promise<ExtractionTemplateVersion> {
  return browserHttpClient<ExtractionTemplateVersion>(
    `/api/v1/admin/news-sources/${sourceId}/template/versions/${versionId}/activate`,
    { method: 'POST' },
  );
}

export async function rejectTemplateVersion(
  sourceId: string,
  versionId: string,
): Promise<ExtractionTemplateVersion> {
  return browserHttpClient<ExtractionTemplateVersion>(
    `/api/v1/admin/news-sources/${sourceId}/template/versions/${versionId}/reject`,
    { method: 'POST' },
  );
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
