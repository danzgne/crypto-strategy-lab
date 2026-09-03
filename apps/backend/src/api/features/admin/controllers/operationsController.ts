import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '@/utils/response/ApiResponse';
import type { OperationsServiceInterface } from '../services/interfaces/operationsService.interface';

export class OperationsController {
  public constructor(
    private readonly operationsService: OperationsServiceInterface,
  ) {}

  public getSnapshot = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const snapshot = await this.operationsService.getSnapshot();
      sendSuccess(res, snapshot);
    } catch (error) {
      next(error);
    }
  };
}
