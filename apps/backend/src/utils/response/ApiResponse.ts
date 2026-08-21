import type { Response } from 'express';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  requestId: string;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

export function sendSuccess<T>(
  response: Response,
  data: T,
  statusCode = 200,
): Response<ApiSuccess<T>> {
  return response.status(statusCode).json({
    success: true,
    data,
    requestId: response.req.requestId,
  });
}

export function sendError(
  response: Response,
  error: ApiFailure['error'],
  statusCode: number,
): Response<ApiFailure> {
  return response.status(statusCode).json({
    success: false,
    error,
    requestId: response.req.requestId,
  });
}
