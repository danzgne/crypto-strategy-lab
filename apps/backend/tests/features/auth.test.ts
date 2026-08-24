import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server';
import { createPrismaClient } from '../../src/database/prismaClient';
import { createSessionMiddleware } from '../../src/auth/session';
import { PostgresAuthProvider } from '../../src/auth/provider';
import { PrismaClient } from '../../../../generated/prisma/client';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: new URL('../../../../.env', import.meta.url) });

describe('Auth & Admin API', () => {
  let app: ReturnType<typeof createApp>;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createPrismaClient(
      process.env.DATABASE_URL ||
        'postgresql://crypto_lab:crypto_lab@localhost:5434/crypto_strategy_lab?schema=public',
    );
    await prisma.$connect();

    // Clean up test users
    await prisma.user.deleteMany({
      where: { email: { in: ['test-user@test.com', 'admin@test.com'] } },
    });

    const sessionMiddleware = createSessionMiddleware(prisma);
    const authProvider = new PostgresAuthProvider(prisma);

    // Create admin user for testing
    const admin = await authProvider.register('admin@test.com', 'adminpass');
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });

    app = createApp({
      healthRepository:
        {} as unknown as import('../../src/api/features/health').HealthRepository,
      authProvider,
      sessionMiddleware,
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: ['test-user@test.com', 'admin@test.com'] } },
    });
    await prisma.$disconnect();
  });

  let userCookie: string;
  let adminCookie: string;

  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test-user@test.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('test-user@test.com');
    expect(res.body.role).toBe('USER');
    expect(res.headers['set-cookie']).toBeDefined();
    userCookie = res.headers['set-cookie']![0] as string;
  });

  it('should login as admin', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'adminpass' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ADMIN');
    expect(res.headers['set-cookie']).toBeDefined();
    adminCookie = res.headers['set-cookie']![0] as string;
  });

  it('should get current user info with session', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', userCookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('test-user@test.com');
  });

  it('should reject unauthenticated access to admin routes', async () => {
    const res = await request(app).post('/api/v1/admin/news-sources');
    expect(res.status).toBe(401);
  });

  it('should reject standard user access to admin routes', async () => {
    const res = await request(app)
      .post('/api/v1/admin/news-sources')
      .set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });

  it('should allow admin access to admin routes', async () => {
    const res = await request(app)
      .post('/api/v1/admin/news-sources')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('News sources configured');
  });
});
