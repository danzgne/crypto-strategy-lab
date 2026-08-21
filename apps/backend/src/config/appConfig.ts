import { z } from 'zod';

const appConfigSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  BACKEND_HOST: z.string().min(1).default('0.0.0.0'),
  BACKEND_INSTANCE_ID: z.string().min(1).default('backend-local'),
  BACKEND_PORT: z.coerce.number().int().min(0).max(65_535).default(3100),
  DATABASE_URL: z.string().min(1),
  FRONTEND_ORIGIN: z.url().default('http://localhost:3000'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type AppConfig = {
  nodeEnv: z.infer<typeof appConfigSchema>['NODE_ENV'];
  host: string;
  instanceId: string;
  port: number;
  databaseUrl: string;
  frontendOrigin: string;
  logLevel: z.infer<typeof appConfigSchema>['LOG_LEVEL'];
};

export function readAppConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = appConfigSchema.parse(environment);

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.BACKEND_HOST,
    instanceId: parsed.BACKEND_INSTANCE_ID,
    port: parsed.BACKEND_PORT,
    databaseUrl: parsed.DATABASE_URL,
    frontendOrigin: parsed.FRONTEND_ORIGIN,
    logLevel: parsed.LOG_LEVEL,
  };
}
