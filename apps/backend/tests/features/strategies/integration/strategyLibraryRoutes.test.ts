import type { SavedStrategy } from '@crypto-strategy-lab/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '@/server';
import type { StrategyLibraryServiceInterface } from '@/api/features/strategies/library';

const savedStrategy: SavedStrategy = {
  createdAt: '2026-08-30T00:00:00.000Z',
  description: null,
  id: 'definition-id',
  kind: 'singular',
  name: 'Saved MA',
  params: { fast: 10, slow: 30 },
  strategyId: 'ma',
  versionId: 'version-id',
};

describe('strategy library routes', () => {
  it('requires an authenticated session', async () => {
    const app = createApp({
      authService:
        {} as unknown as import('@/api/features/auth').PasswordAuthServiceInterface,
      healthRepository:
        {} as unknown as import('@/api/features/health').HealthRepository,
      sessionMiddleware: (_req, _res, next) => next(),
      strategyLibraryService: createService(),
    });

    const response = await request(app).get('/api/v1/strategies');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: { code: 'UNAUTHORIZED' },
      success: false,
    });
  });

  it('lists and creates strategies in the authenticated owner scope', async () => {
    const service = createService();
    const app = createApp({
      authService:
        {} as unknown as import('@/api/features/auth').PasswordAuthServiceInterface,
      healthRepository:
        {} as unknown as import('@/api/features/health').HealthRepository,
      sessionMiddleware: (req, _res, next) => {
        req.session = { userId: 'owner-id' } as typeof req.session;
        next();
      },
      strategyLibraryService: service,
    });

    const listResponse = await request(app)
      .get('/api/v1/strategies')
      .set('Accept', 'application/json');
    const createResponse = await request(app)
      .post('/api/v1/strategies')
      .send({ name: 'Saved MA', strategyId: 'ma', params: { fast: 10 } });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toEqual([savedStrategy]);
    expect(createResponse.status).toBe(201);
    expect(service.list).toHaveBeenCalledWith('owner-id');
    expect(service.save).toHaveBeenCalledWith('owner-id', {
      name: 'Saved MA',
      params: { fast: 10 },
      strategyId: 'ma',
    });
  });
});

function createService(): StrategyLibraryServiceInterface {
  return {
    list: vi.fn().mockResolvedValue([savedStrategy]),
    save: vi.fn().mockResolvedValue(savedStrategy),
  };
}
