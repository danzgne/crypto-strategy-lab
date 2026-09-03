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
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      const snapshot = await this.operationsService.getSnapshot();
      sendSuccess(res, snapshot);
    } catch (error) {
      next(error);
    }
  };
}
