import { Router } from 'express';
import { Role } from '@crypto-strategy-lab/shared';
import { authorizeRole } from '@/api/middlewares/auth/authorizeRole';
import type { NewsServiceInterface } from '@/api/features/news/services/interfaces/newsService.interface';
import {
  createNewsSourceSchema,
  updateNewsSourceSchema,
  updateCrawlIntervalSchema,
  ingestHtmlSchema,
} from '@/api/features/news/types/news.dto';
import { sendSuccess, sendError } from '@/utils/response/ApiResponse';

export function createAdminFeatureRouter(
  newsService?: NewsServiceInterface,
): Router {
  const router = Router();

  // Apply admin role middleware to all routes in this router
  router.use(authorizeRole(Role.ADMIN));

  // 1. Configuring News Sources
  router.get('/news-sources', async (_req, res, next) => {
    try {
      if (newsService) {
        const sources = await newsService.getSources();
        sendSuccess(res, sources);
        return;
      }
      res.json({ success: true, data: [] });
    } catch (error) {
      next(error);
    }
  });

  router.post('/news-sources', async (req, res, next) => {
    try {
      if (newsService && req.body && req.body.name && req.body.url) {
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

        const created = await newsService.createSource(parsed.data);
        res.json({
          success: true,
          message: 'News sources configured',
          data: created,
        });
        return;
      }

      res.json({ success: true, message: 'News sources configured' });
    } catch (error) {
      next(error);
    }
  });

  router.put('/news-sources/:id', async (req, res, next) => {
    try {
      if (!newsService) {
        res.json({ success: true, message: 'News source updated' });
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

      const updated = await newsService.updateSource(
        req.params.id,
        parsed.data,
      );
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/news-sources/:id', async (req, res, next) => {
    try {
      if (newsService) {
        await newsService.deleteSource(req.params.id);
      }
      sendSuccess(res, { message: 'News source deleted' });
    } catch (error) {
      next(error);
    }
  });

  // 2. Starting a crawl
  router.post('/crawl/start', async (_req, res, next) => {
    try {
      if (newsService) {
        const summary = await newsService.triggerCrawlNow();
        res.json({
          success: true,
          message: 'Crawl started',
          data: summary,
        });
        return;
      }
      res.json({ success: true, message: 'Crawl started' });
    } catch (error) {
      next(error);
    }
  });

  // 3. Setting the crawl refresh interval
  router.get('/crawl/interval', (_req, res) => {
    if (newsService) {
      sendSuccess(res, newsService.getCrawlInterval());
      return;
    }
    sendSuccess(res, { intervalMinutes: 3 });
  });

  router.put('/crawl/interval', (req, res) => {
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

    if (newsService) {
      const result = newsService.updateCrawlInterval(
        parsed.data.intervalMinutes,
      );
      res.json({
        success: true,
        message: 'Crawl interval updated',
        data: result,
      });
      return;
    }

    res.json({ success: true, message: 'Crawl interval updated' });
  });

  // 4. Toggling extraction-template drift detection (Seam for #46)
  router.post('/templates/drift-detection', (_req, res) => {
    res.json({ message: 'Drift detection toggled' });
  });

  // 5. Applying a proposed template version (Seam for #46)
  router.post('/templates/apply', (_req, res) => {
    res.json({ message: 'Template applied' });
  });

  // 6. HTML paste ingest
  router.post('/ingest/html', async (req, res, next) => {
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

      if (newsService) {
        const item = await newsService.ingestHtml(parsed.data);
        res.json({
          success: true,
          message: 'HTML ingested',
          data: item,
        });
        return;
      }

      res.json({ success: true, message: 'HTML ingested' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
