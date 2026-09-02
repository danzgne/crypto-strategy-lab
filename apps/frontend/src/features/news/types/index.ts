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
  ExtractionTemplate,
  TemplateFieldName,
  TemplateFieldLocator,
  TemplateVersionStatus,
  ExtractionTemplateVersion,
  ExtractionSettings,
  ExtractionPanelData,
  SourceHealth,
  DriftVerdict,
  DriftStatus,
  TemplatePreviewResult,
  TemplateGenerateResult,
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
  ExtractionTemplate,
  TemplateFieldName,
  TemplateFieldLocator,
  TemplateVersionStatus,
  ExtractionTemplateVersion,
  ExtractionSettings,
  ExtractionPanelData,
  SourceHealth,
  DriftVerdict,
  DriftStatus,
  TemplatePreviewResult,
  TemplateGenerateResult,
};

export interface NewsListResponse {
  items: NewsItem[];
  total: number;
  page: number;
  limit: number;
}
