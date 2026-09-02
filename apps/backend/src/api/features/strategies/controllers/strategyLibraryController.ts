import type { NextFunction, Request, Response } from 'express';
import type {
  CompositeStrategyRequest,
  CreateLibraryEntryRequest,
  LibraryEntry,
  LibraryEntryDetail,
  LibraryEntryVersion,
  LibraryListResponse,
} from '@crypto-strategy-lab/shared';
import type { z } from 'zod';

import { sendError, sendSuccess } from '@/utils/response/ApiResponse';

import {
  StrategyLibraryService,
  StrategyLibraryValidationError,
} from '../services/strategyLibraryService';
import type {
  LibraryEntryDetailRow,
  LibraryEntryRow,
  LibraryVersionRow,
} from '../repositories/interfaces/strategyLibraryRepository.interface';
import type { LibraryListResult } from '../services/strategyLibraryService';
import {
  addLibraryVersionRequestSchema,
  archiveLibraryEntryRequestSchema,
  compositeRequestSchema,
  createLibraryEntryRequestSchema,
  listLibraryEntriesQuerySchema,
  updateLibraryEntryMetadataRequestSchema,
  validateStrategyRequestSchema,
} from '../types/strategyLibrary.dto';

const VALIDATION_ERROR_STATUS: Record<
  StrategyLibraryValidationError['code'],
  number
> = {
  INVALID_NAME: 400,
  INVALID_REQUEST: 400,
  INVALID_PROVENANCE: 400,
  INVALID_LIBRARY_VERSION: 400,
  UNKNOWN_STRATEGY: 400,
  INVALID_STRATEGY: 422,
  DUPLICATE_LIBRARY_VERSION: 409,
};

export class StrategyLibraryController {
  public constructor(private readonly libraryService: StrategyLibraryService) {}

  public list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const ownerId = requireOwner(req, res);
    if (ownerId === undefined) return;

    const parseResult = listLibraryEntriesQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      sendValidationError(res, parseResult.error.issues);
      return;
    }

    try {
      const result = await this.libraryService.list(ownerId, {
        ...(parseResult.data.limit === undefined
          ? {}
          : { limit: parseResult.data.limit }),
        ...(parseResult.data.offset === undefined
          ? {}
          : { offset: parseResult.data.offset }),
        includeArchived: parseResult.data.archived === 'true',
      });
      sendSuccess(res, toListResponseDto(result));
    } catch (error) {
      next(error);
    }
  };

  public get = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const ownerId = requireOwner(req, res);
    if (ownerId === undefined) return;
    const entryId = requireEntryId(req, res);
    if (entryId === undefined) return;

    try {
      const entry = await this.libraryService.getEntry(ownerId, entryId);
      if (entry === null) {
        sendError(
          res,
          { code: 'NOT_FOUND', message: 'Strategy not found' },
          404,
        );
        return;
      }
      sendSuccess(res, toDetailDto(entry));
    } catch (error) {
      next(error);
    }
  };

  public create = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const ownerId = requireOwner(req, res);
    if (ownerId === undefined) return;

    const parseResult = createLibraryEntryRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      sendValidationError(res, parseResult.error.issues);
      return;
    }

    try {
      const entry = await this.libraryService.create(
        ownerId,
        toCreateRequest(parseResult.data),
      );
      sendSuccess(res, toDetailDto(entry), 201);
    } catch (error) {
      if (error instanceof StrategyLibraryValidationError) {
        sendError(
          res,
          { code: error.code, message: error.message },
          VALIDATION_ERROR_STATUS[error.code],
        );
        return;
      }
      next(error);
    }
  };

  public addVersion = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const ownerId = requireOwner(req, res);
    if (ownerId === undefined) return;
    const entryId = requireEntryId(req, res);
    if (entryId === undefined) return;

    const parseResult = addLibraryVersionRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      sendValidationError(res, parseResult.error.issues);
      return;
    }

    try {
      const { libraryVersion, params, composite } = parseResult.data;
      const result = await this.libraryService.addVersion(ownerId, entryId, {
        libraryVersion,
        ...(params === undefined
          ? {}
          : { params: params as Record<string, unknown> }),
        ...(composite === undefined
          ? {}
          : { composite: normalizeComposite(composite) }),
      });
      if (result === null) {
        sendError(
          res,
          { code: 'NOT_FOUND', message: 'Strategy not found' },
          404,
        );
        return;
      }
      if (result.outcome === 'DUPLICATE_LIBRARY_VERSION') {
        sendError(
          res,
          {
            code: 'DUPLICATE_LIBRARY_VERSION',
            message: 'That Library Version is already used by this entry',
          },
          409,
        );
        return;
      }
      sendSuccess(res, toDetailDto(result.entry), 201);
    } catch (error) {
      if (error instanceof StrategyLibraryValidationError) {
        sendError(
          res,
          { code: error.code, message: error.message },
          VALIDATION_ERROR_STATUS[error.code],
        );
        return;
      }
      next(error);
    }
  };

  public updateMetadata = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const ownerId = requireOwner(req, res);
    if (ownerId === undefined) return;
    const entryId = requireEntryId(req, res);
    if (entryId === undefined) return;

    const parseResult = updateLibraryEntryMetadataRequestSchema.safeParse(
      req.body,
    );
    if (!parseResult.success) {
      sendValidationError(res, parseResult.error.issues);
      return;
    }

    try {
      const entry = await this.libraryService.updateMetadata(
        ownerId,
        entryId,
        parseResult.data,
      );
      if (entry === null) {
        sendError(
          res,
          { code: 'NOT_FOUND', message: 'Strategy not found' },
          404,
        );
        return;
      }
      sendSuccess(res, toDetailDto(entry));
    } catch (error) {
      if (error instanceof StrategyLibraryValidationError) {
        sendError(
          res,
          { code: error.code, message: error.message },
          VALIDATION_ERROR_STATUS[error.code],
        );
        return;
      }
      next(error);
    }
  };

  public archive = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const ownerId = requireOwner(req, res);
    if (ownerId === undefined) return;
    const entryId = requireEntryId(req, res);
    if (entryId === undefined) return;

    const parseResult = archiveLibraryEntryRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      sendValidationError(res, parseResult.error.issues);
      return;
    }

    try {
      const entry = await this.libraryService.setArchived(
        ownerId,
        entryId,
        parseResult.data.archived,
      );
      if (entry === null) {
        sendError(
          res,
          { code: 'NOT_FOUND', message: 'Strategy not found' },
          404,
        );
        return;
      }
      sendSuccess(res, toDetailDto(entry));
    } catch (error) {
      next(error);
    }
  };

  public validate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const parseResult = validateStrategyRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      sendValidationError(res, parseResult.error.issues);
      return;
    }

    try {
      const result = this.libraryService.validate(parseResult.data.params);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };
}

