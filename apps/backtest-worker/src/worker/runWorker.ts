import type { ServiceHeartbeatRepository } from '../repositories/interfaces/serviceHeartbeatRepository.interface';
import type { AppLogger } from '../utils/logger';

export interface DatabaseConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
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

    try {
      await waitForAbort(signal);
    } finally {
      clearInterval(heartbeatTimer);
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
