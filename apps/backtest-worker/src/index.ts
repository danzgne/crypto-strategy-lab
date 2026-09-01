import { config as loadEnvironment } from 'dotenv';
import '@crypto-strategy-lab/strategy-engine/strategies';

import { readWorkerConfig } from './config/workerConfig';
import { createPrismaClient } from './database/prismaClient';
import { PrismaServiceHeartbeatRepository } from './repositories/prisma/prismaServiceHeartbeatRepository';
import { createAppLogger } from './utils/logger';
import { runWorker } from './worker/runWorker';

loadEnvironment({
  path: new URL('../../../.env', import.meta.url),
  quiet: true,
});

const bootstrapLogger = createAppLogger({ service: 'backtest-worker' });

async function startWorker(): Promise<void> {
  const config = readWorkerConfig();
  const logger = createAppLogger({
    service: 'backtest-worker',
    level: config.logLevel,
  });
  const prisma = createPrismaClient(config.databaseUrl);
  const heartbeatRepository = new PrismaServiceHeartbeatRepository(prisma);
  const abortController = new AbortController();

  process.once('SIGINT', () => abortController.abort());
  process.once('SIGTERM', () => abortController.abort());

  await runWorker(
    {
      workerId: config.workerId,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      leaseDurationMs: config.leaseDurationMs,
      pollIntervalMs: config.pollIntervalMs,
    },
    {
      database: {
        connect: () => prisma.$connect(),
        disconnect: () => prisma.$disconnect(),
        client: prisma,
      },
      heartbeatRepository,
      logger,
    },
    abortController.signal,
  );
  logger.flush();
}

void startWorker().catch((error: unknown) => {
  bootstrapLogger.fatal({ err: error }, 'Backtest worker failed');
  bootstrapLogger.flush();
  process.exitCode = 1;
});
