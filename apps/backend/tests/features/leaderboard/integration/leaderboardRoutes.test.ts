import type {
  LeaderboardResponse,
  LeaderboardEntrySnapshot,
} from '@crypto-strategy-lab/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { LeaderboardServiceInterface } from '@/api/features/leaderboard';
import { createApp } from '@/server';

const entries: LeaderboardEntrySnapshot[] = [
  {
    endTime: 2,
    experimentId: 'experiment-1',
    maxDrawdown: '0.1',
    memberStrategies: [
      { label: 'MA', strategyId: 'ma' },
      { label: 'RSI', strategyId: 'rsi' },
    ],
    pair: 'BTCUSDT',
    rank: 1,
    return: '0.2',
    score: '0.8',
    startTime: 1,
    strategyDisplayName: 'MA + RSI',
    strategyVersionId: 'version-1',
    timeframe: '1m',
    totalProfit: '100',
    totalTrades: 4,
    winRate: '0.75',
  },
];

describe('leaderboard routes', () => {
  it('requires an authenticated session', async () => {
    const app = createApp({
      authService:
        {} as unknown as import('@/api/features/auth').PasswordAuthServiceInterface,
      healthRepository:
        {} as unknown as import('@/api/features/health').HealthRepository,
      leaderboardService: createService(),
      sessionMiddleware: (_request, _response, next) => next(),
    });

    const response = await request(app).get('/api/v1/leaderboard');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: { code: 'UNAUTHORIZED' },
      success: false,
    });
  });

  it('returns only the authenticated user board without accepting an owner query', async () => {
    const service = createService();
    const app = createApp({
      authService:
        {} as unknown as import('@/api/features/auth').PasswordAuthServiceInterface,
      healthRepository:
        {} as unknown as import('@/api/features/health').HealthRepository,
      leaderboardService: service,
      sessionMiddleware: (request, _response, next) => {
        request.session = { userId: 'owner-1' } as typeof request.session;
        next();
      },
    });

    const response = await request(app)
      .get('/api/v1/leaderboard')
      .query({ ownerId: 'owner-2', limit: 1 });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      entries,
      k: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    } satisfies LeaderboardResponse);
    expect(service.get).toHaveBeenCalledWith('owner-1');
  });
});

function createService(): LeaderboardServiceInterface & {
  get: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn().mockResolvedValue({
      entries,
      k: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    } satisfies LeaderboardResponse),
  };
}
