import { PrismaPg } from '@prisma/adapter-pg';

import { Prisma, PrismaClient } from '../../../../generated/prisma/client';

export type AppPrismaClient = PrismaClient;
export { Prisma };

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
