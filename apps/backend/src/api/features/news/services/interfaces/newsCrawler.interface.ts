import type {
  NewsSource,
  NewsItem,
  CrawlResult,
  CrawlSummary,
} from '@crypto-strategy-lab/shared';
import type { IngestHtmlDto } from '../../types/news.dto';

export type { CrawlResult, CrawlSummary };

export interface NewsCrawlerInterface {
  crawlSource(source: NewsSource): Promise<CrawlResult>;
  crawlAllActiveSources(): Promise<CrawlSummary>;
  ingestHtml(dto: IngestHtmlDto): Promise<NewsItem>;
}
