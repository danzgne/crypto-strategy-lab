import pino, { type Logger } from 'pino';

export type AppLogger = Logger;

interface LoggerOptions {
  service: string;
  level?: string;
  enabled?: boolean;
}

export function createAppLogger({
  service,
  level = 'info',
  enabled = true,
}: LoggerOptions): Logger {
  if (!enabled) {
    return pino({ enabled: false });
  }

  return pino(
    {
      base: { service },
      level,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.destination({ dest: 1, sync: false }),
  );
}
