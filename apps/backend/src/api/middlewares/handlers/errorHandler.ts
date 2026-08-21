import type { ErrorRequestHandler } from 'express';

import { AppError } from '../../../errors/AppError';
import type { AppLogger } from '../../../utils/logger';
import { sendError } from '../../../utils/response/ApiResponse';

export function createErrorHandler(logger: AppLogger): ErrorRequestHandler {
  return (error: unknown, request, response, _next): void => {
    if (error instanceof AppError) {
      logger.warn(
        { error, requestId: request.requestId },
        'Request failed with an expected application error',
      );
      sendError(
        response,
        { code: error.code, message: error.message },
        error.statusCode,
      );
      return;
    }

    logger.error(
      { error, requestId: request.requestId },
      'Request failed unexpectedly',
    );
    sendError(
      response,
      { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      500,
    );
  };
}
