import type { Request, Response } from 'express';

import { sendError } from '../../../utils/response/ApiResponse';

export function notFoundHandler(
  request: Request,
  response: Response,
): Response {
  return sendError(
    response,
    {
      code: 'NOT_FOUND',
      message: `No route for ${request.method} ${request.path}`,
    },
    404,
  );
}
