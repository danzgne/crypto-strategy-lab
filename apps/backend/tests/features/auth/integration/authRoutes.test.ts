import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '@/server';
import { createPrismaClient } from '@/database/prismaClient';
import { createSessionMiddleware } from '@/api/middlewares/auth/session';
import { PrismaAuthRepository } from '@/api/features/auth/repositories/prismaAuthRepository';
import { PasswordAuthService } from '@/api/features/auth/services/authService';
import { PrismaClient } from '../../../../../../generated/prisma/client';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: new URL('../../../../../../.env', import.meta.url) });

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

    const sessionMiddleware = createSessionMiddleware(prisma, {
      secret: 'test-session-secret',
    });
    const authRepository = new PrismaAuthRepository(prisma);
    const authService = new PasswordAuthService(authRepository);

    // Create admin user for testing
    const admin = await authService.register('admin@test.com', 'adminpass');
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });

    app = createApp({
      healthRepository:
        {} as unknown as import('@/api/features/health').HealthRepository,
      authService,
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
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('test-user@test.com');
    expect(res.body.data.role).toBe('USER');
    expect(res.headers['set-cookie']).toBeDefined();
    userCookie = res.headers['set-cookie']![0] as string;
  });

  it('should login as admin', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'adminpass' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe('ADMIN');
    expect(res.headers['set-cookie']).toBeDefined();
    adminCookie = res.headers['set-cookie']![0] as string;
  });

  it('should get current user info with session', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', userCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('test-user@test.com');
  });

  it('should reject unauthenticated access to admin routes', async () => {
    const res = await request(app).post('/api/v1/admin/news-sources');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should reject standard user access to admin routes', async () => {
    const res = await request(app)
      .post('/api/v1/admin/news-sources')
      .set('Cookie', userCookie);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should allow admin access to admin routes', async () => {
    const res = await request(app)
      .post('/api/v1/admin/news-sources')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('News sources configured');
  });
});
