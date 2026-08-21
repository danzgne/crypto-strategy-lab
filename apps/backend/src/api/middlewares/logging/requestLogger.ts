import type { IncomingMessage } from 'node:http';

import pinoHttp from 'pino-http';

import type { AppLogger } from '../../../utils/logger';

export function requestLogger(logger: AppLogger) {
  return pinoHttp({
    logger,
    genReqId: (request) => readRequestId(request),
    customProps: (request) => ({ requestId: readRequestId(request) }),
  });
}

function readRequestId(request: IncomingMessage): string {
  return (request as IncomingMessage & { requestId: string }).requestId;
}
