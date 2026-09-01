import type { NextFunction, Request, Response } from 'express';

import { sendError, sendSuccess } from '@/utils/response/ApiResponse';
import type { LeaderboardServiceInterface } from '../services/rankingService';

export class LeaderboardController {
  public constructor(private readonly service: LeaderboardServiceInterface) {}

  public get = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    const userId = request.session.userId;
    if (userId === undefined) {
      sendError(
        response,
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        401,
      );
      return;
    }

    try {
      sendSuccess(response, await this.service.get(userId));
    } catch (error) {
      next(error);
    }
  };
}
