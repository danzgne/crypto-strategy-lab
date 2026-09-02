import type {
  NewsItem,
  NewsSource,
  NewsStats,
  NewsListFilterQuery,
} from '@crypto-strategy-lab/shared';
import type {
  CreateNewsSourceDto,
  UpdateNewsSourceDto,
  IngestHtmlDto,
} from '../../types/news.dto';
import type { CrawlSummary } from './newsCrawler.interface';

export interface NewsServiceInterface {
  getNewsItems(
    query: NewsListFilterQuery,
  ): Promise<{ items: NewsItem[]; total: number; page: number; limit: number }>;
  getNewsItemById(id: string): Promise<NewsItem | null>;
  getSources(onlyActive?: boolean): Promise<NewsSource[]>;
  getSourceById(id: string): Promise<NewsSource | null>;
  createSource(dto: CreateNewsSourceDto): Promise<NewsSource>;
  updateSource(id: string, dto: UpdateNewsSourceDto): Promise<NewsSource>;
  deleteSource(id: string): Promise<void>;
  triggerCrawlNow(): Promise<CrawlSummary>;
  updateCrawlInterval(
    intervalMinutes: number,
  ): Promise<{ intervalMinutes: number }>;
  getCrawlInterval(): { intervalMinutes: number };
  ingestHtml(dto: IngestHtmlDto): Promise<NewsItem>;
  getStats(pair?: string): Promise<NewsStats>;
  ensureDefaultSources(): Promise<void>;
  init?(): Promise<void>;
}
