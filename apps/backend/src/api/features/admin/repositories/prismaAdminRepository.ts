import type { AppPrismaClient } from '@/database/prismaClient';
import type { AdminRepositoryInterface } from './interfaces/adminRepository.interface';
import type { NewsSource, NewsCrawlAttempt } from '@crypto-strategy-lab/shared';

export class PrismaAdminRepository implements AdminRepositoryInterface {
  public constructor(private readonly prisma: AppPrismaClient) {}

  public async findNewsSources(): Promise<NewsSource[]> {
    const sources = await this.prisma.newsSource.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      providerType: s.providerType,
      isActive: s.isActive,
      config: (s.config as Record<string, unknown> | null) ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
  }

  public async findRecentCrawlLogs(limit = 50): Promise<NewsCrawlAttempt[]> {
    const logs = await this.prisma.newsCrawlAttempt.findMany({
      orderBy: { crawledAt: 'desc' },
      take: limit,
    });
    return logs.map((l) => ({
      id: l.id,
      newsSourceId: l.newsSourceId,
      status: l.status,
      itemsFound: l.itemsFound,
      itemsPersisted: l.itemsPersisted,
      errorMessage: l.errorMessage,
      crawledAt: l.crawledAt.toISOString(),
    }));
  }
}
