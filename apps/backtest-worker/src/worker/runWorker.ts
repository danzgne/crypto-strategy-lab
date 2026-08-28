import type { ServiceHeartbeatRepository } from '../repositories/interfaces/serviceHeartbeatRepository.interface';
import type { AppLogger } from '../utils/logger';
import { BacktestWorker } from './BacktestWorker';
import { PostgresJobQueue } from '../queue/PostgresJobQueue';
import type { WorkerPrismaClient } from '../database/prismaClient';

export interface DatabaseConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  client?: WorkerPrismaClient; // Passed from index
}

export interface WorkerRuntimeConfig {
  workerId: string;
  heartbeatIntervalMs: number;
}

interface WorkerDependencies {
  database: DatabaseConnection;
  heartbeatRepository: ServiceHeartbeatRepository;
  logger: AppLogger;
}

export async function runWorker(
  config: WorkerRuntimeConfig,
  dependencies: WorkerDependencies,
  signal: AbortSignal,
): Promise<void> {
  const { database, heartbeatRepository, logger } = dependencies;
  let registered = false;
  let worker: BacktestWorker | null = null;

  await database.connect();

  try {
    await heartbeatRepository.recordStarted(config.workerId);
    registered = true;
    logger.info({ workerId: config.workerId }, 'Backtest worker is ready');

    const heartbeatTimer = setInterval(() => {
      void heartbeatRepository
        .recordHeartbeat(config.workerId)
        .catch((error: unknown) => {
          logger.error(
            { err: error, workerId: config.workerId },
            'Backtest worker heartbeat failed',
          );
        });
    }, config.heartbeatIntervalMs);
    heartbeatTimer.unref();

    if (database.client) {
      const queue = new PostgresJobQueue(database.client);
      worker = new BacktestWorker(config.workerId, queue, logger);
      worker.start().catch((err) => {
        logger.error({ err }, 'Worker crashed');
      });
    } else {
      logger.warn('No database client provided, BacktestWorker not started');
    }

    try {
      await waitForAbort(signal);
    } finally {
      clearInterval(heartbeatTimer);
      if (worker) {
        worker.stop();
      }
    }
  } finally {
    try {
      if (registered) {
        await heartbeatRepository.recordStopped(config.workerId);
      }
    } finally {
      await database.disconnect();
    }
  }

  logger.info({ workerId: config.workerId }, 'Backtest worker stopped');
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}