function toCreateRequest(
  data: z.infer<typeof createLibraryEntryRequestSchema>,
): CreateLibraryEntryRequest {
  const { name, description, tags, libraryVersion, source, sourceInput } = data;
  const metadata = {
    name,
    ...(description === undefined ? {} : { description }),
    ...(tags === undefined ? {} : { tags }),
    ...(libraryVersion === undefined ? {} : { libraryVersion }),
    source,
    ...(sourceInput === undefined ? {} : { sourceInput }),
  };
  return data.strategyId === 'composite'
    ? {
        ...metadata,
        strategyId: 'composite',
        composite: normalizeComposite(data.composite!),
      }
    : {
        ...metadata,
        strategyId: data.strategyId,
        ...(data.params === undefined
          ? {}
          : { params: data.params as Record<string, unknown> }),
      };
}

function normalizeComposite(
  composite: z.infer<typeof compositeRequestSchema>,
): CompositeStrategyRequest {
  return {
    mode: composite.mode,
    members: composite.members.map((member) => ({
      strategyId: member.strategyId,
      ...(member.params === undefined ? {} : { params: member.params }),
      ...(member.weight === undefined ? {} : { weight: member.weight }),
    })),
    ...(composite.threshold === undefined
      ? {}
      : { threshold: composite.threshold }),
    ...(composite.stopLoss === undefined
      ? {}
      : { stopLoss: composite.stopLoss }),
    ...(composite.takeProfit === undefined
      ? {}
      : { takeProfit: composite.takeProfit }),
  };
}

function requireOwner(req: Request, res: Response): string | undefined {
  const ownerId = req.session.userId;
  if (ownerId === undefined) {
    sendError(res, { code: 'UNAUTHORIZED', message: 'Not authenticated' }, 401);
    return undefined;
  }
  return ownerId;
}

function requireEntryId(req: Request, res: Response): string | undefined {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (id === undefined || id.length === 0) {
    sendError(
      res,
      { code: 'VALIDATION_ERROR', message: 'id is required' },
      400,
    );
    return undefined;
  }
  return id;
}

function sendValidationError(
  res: Response,
  issues: readonly { message: string }[],
): void {
  sendError(
    res,
    {
      code: 'VALIDATION_ERROR',
      message: issues.map((issue) => issue.message).join(', '),
    },
    400,
  );
}

function toVersionDto(
  version: LibraryVersionRow,
  kind: 'singular' | 'composite',
): LibraryEntryVersion {
  return {
    id: version.id,
    versionTag: version.versionTag,
    libraryVersion: version.libraryVersion,
    createdAt: version.createdAt.toISOString(),
    ...(kind === 'composite'
      ? { composite: version.params as CompositeStrategyRequest }
      : { params: isRecord(version.params) ? version.params : {} }),
  };
}

function toEntryDto(row: LibraryEntryRow): LibraryEntry {
  const kind = row.type === 'composite' ? 'composite' : 'singular';
  const base = {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: row.tags,
    source: row.source,
    sourceInput: row.sourceInput,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    latestVersion: toVersionDto(row.latestVersion, kind),
  };
  return kind === 'composite'
    ? { ...base, kind: 'composite', strategyId: 'composite' }
    : { ...base, kind: 'singular', strategyId: row.type };
}

function toDetailDto(row: LibraryEntryDetailRow): LibraryEntryDetail {
  const entry = toEntryDto(row);
  return {
    ...entry,
    versions: row.versions.map((version) => toVersionDto(version, entry.kind)),
  };
}

function toListResponseDto(result: LibraryListResult): LibraryListResponse {
  return {
    builtins: result.builtins,
    entries: result.entries.map(toEntryDto),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
