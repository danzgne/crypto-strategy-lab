import type { NewsItem, NewsSource } from '@crypto-strategy-lab/shared';
import type { AdminServiceInterface } from './interfaces/adminService.interface';
import type { AdminRepositoryInterface } from '../repositories/interfaces/adminRepository.interface';
import type { NewsServiceInterface } from '@/api/features/news/services/interfaces/newsService.interface';
import type {
  CreateNewsSourceDto,
  UpdateNewsSourceDto,
  IngestHtmlDto,
} from '../types/admin.dto';
import type { CrawlSummary } from '@/api/features/news/services/interfaces/newsCrawler.interface';

export interface AdminServiceDependencies {
  newsService?: NewsServiceInterface | undefined;
  adminRepository?: AdminRepositoryInterface | undefined;
}

export class AdminService implements AdminServiceInterface {
  private readonly newsService?: NewsServiceInterface | undefined;
  private readonly adminRepository?: AdminRepositoryInterface | undefined;

  public constructor(
    depsOrNewsService?: AdminServiceDependencies | NewsServiceInterface,
  ) {
    if (!depsOrNewsService) {
      return;
    }
    if ('getSources' in depsOrNewsService) {
      this.newsService = depsOrNewsService;
    } else {
      this.newsService = depsOrNewsService.newsService;
      this.adminRepository = depsOrNewsService.adminRepository;
    }
  }

  public async getNewsSources(): Promise<NewsSource[]> {
    if (this.newsService) {
      return this.newsService.getSources();
    }
    if (this.adminRepository) {
      return this.adminRepository.findNewsSources();
    }
    return [];
  }

  public async createNewsSource(dto: CreateNewsSourceDto): Promise<NewsSource> {
    if (!this.newsService) {
      return {
        id: 'mock-source-id',
        name: dto.name,
        url: dto.url,
        providerType: dto.providerType,
        isActive: dto.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return this.newsService.createSource(dto);
  }

  public async updateNewsSource(
    id: string,
    dto: UpdateNewsSourceDto,
  ): Promise<NewsSource> {
    if (!this.newsService) {
      return {
        id,
        name: dto.name ?? 'Updated Source',
        url: dto.url ?? 'https://example.com',
        providerType: dto.providerType ?? 'RSS',
        isActive: dto.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return this.newsService.updateSource(id, dto);
  }

  public async deleteNewsSource(id: string): Promise<void> {
    if (this.newsService) {
      await this.newsService.deleteSource(id);
    }
  }

  public async startCrawl(): Promise<CrawlSummary> {
    if (this.newsService) {
      return this.newsService.triggerCrawlNow();
    }
    return {
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      sourcesProcessed: 0,
      totalFound: 0,
      totalPersisted: 0,
      results: [],
    };
  }

  public getCrawlInterval(): { intervalMinutes: number } {
    if (this.newsService) {
      return this.newsService.getCrawlInterval();
    }
    return { intervalMinutes: 3 };
  }

  public updateCrawlInterval(intervalMinutes: number): {
    intervalMinutes: number;
  } {
    if (this.newsService) {
      return this.newsService.updateCrawlInterval(intervalMinutes);
    }
    return { intervalMinutes };
  }

  public toggleDriftDetection(): { message: string } {
    return { message: 'Drift detection toggled' };
  }

  public applyTemplate(): { message: string } {
    return { message: 'Template applied' };
  }

  public async ingestHtml(dto: IngestHtmlDto): Promise<NewsItem> {
    if (!this.newsService) {
      return {
        id: 'mock-ingest-id',
        title: dto.title,
        content: dto.html,
        source: dto.source ?? 'HTML Ingest',
        url: dto.url ?? 'https://example.com/mock',
        publishedAt: new Date().toISOString(),
        relatedCoins: dto.relatedCoins ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return this.newsService.ingestHtml(dto);
  }
}
