import session from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import { PrismaClient } from '../../../../../../generated/prisma/client';
import { Role } from '@crypto-strategy-lab/shared';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    role: Role;
  }
}

interface SessionOptions {
  secret: string;
  secureCookie?: boolean;
}

export function createSessionMiddleware(
  prisma: PrismaClient,
  { secret, secureCookie = false }: SessionOptions,
) {
  return session({
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
    },
    secret,
    resave: false,
    saveUninitialized: false,
    store: new PrismaSessionStore(prisma, {
      checkPeriod: 2 * 60 * 1000, // ms
      dbRecordIdIsSessionId: true,
    }) as unknown as session.Store,
  });
}
