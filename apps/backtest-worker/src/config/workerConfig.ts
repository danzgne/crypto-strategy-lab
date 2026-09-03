import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { z } from 'zod';

export function generateWorkerId(): string {
  const host =
    hostname()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 16) || 'host';
  const suffix = randomBytes(4).toString('hex');
  return `backtest-worker-${host}-${process.pid}-${suffix}`;
}

const workerConfigSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z.string().min(1),
  WORKER_ID: z.string().optional(),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(250)
    .default(10_000),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1_000),
  WORKER_LEASE_DURATION_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(5 * 60 * 1_000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export interface WorkerConfig {
  databaseUrl: string;
  workerId: string;
  heartbeatIntervalMs: number;
  pollIntervalMs: number;
  leaseDurationMs: number;
  logLevel: z.infer<typeof workerConfigSchema>['LOG_LEVEL'];
}

export function readWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const parsed = workerConfigSchema.parse(environment);
  const workerId =
    parsed.WORKER_ID && parsed.WORKER_ID.trim().length > 0
      ? parsed.WORKER_ID.trim()
      : generateWorkerId();

  return {
    databaseUrl: parsed.DATABASE_URL,
    workerId,
    heartbeatIntervalMs: parsed.WORKER_HEARTBEAT_INTERVAL_MS,
    leaseDurationMs: parsed.WORKER_LEASE_DURATION_MS,
    pollIntervalMs: parsed.WORKER_POLL_INTERVAL_MS,
    logLevel: parsed.LOG_LEVEL,
  };
}
