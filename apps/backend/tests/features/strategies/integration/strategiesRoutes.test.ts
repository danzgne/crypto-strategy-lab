import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/server';
import { createPrismaClient } from '@/database/prismaClient';
import { createSessionMiddleware } from '@/api/middlewares/auth/session';
import { PrismaAuthRepository, PasswordAuthService } from '@/api/features/auth';
import {
  PrismaStrategyLibraryRepository,
  StrategyGenerationService,
  StrategyLibraryService,
} from '@/api/features/strategies';
import type {
  LlmJsonGenerateInput,
  LlmJsonGenerateResult,
  LlmJsonProvider,
} from '@/llm/llmJsonProvider.interface';
import type { GenerationWireResponse } from '@/api/features/strategies/generation/wireSchema';
import { PrismaClient } from '../../../../../../generated/prisma/client';

function validWireResponse(
  overrides: Partial<GenerationWireResponse> = {},
): GenerationWireResponse {
  return {
    name: 'RSI_LONG',
    description: 'Long when RSI drops below 30',
    tags: ['rsi'],
    indicators: [{ name: 'RSI', as: null, period: 14 }],
    conditions: {
      long: [
        { indicator: 'RSI', operator: '<', value: 30, indicatorRef: null },
      ],
      short: [],
    },
    riskManagement: null,
    timeframe: '1h',
    applicability: { pairsMode: 'USDT_ALL', customPairs: null },
    unsupportedRequests: [],
    ...overrides,
  };
}

class ScriptedLlmJsonProvider implements LlmJsonProvider {
  public readonly name = 'scripted';

  public constructor(
    private result: LlmJsonGenerateResult<unknown> = {
      outcome: 'SUCCESS',
      value: validWireResponse(),
      generatedBy: 'groq',
    },
  ) {}

  public setResult(result: LlmJsonGenerateResult<unknown>): void {
    this.result = result;
  }

  public async generate<T>(
    _input: LlmJsonGenerateInput<T>,
  ): Promise<LlmJsonGenerateResult<T>> {
    return this.result as LlmJsonGenerateResult<T>;
  }
}

