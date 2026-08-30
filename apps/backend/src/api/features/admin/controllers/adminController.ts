import type { NextFunction, Request, Response } from 'express';
import type { NewsServiceInterface } from '@/api/features/news/services/interfaces/newsService.interface';
import {
  createNewsSourceSchema,
  updateNewsSourceSchema,
  updateCrawlIntervalSchema,
  ingestHtmlSchema,
} from '../types/admin.dto';
import { sendSuccess, sendError } from '@/utils/response/ApiResponse';

export class AdminController {
  public constructor(private readonly newsService: NewsServiceInterface) {}

  public getNewsSources = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sources = await this.newsService.getSources();
      sendSuccess(res, sources);
    } catch (error) {
      next(error);
    }
  };

  public createNewsSource = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (req.body && Object.keys(req.body).length > 0) {
        const parsed = createNewsSourceSchema.safeParse(req.body);
        if (!parsed.success) {
          sendError(
            res,
            {
              code: 'VALIDATION_ERROR',
              message: parsed.error.issues.map((i) => i.message).join(', '),
            },
            400,
          );
          return;
        }

        const created = await this.newsService.createSource(parsed.data);
        sendSuccess(res, created, 200);
        return;
      }

      sendSuccess(res, { message: 'News sources configured' }, 200);
    } catch (error) {
      next(error);
    }
  };

  public updateNewsSource = async (
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

      const parsed = updateNewsSourceSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => i.message).join(', '),
          },
          400,
        );
        return;
      }

      const updated = await this.newsService.updateSource(id, parsed.data);
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  };

  public deleteNewsSource = async (
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
      await this.newsService.deleteSource(id);
      sendSuccess(res, { message: 'News source deleted' });
    } catch (error) {
      next(error);
    }
  };

  public startCrawl = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const summary = await this.newsService.triggerCrawlNow();
      sendSuccess(res, summary, 200);
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

  public updateCrawlInterval = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parsed = updateCrawlIntervalSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => i.message).join(', '),
          },
          400,
        );
        return;
      }

      const result = await this.newsService.updateCrawlInterval(
        parsed.data.intervalMinutes,
      );
      sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  };

  public ingestHtml = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parsed = ingestHtmlSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => i.message).join(', '),
          },
          400,
        );
        return;
      }

      const item = await this.newsService.ingestHtml(parsed.data);
      sendSuccess(res, item, 200);
    } catch (error) {
      next(error);
    }
  };
}
