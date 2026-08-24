import type { NextFunction, Request, Response } from 'express';

import { sendSuccess } from '@/utils/response/ApiResponse';
import type { HealthService } from '@/api/features/health/services/interfaces/healthService.interface';

export class HealthController {
  public constructor(private readonly service: HealthService) {}

  public liveness = (_request: Request, response: Response): Response => {
    return sendSuccess(response, this.service.getLiveness());
  };

  public readiness = async (
    _request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      sendSuccess(response, await this.service.getReadiness());
    } catch (error) {
      next(error);
    }
  };
}