describe('Strategies API Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  let prisma: PrismaClient;
  let userCookie: string;
  let otherUserCookie: string;
  const llmProvider = new ScriptedLlmJsonProvider();

  beforeAll(async () => {
    prisma = createPrismaClient(
      process.env.DATABASE_URL ||
        'postgresql://crypto_lab:crypto_lab@localhost:5434/crypto_strategy_lab?schema=public',
    );
    await prisma.$connect();

    await cleanupStrategyTestUsers(prisma);

    const sessionMiddleware = createSessionMiddleware(prisma, {
      secret: 'test-session-secret',
    });
    const authRepository = new PrismaAuthRepository(prisma);
    const authService = new PasswordAuthService(authRepository);
    await authService.register('strategies-user@test.com', 'userpass123');
    await authService.register('strategies-other@test.com', 'otherpass123');

    const generationService = new StrategyGenerationService({ llmProvider });
    const libraryService = new StrategyLibraryService({
      repository: new PrismaStrategyLibraryRepository(prisma),
    });

    app = createApp({
      healthRepository:
        {} as unknown as import('@/api/features/health').HealthRepository,
      authService,
      sessionMiddleware,
      strategies: { generationService, libraryService },
    });

    const userLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'strategies-user@test.com', password: 'userpass123' });
    userCookie = userLoginRes.headers['set-cookie']?.[0] || '';

    const otherLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'strategies-other@test.com', password: 'otherpass123' });
    otherUserCookie = otherLoginRes.headers['set-cookie']?.[0] || '';
  });

  afterAll(async () => {
    await cleanupStrategyTestUsers(prisma);
    await prisma.$disconnect();
  });

  describe('POST /api/v1/strategies/generate', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/strategies/generate')
        .send({ kind: 'USER_PROMPT', input: 'Long when RSI under 30' });

      expect(res.status).toBe(401);
    });

    it('returns generated params for a USER_PROMPT input', async () => {
      llmProvider.setResult({
        outcome: 'SUCCESS',
        value: validWireResponse(),
        generatedBy: 'groq',
      });

      const res = await request(app)
        .post('/api/v1/strategies/generate')
        .set('Cookie', userCookie)
        .send({ kind: 'USER_PROMPT', input: 'Long when RSI under 30' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.generatedBy).toBe('groq');
      expect(res.body.data.params.conditions.long).toEqual([
        { indicator: 'RSI', operator: '<', value: 30 },
      ]);
      expect(res.body.data.unsupportedRequests).toEqual([]);
    });

    it('rejects a missing kind with VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/strategies/generate')
        .set('Cookie', userCookie)
        .send({ input: 'Long when RSI under 30' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a WEB_IMPORT input that is not a URL', async () => {
      const res = await request(app)
        .post('/api/v1/strategies/generate')
        .set('Cookie', userCookie)
        .send({ kind: 'WEB_IMPORT', input: 'not a url' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a WEB_IMPORT input pointing at a private address', async () => {
      const res = await request(app)
        .post('/api/v1/strategies/generate')
        .set('Cookie', userCookie)
        .send({ kind: 'WEB_IMPORT', input: 'http://169.254.169.254/' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('EXTRACTION_FAILED');
    });

    it('returns LLM_UNAVAILABLE when every provider is unavailable', async () => {
      llmProvider.setResult({ outcome: 'ALL_PROVIDERS_UNAVAILABLE' });

      const res = await request(app)
        .post('/api/v1/strategies/generate')
        .set('Cookie', userCookie)
        .send({ kind: 'USER_PROMPT', input: 'anything' });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('LLM_UNAVAILABLE');
    });

    it('returns GENERATION_INVALID on schema-invalid output', async () => {
      llmProvider.setResult({
        outcome: 'SCHEMA_INVALID',
        issues: [{ path: 'indicators', message: 'Required' }],
      });

      const res = await request(app)
        .post('/api/v1/strategies/generate')
        .set('Cookie', userCookie)
        .send({ kind: 'USER_PROMPT', input: 'anything' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('GENERATION_INVALID');
    });
  });

  describe('POST /api/v1/strategies/validate', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/strategies/validate')
        .send({ params: {} });

      expect(res.status).toBe(401);
    });

    it('returns valid:true without persisting anything', async () => {
      const res = await request(app)
        .post('/api/v1/strategies/validate')
        .set('Cookie', userCookie)
        .send({
          params: {
            indicators: [{ name: 'RSI', period: 14 }],
            conditions: {
              long: [{ indicator: 'RSI', operator: '<', value: 30 }],
              short: [],
            },
            timeframe: '1h',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ valid: true });
    });

    it('returns valid:false with the constructor message on broken params', async () => {
      const res = await request(app)
        .post('/api/v1/strategies/validate')
        .set('Cookie', userCookie)
        .send({
          params: { indicators: [], conditions: { long: [], short: [] } },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(typeof res.body.data.message).toBe('string');
    });
  });

  describe('POST /api/v1/strategies (save)', () => {
    it('requires authentication', async () => {
      const res = await request(app).post('/api/v1/strategies').send({
        name: 'RSI_LONG',
        source: 'USER_PROMPT',
        sourceInput: 'Long when RSI under 30',
        strategyId: 'rule',
        params: validWireResponse(),
      });

      expect(res.status).toBe(401);
    });

    it('persists a Strategy Library entry with its first version', async () => {
      const res = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({
          name: 'RSI_LONG',
          tags: ['rsi'],
          source: 'USER_PROMPT',
          sourceInput: 'Long when RSI under 30',
          strategyId: 'rule',
          params: {
            indicators: [{ name: 'RSI', period: 14 }],
            conditions: {
              long: [{ indicator: 'RSI', operator: '<', value: 30 }],
              short: [],
            },
            timeframe: '1h',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('RSI_LONG');
      expect(res.body.data.source).toBe('USER_PROMPT');
      expect(res.body.data.kind).toBe('singular');
      expect(res.body.data.strategyId).toBe('rule');
      expect(res.body.data.latestVersion.libraryVersion).toBe('1.0.0');
      expect(res.body.data.latestVersion.versionTag).toMatch(/^[0-9a-f]{64}$/);

      const stored = await prisma.strategyDefinition.findUnique({
        where: { id: res.body.data.id },
        include: { versions: true },
      });
      expect(stored?.source).toBe('USER_PROMPT');
      expect(stored?.sourceInput).toBe('Long when RSI under 30');
      expect(stored?.recordKind).toBe('LIBRARY_ENTRY');
      expect(stored?.versions).toHaveLength(1);
    });

    it('returns 422 for params the RuleStrategy constructor rejects', async () => {
      const res = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({
          name: 'BROKEN',
          source: 'USER_PROMPT',
          sourceInput: 'anything',
          strategyId: 'rule',
          params: { indicators: [], conditions: { long: [], short: [] } },
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INVALID_STRATEGY');
    });

    it('rejects a MANUAL entry that also carries sourceInput text', async () => {
      const res = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({ name: 'Forked MA', source: 'MANUAL', strategyId: 'ma' });

      expect(res.status).toBe(201);
      expect(res.body.data.sourceInput).toBeNull();
    });

    it('persists a composite entry with its inline member snapshot', async () => {
      const res = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({
          name: 'Momentum pair',
          source: 'MANUAL',
          strategyId: 'composite',
          composite: {
            mode: 'weighted',
            threshold: 0.3,
            members: [
              { strategyId: 'ma', params: { fast: 10 }, weight: 2 },
              { strategyId: 'rsi', params: { period: 14 }, weight: 1 },
            ],
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.kind).toBe('composite');
      expect(res.body.data.strategyId).toBe('composite');
      expect(res.body.data.latestVersion.composite.members).toHaveLength(2);
    });
  });

  describe('GET /api/v1/strategies', () => {
    it('serves built-in strategies without required params, alongside owner entries', async () => {
      const res = await request(app)
        .get('/api/v1/strategies')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(
        res.body.data.builtins.some(
          (builtin: { strategyId: string }) => builtin.strategyId === 'ma',
        ),
      ).toBe(true);
      expect(
        res.body.data.builtins.some(
          (builtin: { strategyId: string }) => builtin.strategyId === 'rule',
        ),
      ).toBe(false);
    });

    it('lists only the current owner entries, newest first', async () => {
      await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', otherUserCookie)
        .send({
          name: 'OTHER_USER_STRATEGY',
          source: 'WEB_IMPORT',
          sourceInput: 'https://example.com/strategy',
          strategyId: 'rule',
          params: {
            indicators: [{ name: 'RSI', period: 14 }],
            conditions: {
              long: [{ indicator: 'RSI', operator: '<', value: 20 }],
              short: [],
            },
            timeframe: '1h',
          },
        });

      const res = await request(app)
        .get('/api/v1/strategies')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(
        res.body.data.entries.some(
          (entry: { name: string }) => entry.name === 'OTHER_USER_STRATEGY',
        ),
      ).toBe(false);
      expect(
        res.body.data.entries.some(
          (entry: { name: string }) => entry.name === 'RSI_LONG',
        ),
      ).toBe(true);
    });

    it('excludes archived entries unless archived=true is requested', async () => {
      const created = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({ name: 'Archive me', source: 'MANUAL', strategyId: 'ma' });
      const entryId = created.body.data.id;
      await request(app)
        .patch(`/api/v1/strategies/${entryId}/archive`)
        .set('Cookie', userCookie)
        .send({ archived: true });

      const hidden = await request(app)
        .get('/api/v1/strategies')
        .set('Cookie', userCookie);
      expect(
        hidden.body.data.entries.some(
          (entry: { id: string }) => entry.id === entryId,
        ),
      ).toBe(false);

      const shown = await request(app)
        .get('/api/v1/strategies?archived=true')
        .set('Cookie', userCookie);
      expect(
        shown.body.data.entries.some(
          (entry: { id: string }) => entry.id === entryId,
        ),
      ).toBe(true);
    });
  });

  describe('GET /api/v1/strategies/:id', () => {
    it('returns the full version history for the owner', async () => {
      const created = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({ name: 'MA drilldown', source: 'MANUAL', strategyId: 'ma' });
      const entryId = created.body.data.id;

      const res = await request(app)
        .get(`/api/v1/strategies/${entryId}`)
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.versions).toHaveLength(1);
    });

    it('returns 404, not the entry, for another owner', async () => {
      const created = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({ name: 'Owner-only', source: 'MANUAL', strategyId: 'ma' });
      const entryId = created.body.data.id;

      const res = await request(app)
        .get(`/api/v1/strategies/${entryId}`)
        .set('Cookie', otherUserCookie);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/strategies/:id', () => {
    it('updates entry metadata for the owner', async () => {
      const created = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({ name: 'Rename me', source: 'MANUAL', strategyId: 'ma' });
      const entryId = created.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/strategies/${entryId}`)
        .set('Cookie', userCookie)
        .send({ name: 'Renamed', tags: ['trend'] });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Renamed');
      expect(res.body.data.tags).toEqual(['trend']);
    });

    it('returns 404 for another owner instead of leaking or editing the entry', async () => {
      const created = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({ name: 'Not yours', source: 'MANUAL', strategyId: 'ma' });
      const entryId = created.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/strategies/${entryId}`)
        .set('Cookie', otherUserCookie)
        .send({ name: 'Hijacked' });

      expect(res.status).toBe(404);
      const stillOriginal = await prisma.strategyDefinition.findUnique({
        where: { id: entryId },
      });
      expect(stillOriginal?.name).toBe('Not yours');
    });
  });

  describe('POST /api/v1/strategies/:id/versions', () => {
    it('appends an immutable Strategy Version for the owner', async () => {
      const created = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({
          name: 'MA edit',
          source: 'MANUAL',
          strategyId: 'ma',
          params: { fast: 20, slow: 50 },
        });
      const entryId = created.body.data.id;

      const res = await request(app)
        .post(`/api/v1/strategies/${entryId}/versions`)
        .set('Cookie', userCookie)
        .send({ libraryVersion: '1.1.0', params: { fast: 5, slow: 50 } });

      expect(res.status).toBe(201);
      expect(res.body.data.versions).toHaveLength(2);
      expect(res.body.data.latestVersion.libraryVersion).toBe('1.1.0');
    });

    it('creates a new version instead of erroring when only the Library Version changes', async () => {
      const created = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({
          name: 'MA label-only change',
          source: 'MANUAL',
          strategyId: 'ma',
          params: { fast: 20, slow: 50 },
        });
      const entryId = created.body.data.id;
      const firstVersionId = created.body.data.latestVersion.id;

      const res = await request(app)
        .post(`/api/v1/strategies/${entryId}/versions`)
        .set('Cookie', userCookie)
        .send({ libraryVersion: '1.0.1', params: { fast: 20, slow: 50 } });

      expect(res.status).toBe(201);
      expect(res.body.data.versions).toHaveLength(2);
      expect(res.body.data.latestVersion.libraryVersion).toBe('1.0.1');
      expect(res.body.data.latestVersion.id).not.toBe(firstVersionId);
    });

    it('rejects a Library Version already used inside the entry', async () => {
      const created = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({
          name: 'MA dup',
          source: 'MANUAL',
          strategyId: 'ma',
          libraryVersion: '1.0.0',
        });
      const entryId = created.body.data.id;

      const res = await request(app)
        .post(`/api/v1/strategies/${entryId}/versions`)
        .set('Cookie', userCookie)
        .send({ libraryVersion: '1.0.0', params: { fast: 5, slow: 50 } });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_LIBRARY_VERSION');
    });

    it('returns 404 for another owner instead of appending to the entry', async () => {
      const created = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({
          name: 'Owned version history',
          source: 'MANUAL',
          strategyId: 'ma',
        });
      const entryId = created.body.data.id;

      const res = await request(app)
        .post(`/api/v1/strategies/${entryId}/versions`)
        .set('Cookie', otherUserCookie)
        .send({ libraryVersion: '1.1.0', params: { fast: 5 } });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/strategies/:id/archive', () => {
    it('archives, and un-archives, an owned entry', async () => {
      const created = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({ name: 'Archive toggle', source: 'MANUAL', strategyId: 'ma' });
      const entryId = created.body.data.id;

      const archived = await request(app)
        .patch(`/api/v1/strategies/${entryId}/archive`)
        .set('Cookie', userCookie)
        .send({ archived: true });
      expect(archived.status).toBe(200);
      expect(archived.body.data.archivedAt).not.toBeNull();

      const restored = await request(app)
        .patch(`/api/v1/strategies/${entryId}/archive`)
        .set('Cookie', userCookie)
        .send({ archived: false });
      expect(restored.status).toBe(200);
      expect(restored.body.data.archivedAt).toBeNull();
    });

    it('returns 404 for another owner instead of archiving the entry', async () => {
      const created = await request(app)
        .post('/api/v1/strategies')
        .set('Cookie', userCookie)
        .send({
          name: 'Not archivable by others',
          source: 'MANUAL',
          strategyId: 'ma',
        });
      const entryId = created.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/strategies/${entryId}/archive`)
        .set('Cookie', otherUserCookie)
        .send({ archived: true });

      expect(res.status).toBe(404);
      const stillLive = await prisma.strategyDefinition.findUnique({
        where: { id: entryId },
      });
      expect(stillLive?.archivedAt).toBeNull();
    });
  });
});

async function cleanupStrategyTestUsers(prisma: PrismaClient): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true },
    where: {
      email: {
        in: ['strategies-user@test.com', 'strategies-other@test.com'],
      },
    },
  });
  const ownerIds = users.map(({ id }) => id);
  if (ownerIds.length === 0) return;

  await prisma.backtestJob.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.trade.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.experiment.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.strategyVersion.deleteMany({
    where: { ownerId: { in: ownerIds } },
  });
  await prisma.strategyDefinition.deleteMany({
    where: { ownerId: { in: ownerIds } },
  });
  await prisma.searchRun.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.leaderboard.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
}
