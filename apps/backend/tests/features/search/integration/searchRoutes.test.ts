import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchController } from '@/api/features/search/controllers/searchController';
import { UnsupportedAlgorithmError } from '@/api/features/search/generators';
import { createSearchFeatureRouter } from '@/api/features/search/routes/v1/search.routes';
import type { SearchScheduler } from '@/api/features/search/services/searchScheduler';
import type { TradeRetentionService } from '@/api/features/search/services/tradeRetentionService';
import { defaultSearchSpace } from '../../../helpers/searchFixtures';

describe('search routes integration', () => {
  let app: express.Express;
  let fakeScheduler: {
    getHistoricalRuns: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
    pauseSession: ReturnType<typeof vi.fn>;
    resumeSession: ReturnType<typeof vi.fn>;
    startSession: ReturnType<typeof vi.fn>;
    stopSession: ReturnType<typeof vi.fn>;
  };
  let fakeTradeRetention: {
    setExperimentPinned: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    fakeScheduler = {
      getHistoricalRuns: vi.fn(async () => []),
      getSession: vi.fn(),
      pauseSession: vi.fn(async () => true),
      resumeSession: vi.fn(async () => true),
      startSession: vi.fn(),
      stopSession: vi.fn(async () => true),
    };
    fakeTradeRetention = {
      setExperimentPinned: vi.fn(async () => true),
    };

    const controller = new SearchController(
      fakeScheduler as unknown as SearchScheduler,
      fakeTradeRetention as unknown as TradeRetentionService,
    );

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (
        req as unknown as { session?: { userId?: string; role?: string } }
      ).session = {
        role: 'USER',
        userId: 'user-integration-1',
      };
      next();
    });
    app.use('/api/v1/search', createSearchFeatureRouter(controller));
  });

  it('starts a new discovery session', async () => {
    fakeScheduler.startSession.mockResolvedValue({
      algorithm: 'random-v1',
      bestScore: null,
      searchSpace: defaultSearchSpace,
      sessionId: 'sess-123',
      startedAt: Date.now(),
      status: 'ACTIVE',
      stopPolicy: {},
      totalAcceptedCandidates: 0,
      totalRunsCompleted: 0,
      userId: 'user-integration-1',
    });

    const res = await request(app)
      .post('/api/v1/search/sessions')
      .send({ algorithm: 'random-v1', searchSpace: defaultSearchSpace });

    expect(res.status).toBe(201);
    expect(res.body.session.sessionId).toBe('sess-123');
    expect(fakeScheduler.startSession).toHaveBeenCalledWith({
      algorithm: 'random-v1',
      searchSpace: defaultSearchSpace,
      stopPolicy: undefined,
      userId: 'user-integration-1',
    });
  });

  it('rejects starting a session with an unsupported algorithm', async () => {
    fakeScheduler.startSession.mockRejectedValue(
      new UnsupportedAlgorithmError('domain-guided'),
    );

    const res = await request(app)
      .post('/api/v1/search/sessions')
      .send({ algorithm: 'domain-guided', searchSpace: defaultSearchSpace });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_ALGORITHM');
    expect(res.body.algorithm).toBe('domain-guided');
  });

  it('gets current session', async () => {
    fakeScheduler.getSession.mockReturnValue({
      algorithm: 'random',
      bestScore: 1.2,
      sessionId: 'sess-123',
      status: 'ACTIVE',
    });

    const res = await request(app).get('/api/v1/search/sessions/current');
    expect(res.status).toBe(200);
    expect(res.body.session.sessionId).toBe('sess-123');
  });

  it('pauses, resumes, and stops session', async () => {
    const pauseRes = await request(app).post('/api/v1/search/sessions/pause');
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.status).toBe('PAUSED');

    const resumeRes = await request(app).post('/api/v1/search/sessions/resume');
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.status).toBe('ACTIVE');

    const stopRes = await request(app).post('/api/v1/search/sessions/stop');
    expect(stopRes.status).toBe(200);
    expect(stopRes.body.status).toBe('STOPPED');
  });

  it('pins an experiment', async () => {
    const res = await request(app)
      .post('/api/v1/search/experiments/exp-123/pin')
      .send({ isPinned: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ experimentId: 'exp-123', isPinned: true });
    expect(fakeTradeRetention.setExperimentPinned).toHaveBeenCalledWith(
      'exp-123',
      'user-integration-1',
      true,
    );
  });
});
