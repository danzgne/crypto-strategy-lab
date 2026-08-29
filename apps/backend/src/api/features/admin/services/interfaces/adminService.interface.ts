import type { NewsItem, NewsSource } from '@crypto-strategy-lab/shared';
import type {
  CreateNewsSourceDto,
  UpdateNewsSourceDto,
  IngestHtmlDto,
} from '../../types/admin.dto';
import type { CrawlSummary } from '@/api/features/news/services/interfaces/newsCrawler.interface';

export interface AdminServiceInterface {
  getNewsSources(): Promise<NewsSource[]>;
  createNewsSource(dto: CreateNewsSourceDto): Promise<NewsSource>;
  updateNewsSource(id: string, dto: UpdateNewsSourceDto): Promise<NewsSource>;
  deleteNewsSource(id: string): Promise<void>;
  startCrawl(): Promise<CrawlSummary>;
  getCrawlInterval(): { intervalMinutes: number };
  updateCrawlInterval(intervalMinutes: number): { intervalMinutes: number };
  toggleDriftDetection(): { message: string };
  applyTemplate(): { message: string };
  ingestHtml(dto: IngestHtmlDto): Promise<NewsItem>;
}
