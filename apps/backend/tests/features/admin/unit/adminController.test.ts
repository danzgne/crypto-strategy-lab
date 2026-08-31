import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AdminController } from '@/api/features/admin/controllers/adminController';
import type { NewsServiceInterface } from '@/api/features/news/services/interfaces/newsService.interface';

function createMockResponse(): Response {
  const res = {
    req: { requestId: 'test-req-id' },
  } as unknown as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('AdminController', () => {
  it('handles getNewsSources successfully', async () => {
    const mockNewsService = {
      getSources: vi.fn().mockResolvedValue([]),
      createSource: vi.fn(),
      updateSource: vi.fn(),
      deleteSource: vi.fn(),
      triggerCrawlNow: vi.fn(),
      getCrawlInterval: vi.fn().mockReturnValue({ intervalMinutes: 3 }),
      updateCrawlInterval: vi.fn().mockResolvedValue({ intervalMinutes: 3 }),
      ingestHtml: vi.fn(),
    } as unknown as NewsServiceInterface;

    const controller = new AdminController(mockNewsService);
    const req = {} as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await controller.getNewsSources(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: [] }),
    );
  });

  it('validates invalid input for createNewsSource', async () => {
    const mockNewsService = {
      getSources: vi.fn(),
      createSource: vi.fn(),
    } as unknown as NewsServiceInterface;

    const controller = new AdminController(mockNewsService);
    const req = { body: { name: '', url: 'invalid-url' } } as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await controller.createNewsSource(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
  });

  it('handles startCrawl successfully', async () => {
    const summary = {
      startedAt: '2026-08-30T00:00:00Z',
      completedAt: '2026-08-30T00:00:05Z',
      sourcesProcessed: 1,
      totalFound: 5,
      totalPersisted: 3,
      results: [],
    };
    const mockNewsService = {
      triggerCrawlNow: vi.fn().mockResolvedValue(summary),
    } as unknown as NewsServiceInterface;

    const controller = new AdminController(mockNewsService);
    const req = {} as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await controller.startCrawl(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: summary }),
    );
  });

  it('handles updateCrawlInterval successfully', async () => {
    const mockNewsService = {
      updateCrawlInterval: vi.fn().mockResolvedValue({ intervalMinutes: 4 }),
    } as unknown as NewsServiceInterface;

    const controller = new AdminController(mockNewsService);
    const req = { body: { intervalMinutes: 4 } } as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await controller.updateCrawlInterval(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { intervalMinutes: 4 },
      }),
    );
  });

  it('handles ingestHtml successfully', async () => {
    const item = {
      id: 'item-1',
      title: 'Article 1',
      content: 'Content 1',
      source: 'HTML Ingest',
      url: 'https://example.com/item1',
      publishedAt: '2026-08-30T00:00:00Z',
      relatedCoins: ['BTC'],
      newsSourceId: null,
      createdAt: '2026-08-30T00:00:00Z',
      updatedAt: '2026-08-30T00:00:00Z',
    };
    const mockNewsService = {
      ingestHtml: vi.fn().mockResolvedValue(item),
    } as unknown as NewsServiceInterface;

    const controller = new AdminController(mockNewsService);
    const req = {
      body: { title: 'Article 1', html: '<p>Content 1</p>' },
    } as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await controller.ingestHtml(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: item }),
    );
  });
});
