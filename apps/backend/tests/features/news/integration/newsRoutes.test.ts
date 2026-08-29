import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/server';
import { createPrismaClient } from '@/database/prismaClient';
import { createSessionMiddleware } from '@/api/middlewares/auth/session';
import { PrismaAuthRepository, PasswordAuthService } from '@/api/features/auth';
import {
  PrismaNewsRepository,
  NewsCrawler,
  NewsScheduler,
  NewsService,
} from '@/api/features/news';
import { InMemoryDomainEventBus } from '@/events/inMemoryDomainEventBus';
import { createAppLogger } from '@/utils/logger';
import { PrismaClient } from '../../../../../../generated/prisma/client';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: new URL('../../../../../../.env', import.meta.url) });

describe('News API Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  let prisma: PrismaClient;
  let adminCookie: string;
  let userCookie: string;
  let newsScheduler: NewsScheduler;

  beforeAll(async () => {
    prisma = createPrismaClient(
      process.env.DATABASE_URL ||
        'postgresql://crypto_lab:crypto_lab@localhost:5434/crypto_strategy_lab?schema=public',
    );
    await prisma.$connect();

    // Clean up test data
    await prisma.user.deleteMany({
      where: { email: { in: ['news-user@test.com', 'news-admin@test.com'] } },
    });
    await prisma.newsCrawlAttempt.deleteMany({});
    await prisma.newsItem.deleteMany({});
    await prisma.newsSource.deleteMany({});

    const sessionMiddleware = createSessionMiddleware(prisma, {
      secret: 'test-session-secret',
    });
    const authRepository = new PrismaAuthRepository(prisma);
    const authService = new PasswordAuthService(authRepository);

    await authService.register('news-user@test.com', 'userpass123');
    const admin = await authService.register(
      'news-admin@test.com',
      'adminpass123',
    );
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });

    const eventBus = new InMemoryDomainEventBus();
    const logger = createAppLogger({ service: 'test', enabled: false });
    const newsRepository = new PrismaNewsRepository(prisma);
    const newsCrawler = new NewsCrawler({
      newsRepository,
      eventPublisher: eventBus,
      logger,
    });
    newsScheduler = new NewsScheduler({
      crawler: newsCrawler,
      logger,
      initialIntervalMinutes: 3,
      autoStart: false,
    });
    const newsService = new NewsService({
      newsRepository,
      crawler: newsCrawler,
      scheduler: newsScheduler,
    });

    app = createApp({
      healthRepository:
        {} as unknown as import('@/api/features/health').HealthRepository,
      authService,
      newsService,
      sessionMiddleware,
    });

    // Login user
    const userLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'news-user@test.com', password: 'userpass123' });
    userCookie = userLoginRes.headers['set-cookie']?.[0] || '';

    // Login admin
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'news-admin@test.com', password: 'adminpass123' });
    adminCookie = adminLoginRes.headers['set-cookie']?.[0] || '';
  });

  afterAll(async () => {
    newsScheduler.stop();
    await prisma.user.deleteMany({
      where: { email: { in: ['news-user@test.com', 'news-admin@test.com'] } },
    });
    await prisma.newsCrawlAttempt.deleteMany({});
    await prisma.newsItem.deleteMany({});
    await prisma.newsSource.deleteMany({});
    await prisma.$disconnect();
  });

  it('admin should create a news source', async () => {
    const res = await request(app)
      .post('/api/v1/admin/news-sources')
      .set('Cookie', adminCookie)
      .send({
        name: 'Custom Test RSS',
        url: 'https://test-unique-feed.example.com/rss',
        providerType: 'RSS',
        isActive: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Custom Test RSS');
  });

  it('users can list news sources', async () => {
    const res = await request(app).get('/api/v1/news/sources');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(
      res.body.data.some((s: { name: string }) => s.name === 'Custom Test RSS'),
    ).toBe(true);
  });

  it('admin can ingest raw HTML article', async () => {
    const res = await request(app)
      .post('/api/v1/admin/ingest/html')
      .set('Cookie', adminCookie)
      .send({
        title: 'Vitalik Outlines Ethereum Roadmap',
        html: '<p>Vitalik Buterin shared direction for Ethereum scaling post-Pectra upgrade.</p>',
        source: 'Bankless',
        url: 'https://bankless.com/vitalik-roadmap',
        relatedCoins: ['ETH'],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Vitalik Outlines Ethereum Roadmap');
    expect(res.body.data.relatedCoins).toContain('ETH');
  });

  it('regular users cannot ingest raw HTML (forbidden)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/ingest/html')
      .set('Cookie', userCookie)
      .send({
        title: 'Hacked Article',
        html: '<p>Fake news</p>',
      });

    expect(res.status).toBe(403);
  });

  it('users can query news items with filters', async () => {
    const res = await request(app).get('/api/v1/news?coin=ETH');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].title).toBe(
      'Vitalik Outlines Ethereum Roadmap',
    );
  });

  it('regular users can fetch crawl interval', async () => {
    const res = await request(app)
      .get('/api/v1/news/interval')
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.intervalMinutes).toBe(3);
  });

  it('admin can update crawl interval and regular users see updated interval', async () => {
    const updateRes = await request(app)
      .put('/api/v1/admin/crawl/interval')
      .set('Cookie', adminCookie)
      .send({ intervalMinutes: 5 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.intervalMinutes).toBe(5);

    const getRes = await request(app)
      .get('/api/v1/news/interval')
      .set('Cookie', userCookie);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.intervalMinutes).toBe(5);
  });

  it('returns news statistics', async () => {
    const res = await request(app).get('/api/v1/news/stats');
    expect(res.status).toBe(200);
    expect(res.body.data.totalItems).toBeGreaterThanOrEqual(1);
    expect(res.body.data.totalSources).toBeGreaterThanOrEqual(1);
    expect(res.body.data.coveragePercent).toBeGreaterThanOrEqual(0);
  });
});
