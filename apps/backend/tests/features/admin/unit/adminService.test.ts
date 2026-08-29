import { describe, it, expect, vi } from 'vitest';
import { AdminService } from '@/api/features/admin/services/adminService';
import type { NewsServiceInterface } from '@/api/features/news/services/interfaces/newsService.interface';
import type { NewsSource, NewsItem } from '@crypto-strategy-lab/shared';

describe('AdminService', () => {
  it('delegates news source operations to NewsService when provided', async () => {
    const mockSources: NewsSource[] = [
      {
        id: 'src-1',
        name: 'CoinDesk',
        url: 'https://example.com/feed',
        providerType: 'RSS',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const mockNewsService = {
      getSources: vi.fn().mockResolvedValue(mockSources),
      createSource: vi.fn().mockResolvedValue(mockSources[0]!),
      updateSource: vi.fn().mockResolvedValue(mockSources[0]!),
      deleteSource: vi.fn().mockResolvedValue(undefined),
      triggerCrawlNow: vi.fn().mockResolvedValue({
        startedAt: '',
        completedAt: '',
        sourcesProcessed: 1,
        totalFound: 2,
        totalPersisted: 2,
        results: [],
      }),
      getCrawlInterval: vi.fn().mockReturnValue({ intervalMinutes: 3 }),
      updateCrawlInterval: vi.fn().mockReturnValue({ intervalMinutes: 5 }),
      ingestHtml: vi.fn().mockResolvedValue({
        id: 'item-1',
        title: 'Test',
        content: 'Content',
        source: 'HTML',
        url: 'https://example.com',
        publishedAt: new Date().toISOString(),
        relatedCoins: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as NewsItem),
    } as unknown as NewsServiceInterface;

    const service = new AdminService(mockNewsService);

    const sources = await service.getNewsSources();
    expect(sources).toEqual(mockSources);
    expect(mockNewsService.getSources).toHaveBeenCalled();

    const created = await service.createNewsSource({
      name: 'CoinDesk',
      url: 'https://example.com/feed',
      providerType: 'RSS',
    });
    expect(created).toEqual(mockSources[0]);

    await service.deleteNewsSource('src-1');
    expect(mockNewsService.deleteSource).toHaveBeenCalledWith('src-1');

    const crawlRes = await service.startCrawl();
    expect(crawlRes.sourcesProcessed).toBe(1);

    expect(service.getCrawlInterval()).toEqual({ intervalMinutes: 3 });
    expect(service.updateCrawlInterval(5)).toEqual({ intervalMinutes: 5 });

    const driftRes = service.toggleDriftDetection();
    expect(driftRes.message).toBe('Drift detection toggled');

    const templateRes = service.applyTemplate();
    expect(templateRes.message).toBe('Template applied');
  });

  it('can be initialized with dependencies object', async () => {
    const mockNewsService = {
      getSources: vi.fn().mockResolvedValue([]),
    } as unknown as NewsServiceInterface;

    const service = new AdminService({ newsService: mockNewsService });
    const sources = await service.getNewsSources();
    expect(sources).toEqual([]);
    expect(mockNewsService.getSources).toHaveBeenCalled();
  });
});
