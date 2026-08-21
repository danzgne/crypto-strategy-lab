import { z } from 'zod';

const workerConfigSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z.string().min(1),
  WORKER_ID: z.string().min(1).default('backtest-worker-local'),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(250)
    .default(10_000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export interface WorkerConfig {
  databaseUrl: string;
  workerId: string;
  heartbeatIntervalMs: number;
  logLevel: z.infer<typeof workerConfigSchema>['LOG_LEVEL'];
}

export function readWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  const parsed = workerConfigSchema.parse(environment);
  return {
    databaseUrl: parsed.DATABASE_URL,
    workerId: parsed.WORKER_ID,
    heartbeatIntervalMs: parsed.WORKER_HEARTBEAT_INTERVAL_MS,
    logLevel: parsed.LOG_LEVEL,
  };
}
