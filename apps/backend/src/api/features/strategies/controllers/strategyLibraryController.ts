import type { NextFunction, Request, Response } from 'express';
import type { SaveStrategyRequest } from '@crypto-strategy-lab/shared';
import {
  isStrategyProvenance,
  type StrategyProvenance,
} from '@crypto-strategy-lab/shared';

import { sendError, sendSuccess } from '@/utils/response/ApiResponse';

import type { StrategyLibraryServiceInterface } from '../services/interfaces/strategyLibraryService.interface';
import {
  StrategyLibraryService,
  StrategyLibraryValidationError,
} from '../services/strategyLibraryService';
import type { StrategyLibraryEntry } from '../repositories/interfaces/strategyLibraryRepository.interface';
import {
  listStrategiesQuerySchema,
  saveStrategyRequestSchema,
  validateStrategyRequestSchema,
  type StrategyLibraryEntryResponseDto,
  type StrategyLibrarySummaryDto,
} from '../types/strategyLibrary.dto';

type StrategyLibraryControllerService =
  StrategyLibraryService | StrategyLibraryServiceInterface;

export class StrategyLibraryController {
  public constructor(
    private readonly libraryService: StrategyLibraryControllerService,
  ) {}

  public create = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const ownerId = req.session.userId;
    if (ownerId === undefined) {
      sendError(
        res,
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        401,
      );
      return;
    }

    if (isNamedSaveRequest(req.body)) {
      try {
        const strategy = await this.libraryService.save(ownerId, req.body);
        sendSuccess(res, strategy, 201);
      } catch (error) {
        if (error instanceof StrategyLibraryValidationError) {
          sendError(res, { code: error.code, message: error.message }, 400);
          return;
        }
        next(error);
      }
      return;
    }

    if (!isGeneratedLibraryService(this.libraryService)) {
      sendError(
        res,
        { code: 'VALIDATION_ERROR', message: 'Invalid strategy save request' },
        400,
      );
      return;
    }

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
    if (!isGeneratedLibraryService(this.libraryService)) {
      sendError(
        res,
        { code: 'VALIDATION_ERROR', message: 'Validation is unavailable' },
        400,
      );
      return;
    }

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
    const ownerId = req.session.userId;
    if (ownerId === undefined) {
      sendError(
        res,
        { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        401,
      );
      return;
    }

    if (!isGeneratedLibraryService(this.libraryService)) {
      try {
        const strategies = await this.libraryService.list(ownerId);
        sendSuccess(res, strategies);
      } catch (error) {
        next(error);
      }
      return;
    }

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

function isGeneratedLibraryService(
  service: StrategyLibraryControllerService,
): service is StrategyLibraryService {
  return service instanceof StrategyLibraryService;
}

function isNamedSaveRequest(value: unknown): value is SaveStrategyRequest {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.strategyId === 'string'
  );
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
    versionId: entry.latestVersion.id,
    kind: 'singular',
    strategyId: entry.type,
    params: entry.latestVersion.params,
  };
}

function assertProvenance(source: string): StrategyProvenance {
  if (!isStrategyProvenance(source)) {
    throw new Error(`Strategy library entry has an unknown source "${source}"`);
  }
  return source;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
