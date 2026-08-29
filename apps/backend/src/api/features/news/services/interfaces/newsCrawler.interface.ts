import type { NewsSource, NewsItem } from '@crypto-strategy-lab/shared';
import type { IngestHtmlDto } from '../../types/news.dto';

export interface CrawlResult {
  sourceId: string;
  sourceName: string;
  status: 'SUCCESS' | 'FAILURE';
  itemsFound: number;
  itemsPersisted: number;
  error?: string;
}

export interface CrawlSummary {
  startedAt: string;
  completedAt: string;
  sourcesProcessed: number;
  totalFound: number;
  totalPersisted: number;
  results: CrawlResult[];
}

export interface NewsCrawlerInterface {
  crawlSource(source: NewsSource): Promise<CrawlResult>;
  crawlAllActiveSources(): Promise<CrawlSummary>;
  ingestHtml(dto: IngestHtmlDto): Promise<NewsItem>;
}
