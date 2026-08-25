/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { createSessionMiddleware } from '@/api/middlewares/auth/session';
import { PrismaClient } from '../../../../../../generated/prisma/client';
import session from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';

vi.mock('express-session', () => ({
  default: vi.fn((opts) => opts),
}));

vi.mock('@quixo3/prisma-session-store', () => ({
  PrismaSessionStore: vi.fn(),
}));

describe('createSessionMiddleware', () => {
  it('should create session middleware with provided options', () => {
    const prismaMock = {} as PrismaClient;
    const result = createSessionMiddleware(prismaMock, {
      secret: 'my-secret',
      secureCookie: true,
    });

    expect(PrismaSessionStore).toHaveBeenCalledWith(
      prismaMock,
      expect.any(Object),
    );
    expect(session).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: 'my-secret',
        cookie: expect.objectContaining({
          secure: true,
        }),
      }),
    );

    expect(result).toBeDefined();
  });
});
