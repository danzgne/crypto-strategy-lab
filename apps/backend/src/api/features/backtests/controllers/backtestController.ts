import type { NextFunction, Request, Response } from 'express';

import { sendError, sendSuccess } from '@/utils/response/ApiResponse';
import { BacktestValidationError } from '../services/backtestService';
import type { BacktestServiceInterface } from '../services/interfaces/backtestService.interface';

export class BacktestController {
  public constructor(private readonly service: BacktestServiceInterface) {}

  public create = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    const ownerId = request.session.userId;
    if (ownerId === undefined) {
      sendError(
        response,
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        401,
      );
      return;
    }

    try {
      const result = await this.service.submit(ownerId, request.body);
      sendSuccess(response, result, 202);
    } catch (error) {
      if (error instanceof BacktestValidationError) {
        sendError(response, { code: error.code, message: error.message }, 400);
        return;
      }
      next(error);
    }
  };

  public get = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    const ownerId = request.session.userId;
    if (ownerId === undefined) {
      sendError(
        response,
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        401,
      );
      return;
    }

    try {
      const result = await this.service.get(
        ownerId,
        typeof request.params['experimentId'] === 'string'
          ? request.params['experimentId']
          : '',
      );
      if (result === null) {
        sendError(
          response,
          { code: 'BACKTEST_NOT_FOUND', message: 'Backtest was not found' },
          404,
        );
        return;
      }
      sendSuccess(response, result);
    } catch (error) {
      next(error);
    }
  };

  public list = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    const ownerId = request.session.userId;
    if (ownerId === undefined) {
      sendError(
        response,
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        401,
      );
      return;
    }

    try {
      sendSuccess(response, await this.service.list(ownerId));
    } catch (error) {
      next(error);
    }
  };
}
