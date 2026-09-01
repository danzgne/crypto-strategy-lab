import { z } from 'zod';

const appConfigSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    BACKEND_HOST: z.string().min(1).default('0.0.0.0'),
    BACKEND_INSTANCE_ID: z.string().min(1).default('backend-local'),
    BACKEND_PORT: z.coerce.number().int().min(0).max(65_535).default(3100),
    BACKTEST_MAX_SELECTED_CANDLES: z.coerce
      .number()
      .int()
      .min(1)
      .default(100_000),
    DATABASE_URL: z.string().min(1),
    FRONTEND_ORIGIN: z.url().default('http://localhost:3000'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SESSION_SECRET: z.string().min(1).default('super-secret-key-for-dev'),
    SECURE_COOKIE: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    ADMIN_EMAIL: z
      .union([z.string().email(), z.literal('')])
      .optional()
      .transform((e) => (e === '' ? undefined : e)),
    ADMIN_DEFAULT_PASSWORD: z
      .union([z.string().min(8), z.literal('')])
      .optional()
      .transform((p) => (p === '' ? undefined : p)),
    GEMINI_API_KEY: z
      .string()
      .optional()
      .transform((k) => (k === '' ? undefined : k)),
    GROQ_API_KEY: z
      .string()
      .optional()
      .transform((k) => (k === '' ? undefined : k)),
  })
  .refine((data) => !data.ADMIN_EMAIL || data.ADMIN_DEFAULT_PASSWORD, {
    message: 'ADMIN_DEFAULT_PASSWORD is required when ADMIN_EMAIL is set',
    path: ['ADMIN_DEFAULT_PASSWORD'],
  });

export type AppConfig = {
  nodeEnv: z.infer<typeof appConfigSchema>['NODE_ENV'];
  host: string;
  instanceId: string;
  port: number;
  maxBacktestCandles: number;
  databaseUrl: string;
  frontendOrigin: string;
  logLevel: z.infer<typeof appConfigSchema>['LOG_LEVEL'];
  sessionSecret: string;
  secureCookie: boolean;
  adminEmail?: string | undefined;
  adminDefaultPassword?: string | undefined;
  geminiApiKey?: string | undefined;
  groqApiKey?: string | undefined;
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
    maxBacktestCandles: parsed.BACKTEST_MAX_SELECTED_CANDLES,
    databaseUrl: parsed.DATABASE_URL,
    frontendOrigin: parsed.FRONTEND_ORIGIN,
    logLevel: parsed.LOG_LEVEL,
    sessionSecret: parsed.SESSION_SECRET,
    secureCookie:
      parsed.SECURE_COOKIE !== undefined
        ? parsed.SECURE_COOKIE
        : parsed.NODE_ENV === 'production',
    adminEmail: parsed.ADMIN_EMAIL,
    adminDefaultPassword: parsed.ADMIN_DEFAULT_PASSWORD,
    geminiApiKey: parsed.GEMINI_API_KEY,
    groqApiKey: parsed.GROQ_API_KEY,
  };
}
