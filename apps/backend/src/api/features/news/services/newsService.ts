import {
  DEFAULT_NEWS_SOURCES,
  type NewsItem,
  type NewsSource,
  type NewsStats,
  type NewsListFilterQuery,
} from '@crypto-strategy-lab/shared';
import type { NewsRepository } from '../repositories/interfaces/newsRepository.interface';
import type {
  NewsCrawlerInterface,
  CrawlSummary,
} from './interfaces/newsCrawler.interface';
import type { NewsScheduler } from './scheduler/newsScheduler';
import type { NewsServiceInterface } from './interfaces/newsService.interface';
import type {
  CreateNewsSourceDto,
  UpdateNewsSourceDto,
  IngestHtmlDto,
} from '../types/news.dto';
import { AppError } from '@/errors/AppError';

interface NewsServiceDependencies {
  newsRepository: NewsRepository;
  crawler: NewsCrawlerInterface;
  scheduler: NewsScheduler;
}

export class NewsService implements NewsServiceInterface {
  private readonly newsRepository: NewsRepository;
  private readonly crawler: NewsCrawlerInterface;
  private readonly scheduler: NewsScheduler;

  public constructor({
    newsRepository,
    crawler,
    scheduler,
  }: NewsServiceDependencies) {
    this.newsRepository = newsRepository;
    this.crawler = crawler;
    this.scheduler = scheduler;
  }

  public async getNewsItems(query: NewsListFilterQuery): Promise<{
    items: NewsItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.newsRepository.findNewsItems(query);

    return {
      items,
      total,
      page,
      limit,
    };
  }

  public async getNewsItemById(id: string): Promise<NewsItem | null> {
    return this.newsRepository.findNewsItemById(id);
  }

  public async getSources(onlyActive?: boolean): Promise<NewsSource[]> {
    await this.ensureDefaultSources();
    return this.newsRepository.findSources(onlyActive);
  }

  public async getSourceById(id: string): Promise<NewsSource | null> {
    return this.newsRepository.findSourceById(id);
  }

  public async createSource(dto: CreateNewsSourceDto): Promise<NewsSource> {
    const existing = await this.newsRepository.findSourceByUrl(dto.url);
    if (existing) {
      throw new AppError(
        `Nguồn tin tức với URL này đã tồn tại: ${dto.url}`,
        409,
        'SOURCE_URL_EXISTS',
      );
    }

    return this.newsRepository.createSource({
      name: dto.name,
      url: dto.url,
      providerType: dto.providerType,
      isActive: dto.isActive ?? true,
      config: dto.config,
    });
  }

  public async updateSource(
    id: string,
    dto: UpdateNewsSourceDto,
  ): Promise<NewsSource> {
    const source = await this.newsRepository.findSourceById(id);
    if (!source) {
      throw new AppError(
        `Không tìm thấy nguồn tin tức với ID: ${id}`,
        404,
        'NOT_FOUND',
      );
    }

    return this.newsRepository.updateSource(id, {
      name: dto.name,
      url: dto.url,
      providerType: dto.providerType,
      isActive: dto.isActive,
      config: dto.config,
    });
  }

  public async deleteSource(id: string): Promise<void> {
    const source = await this.newsRepository.findSourceById(id);
    if (!source) {
      throw new AppError(
        `Không tìm thấy nguồn tin tức với ID: ${id}`,
        404,
        'NOT_FOUND',
      );
    }
    await this.newsRepository.deleteSource(id);
  }

  public async triggerCrawlNow(): Promise<CrawlSummary> {
    await this.ensureDefaultSources();
    return this.crawler.crawlAllActiveSources();
  }

  public async updateCrawlInterval(
    intervalMinutes: number,
  ): Promise<{ intervalMinutes: number }> {
    this.scheduler.setIntervalMinutes(intervalMinutes);
    const validMinutes = this.scheduler.getIntervalMinutes();
    await this.newsRepository.setSetting(
      'news.crawl_interval_minutes',
      String(validMinutes),
    );
    return { intervalMinutes: validMinutes };
  }

  public getCrawlInterval(): { intervalMinutes: number } {
    return { intervalMinutes: this.scheduler.getIntervalMinutes() };
  }

  public async ingestHtml(dto: IngestHtmlDto): Promise<NewsItem> {
    return this.crawler.ingestHtml(dto);
  }

  public async getStats(): Promise<NewsStats> {
    return this.newsRepository.getNewsStats();
  }

  public async init(): Promise<void> {
    const saved = await this.newsRepository.getSetting(
      'news.crawl_interval_minutes',
    );
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 5) {
        this.scheduler.setIntervalMinutes(parsed);
      }
    }
  }

  public async ensureDefaultSources(): Promise<void> {
    const existing = await this.newsRepository.findSources();
    if (existing.length > 0) return;

    for (const src of DEFAULT_NEWS_SOURCES) {
      await this.newsRepository.createSource(src);
    }
  }
}
