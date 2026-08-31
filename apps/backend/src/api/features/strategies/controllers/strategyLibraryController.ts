import type { NextFunction, Request, Response } from 'express';
import {
  isStrategyProvenance,
  type StrategyProvenance,
} from '@crypto-strategy-lab/shared';

import { sendError, sendSuccess } from '@/utils/response/ApiResponse';

import type { StrategyLibraryEntry } from '../repositories/interfaces/strategyLibraryRepository.interface';
import type { StrategyLibraryService } from '../services/strategyLibraryService';
import {
  listStrategiesQuerySchema,
  saveStrategyRequestSchema,
  validateStrategyRequestSchema,
  type StrategyLibraryEntryResponseDto,
  type StrategyLibrarySummaryDto,
} from '../types/strategyLibrary.dto';

export class StrategyLibraryController {
  public constructor(private readonly libraryService: StrategyLibraryService) {}

  public create = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parseResult = saveStrategyRequestSchema.safeParse(req.body);
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

      const ownerId = req.session.userId;
      if (!ownerId) {
        sendError(
          res,
          { code: 'UNAUTHORIZED', message: 'Not authenticated' },
          401,
        );
        return;
      }
      const result = await this.libraryService.save({
        ownerId,
        ...parseResult.data,
      });

      if (result.outcome === 'GENERATION_INVALID') {
        sendError(
          res,
          { code: 'GENERATION_INVALID', message: result.message },
          422,
        );
        return;
      }

      sendSuccess(res, toEntryResponseDto(result.entry), 201);
    } catch (error) {
      next(error);
    }
  };

  public validate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parseResult = validateStrategyRequestSchema.safeParse(req.body);
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

      const result = this.libraryService.validate(parseResult.data.params);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };

  public list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parseResult = listStrategiesQuerySchema.safeParse(req.query);
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

      const ownerId = req.session.userId;
      if (!ownerId) {
        sendError(
          res,
          { code: 'UNAUTHORIZED', message: 'Not authenticated' },
          401,
        );
        return;
      }
      const entries = await this.libraryService.listRecent(
        ownerId,
        parseResult.data.limit,
      );
      sendSuccess(res, entries.map(toSummaryDto));
    } catch (error) {
      next(error);
    }
  };
}

function toEntryResponseDto(
  entry: StrategyLibraryEntry,
): StrategyLibraryEntryResponseDto {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    tags: entry.tags,
    source: assertProvenance(entry.source),
    sourceInput: entry.sourceInput,
    createdAt: entry.createdAt.toISOString(),
    version: {
      id: entry.latestVersion.id,
      params: entry.latestVersion.params,
      versionTag: entry.latestVersion.versionTag,
      libraryVersion: entry.latestVersion.libraryVersion,
    },
  };
}

function toSummaryDto(entry: StrategyLibraryEntry): StrategyLibrarySummaryDto {
  return {
    id: entry.id,
    name: entry.name,
    source: assertProvenance(entry.source),
    createdAt: entry.createdAt.toISOString(),
    libraryVersion: entry.latestVersion.libraryVersion,
    tags: entry.tags,
  };
}

function assertProvenance(source: string): StrategyProvenance {
  if (!isStrategyProvenance(source)) {
    throw new Error(`Strategy library entry has an unknown source "${source}"`);
  }
  return source;
}
