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
});
