import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { NewsController } from '@/api/features/news/controllers/newsController';
import type { NewsServiceInterface } from '@/api/features/news/services/interfaces/newsService.interface';

function createMockResponse(): Response {
  const res = {
    req: { requestId: 'test-req-id' },
  } as unknown as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('NewsController', () => {
  it('getCrawlInterval returns the current crawl interval from NewsService', () => {
    const mockNewsService = {
      getCrawlInterval: vi.fn().mockReturnValue({ intervalMinutes: 5 }),
    } as unknown as NewsServiceInterface;

    const controller = new NewsController(mockNewsService);
    const req = {} as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    controller.getCrawlInterval(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { intervalMinutes: 5 },
      }),
    );
  });

  it('getSources returns all sources when query.active is not set', async () => {
    const mockSources = [
      { id: 'src-1', name: 'Source 1', isActive: true },
      { id: 'src-2', name: 'Source 2', isActive: false },
    ];
    const mockNewsService = {
      getSources: vi.fn().mockResolvedValue(mockSources),
    } as unknown as NewsServiceInterface;

    const controller = new NewsController(mockNewsService);
    const req = { query: {} } as Request;
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    await controller.getSources(req, res, next);
    expect(mockNewsService.getSources).toHaveBeenCalledWith(undefined);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: mockSources,
      }),
    );
  });
});
