import type { NextFunction, Request, Response } from 'express';
import type { NewsServiceInterface } from '../services/interfaces/newsService.interface';
import { sendSuccess, sendError } from '@/utils/response/ApiResponse';
import { newsListQuerySchema } from '../types/news.dto';

export class NewsController {
  public constructor(private readonly newsService: NewsServiceInterface) {}

  public getNewsList = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parseResult = newsListQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        sendError(
          res,
          {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.issues.map((i) => i.message).join(', '),
          },
          400,
        );
        return;
      }

      const result = await this.newsService.getNewsItems(parseResult.data);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };

  public getNewsById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;

      if (!id) {
        sendError(res, { code: 'BAD_REQUEST', message: 'ID is required' }, 400);
        return;
      }

      const item = await this.newsService.getNewsItemById(id);
      if (!item) {
        sendError(
          res,
          { code: 'NOT_FOUND', message: 'News item not found' },
          404,
        );
        return;
      }

      sendSuccess(res, item);
    } catch (error) {
      next(error);
    }
  };

  public getSources = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sources = await this.newsService.getSources(true);
      sendSuccess(res, sources);
    } catch (error) {
      next(error);
    }
  };

  public getStats = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const stats = await this.newsService.getStats();
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  };

  public getCrawlInterval = (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    try {
      const result = this.newsService.getCrawlInterval();
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };
}
