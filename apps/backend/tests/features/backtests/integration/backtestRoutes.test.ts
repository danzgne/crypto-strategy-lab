import type {
  BacktestResultResponse,
  BacktestSubmissionResponse,
} from '@crypto-strategy-lab/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '@/server';
import type { BacktestServiceInterface } from '@/api/features/backtests';

const queued: BacktestSubmissionResponse = {
  experimentId: 'experiment-1',
  jobId: 'job-1',
  status: 'queued',
};

describe('backtest routes', () => {
  it('requires an authenticated session', async () => {
    const app = createApp({
      authService:
        {} as unknown as import('@/api/features/auth').PasswordAuthServiceInterface,
      backtestService: createService(),
      healthRepository:
        {} as unknown as import('@/api/features/health').HealthRepository,
      sessionMiddleware: (_request, _response, next) => next(),
    });

    const response = await request(app).post('/api/v1/backtests').send({});

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: { code: 'UNAUTHORIZED' },
      success: false,
    });
  });

  it('submits and reads a backtest in the authenticated owner scope', async () => {
    const service = createService();
    const app = createApp({
      authService:
        {} as unknown as import('@/api/features/auth').PasswordAuthServiceInterface,
      backtestService: service,
      healthRepository:
        {} as unknown as import('@/api/features/health').HealthRepository,
      sessionMiddleware: (request, _response, next) => {
        request.session = { userId: 'owner-1' } as typeof request.session;
        next();
      },
    });

    const submitResponse = await request(app)
      .post('/api/v1/backtests')
      .send({ strategyId: 'ma' });
    const resultResponse = await request(app).get(
      '/api/v1/backtests/experiment-1',
    );

    expect(submitResponse.status).toBe(202);
    expect(submitResponse.body.data).toEqual(queued);
    expect(resultResponse.status).toBe(200);
    expect(service.submit).toHaveBeenCalledWith('owner-1', {
      strategyId: 'ma',
    });
    expect(service.get).toHaveBeenCalledWith('owner-1', 'experiment-1');
  });
});

function createService(): BacktestServiceInterface & {
  submit: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
} {
  const result: BacktestResultResponse = {
    candles: [],
    datasetFingerprint: null,
    endTime: 1,
    evaluatorVersion: 'default-v1',
    experimentId: 'experiment-1',
    failureReason: null,
    initialInvestment: '1000',
    jobId: 'job-1',
    metrics: null,
    pair: 'BTCUSDT',
    simulationRulesVersion: 'historical-v1',
    slippage: '0',
    startTime: 0,
    status: 'queued',
    strategyId: 'ma',
    strategyParams: {},
    strategyVersionId: 'version-1',
    timeframe: '1m',
    trades: [],
    transactionCost: '0',
  };
  return {
    get: vi.fn().mockResolvedValue(result),
    submit: vi.fn().mockResolvedValue(queued),
  };
}
