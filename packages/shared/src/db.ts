import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../.env') });
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { BacktestQueue } from './queue';

export function getDatabaseUrl() {
  let url = process.env.DATABASE_URL;
  if (!url) {
    return 'postgres://postgres:postgres@localhost:5432/postgres';
  }
  
  // If using Prisma Postgres (Local or Cloud) which gives a prisma+postgres:// URL
  if (url.startsWith('prisma+postgres://')) {
    try {
      const urlObj = new URL(url);
      const apiKey = urlObj.searchParams.get('api_key');
      if (apiKey) {
        // decode base64url payload
        const base64 = apiKey.replace(/-/g, '+').replace(/_/g, '/');
        const payload = Buffer.from(base64, 'base64').toString('utf8');
        const data = JSON.parse(payload);
        if (data.databaseUrl) return data.databaseUrl;
      }
    } catch (e) {
      console.warn('Failed to parse prisma+postgres URL, falling back to raw url', e);
    }
  }
  
  return url;
}

const connectionString = getDatabaseUrl();
export const pool = new Pool({ connectionString });
export const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
export const queue = new BacktestQueue(prisma);
