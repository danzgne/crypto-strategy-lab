import type { NewsItem, NewsSource } from '@crypto-strategy-lab/shared';
import type { AdminServiceInterface } from './interfaces/adminService.interface';
import type { NewsServiceInterface } from '@/api/features/news/services/interfaces/newsService.interface';
import type {
  CreateNewsSourceDto,
  UpdateNewsSourceDto,
  IngestHtmlDto,
} from '../types/admin.dto';
import type { CrawlSummary } from '@/api/features/news/services/interfaces/newsCrawler.interface';

export interface AdminServiceDependencies {
  newsService: NewsServiceInterface;
}

export class AdminService implements AdminServiceInterface {
  private readonly newsService: NewsServiceInterface;

  public constructor(
    depsOrNewsService: AdminServiceDependencies | NewsServiceInterface,
  ) {
    if ('getSources' in depsOrNewsService) {
      this.newsService = depsOrNewsService;
    } else {
      this.newsService = depsOrNewsService.newsService;
    }
  }

  public async getNewsSources(): Promise<NewsSource[]> {
    return this.newsService.getSources();
  }

  public async createNewsSource(dto: CreateNewsSourceDto): Promise<NewsSource> {
    return this.newsService.createSource(dto);
  }

  public async updateNewsSource(
    id: string,
    dto: UpdateNewsSourceDto,
  ): Promise<NewsSource> {
    return this.newsService.updateSource(id, dto);
  }

  public async deleteNewsSource(id: string): Promise<void> {
    await this.newsService.deleteSource(id);
  }

  public async startCrawl(): Promise<CrawlSummary> {
    return this.newsService.triggerCrawlNow();
  }

  public getCrawlInterval(): { intervalMinutes: number } {
    return this.newsService.getCrawlInterval();
  }

  public updateCrawlInterval(intervalMinutes: number): {
    intervalMinutes: number;
  } {
    return this.newsService.updateCrawlInterval(intervalMinutes);
  }

  public async ingestHtml(dto: IngestHtmlDto): Promise<NewsItem> {
    return this.newsService.ingestHtml(dto);
  }
}
