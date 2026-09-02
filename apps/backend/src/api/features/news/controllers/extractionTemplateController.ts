import type { NextFunction, Request, Response } from 'express';
import type { TemplatePreviewResult } from '@crypto-strategy-lab/shared';
import { sendSuccess, sendError } from '@/utils/response/ApiResponse';
import type { NewsServiceInterface } from '../services/interfaces/newsService.interface';
import type { ExtractionTemplateService } from '../services/extraction/extractionTemplateService';
import {
  previewTemplateSchema,
  generateTemplateSchema,
  saveProposedVersionSchema,
  updateExtractionSettingsSchema,
} from '../types/extractionTemplate.dto';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export class ExtractionTemplateController {
  public constructor(
    private readonly newsService: NewsServiceInterface,
    private readonly extractionTemplateService: ExtractionTemplateService,
  ) {}

  private async loadSource(req: Request, res: Response) {
    const id = firstParam(req.params.id);
    if (!id) {
      sendError(
        res,
        { code: 'BAD_REQUEST', message: 'Source ID is required' },
        400,
      );
      return null;
    }
    const source = await this.newsService.getSourceById(id);
    if (!source) {
      sendError(
        res,
        { code: 'NOT_FOUND', message: 'News source not found' },
        404,
      );
      return null;
    }
    return source;
  }

  public preview = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const source = await this.loadSource(req, res);
      if (!source) return;

      const parsed = previewTemplateSchema.safeParse(req.body ?? {});
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

      const result = await this.extractionTemplateService.previewTemplate(
        source,
        parsed.data,
      );
      const wire: TemplatePreviewResult = {
        items: result.items.map((item) => ({
          title: item.title,
          summary: item.content,
          publishedAt: item.publishedAt.toISOString(),
          url: item.url,
        })),
        metrics: result.metrics,
      };
      sendSuccess(res, wire);
    } catch (error) {
      next(error);
    }
  };

  public generate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const source = await this.loadSource(req, res);
      if (!source) return;

      const parsed = generateTemplateSchema.safeParse(req.body ?? {});
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

      const result = await this.extractionTemplateService.generateTemplate(
        source,
        parsed.data,
      );
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };

  public saveProposedVersion = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const source = await this.loadSource(req, res);
      if (!source) return;

      const parsed = saveProposedVersionSchema.safeParse(req.body);
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

      const version = await this.extractionTemplateService.saveProposedVersion(
        source,
        parsed.data.template,
        parsed.data.generatedBy,
      );
      sendSuccess(res, version, 201);
    } catch (error) {
      next(error);
    }
  };

  public listVersions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const source = await this.loadSource(req, res);
      if (!source) return;

      const versions = await this.extractionTemplateService.listVersions(
        source.id,
      );
      sendSuccess(res, versions);
    } catch (error) {
      next(error);
    }
  };

  public activateVersion = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const source = await this.loadSource(req, res);
      if (!source) return;

      const versionId = firstParam(req.params.versionId);
      if (!versionId) {
        sendError(
          res,
          { code: 'BAD_REQUEST', message: 'Version ID is required' },
          400,
        );
        return;
      }

      const version = await this.extractionTemplateService.activateVersion(
        source.id,
        versionId,
      );
      sendSuccess(res, version);
    } catch (error) {
      next(error);
    }
  };

  public rejectVersion = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const source = await this.loadSource(req, res);
      if (!source) return;

      const versionId = firstParam(req.params.versionId);
      if (!versionId) {
        sendError(
          res,
          { code: 'BAD_REQUEST', message: 'Version ID is required' },
          400,
        );
        return;
      }

      const version = await this.extractionTemplateService.rejectVersion(
        source.id,
        versionId,
      );
      sendSuccess(res, version);
    } catch (error) {
      next(error);
    }
  };

  public getPanelData = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const source = await this.loadSource(req, res);
      if (!source) return;

      const panel = await this.extractionTemplateService.getPanelData(source);
      sendSuccess(res, panel);
    } catch (error) {
      next(error);
    }
  };

  public getSettings = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const settings = await this.extractionTemplateService.getSettings();
      sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  };

  public updateSettings = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parsed = updateExtractionSettingsSchema.safeParse(req.body);
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

      const settings = await this.extractionTemplateService.updateSettings(
        parsed.data,
      );
      sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  };
}
