import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '@/server';

describe('health routes', () => {
  it('reports that the backend process is alive', async () => {
    const app = createApp({
      healthRepository: {
        checkConnection: vi.fn().mockResolvedValue(undefined),
        recordStarted: vi.fn().mockResolvedValue(undefined),
        recordStopped: vi.fn().mockResolvedValue(undefined),
      },
      authService:
        {} as unknown as import('@/api/features/auth').AuthServiceInterface,
      sessionMiddleware: (req, res, next) => next(),
    });

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toMatchObject({
      success: true,
      data: {
        service: 'backend',
        status: 'ok',
      },
      requestId: response.headers['x-request-id'],
    });
  });

  it('reports database readiness through the health repository', async () => {
    const checkConnection = vi.fn().mockResolvedValue(undefined);
    const app = createApp({
      healthRepository: {
        checkConnection,
        recordStarted: vi.fn().mockResolvedValue(undefined),
        recordStopped: vi.fn().mockResolvedValue(undefined),
      },
      authService:
        {} as unknown as import('@/api/features/auth').AuthServiceInterface,
      sessionMiddleware: (req, res, next) => next(),
    });

    const response = await request(app).get('/api/v1/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        database: 'connected',
        service: 'backend',
        status: 'ready',
      },
    });
    expect(checkConnection).toHaveBeenCalledOnce();
  });
});
