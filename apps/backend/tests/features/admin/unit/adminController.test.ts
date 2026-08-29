import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AdminController } from '@/api/features/admin/controllers/adminController';
import type { AdminServiceInterface } from '@/api/features/admin/services/interfaces/adminService.interface';

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
    const mockAdminService: AdminServiceInterface = {
      getNewsSources: vi.fn().mockResolvedValue([]),
      createNewsSource: vi.fn(),
      updateNewsSource: vi.fn(),
      deleteNewsSource: vi.fn(),
      startCrawl: vi.fn(),
      getCrawlInterval: vi.fn().mockReturnValue({ intervalMinutes: 3 }),
      updateCrawlInterval: vi.fn().mockReturnValue({ intervalMinutes: 3 }),
      toggleDriftDetection: vi.fn().mockReturnValue({ message: 'Toggled' }),
      applyTemplate: vi.fn().mockReturnValue({ message: 'Applied' }),
      ingestHtml: vi.fn(),
    };

    const controller = new AdminController(mockAdminService);
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
    const mockAdminService = {
      getNewsSources: vi.fn(),
      createNewsSource: vi.fn(),
    } as unknown as AdminServiceInterface;

    const controller = new AdminController(mockAdminService);
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
});
