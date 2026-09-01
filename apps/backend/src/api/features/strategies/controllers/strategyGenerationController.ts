import type { NextFunction, Request, Response } from 'express';

import { sendError, sendSuccess } from '@/utils/response/ApiResponse';

import type { StrategyGenerationService } from '../generation/strategyGenerationService';
import { generateStrategyRequestSchema } from '../types/strategyGeneration.dto';

export class StrategyGenerationController {
  public constructor(
    private readonly generationService: StrategyGenerationService,
  ) {}

  public generate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parseResult = generateStrategyRequestSchema.safeParse(req.body);
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

      const { kind, input } = parseResult.data;
      if (kind === 'WEB_IMPORT' && !isValidUrl(input)) {
        sendError(
          res,
          { code: 'VALIDATION_ERROR', message: 'input must be a valid URL' },
          400,
        );
        return;
      }

      const result = await this.generationService.generate({ kind, input });

      switch (result.outcome) {
        case 'SUCCESS':
          sendSuccess(res, {
            name: result.name,
            description: result.description,
            tags: result.tags,
            params: result.params,
            unsupportedRequests: result.unsupportedRequests,
            generatedBy: result.generatedBy,
          });
          return;
        case 'EXTRACTION_FAILED':
          sendError(
            res,
            { code: 'EXTRACTION_FAILED', message: result.message },
            422,
          );
          return;
        case 'GENERATION_INVALID':
          sendError(
            res,
            { code: 'GENERATION_INVALID', message: result.message },
            422,
          );
          return;
        case 'LLM_UNAVAILABLE':
          sendError(
            res,
            {
              code: 'LLM_UNAVAILABLE',
              message:
                'Strategy generation is temporarily unavailable. Please try again shortly.',
            },
            503,
          );
          return;
      }
    } catch (error) {
      next(error);
    }
  };
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
