import type {
  CompositeStrategyRequest,
  CreateCompositeLibraryEntryRequest,
  CreateLibraryEntryRequest,
  LibraryBuiltin,
  StrategyProvenance,
} from '@crypto-strategy-lab/shared';
import { computeStrategyVersionTag } from '@crypto-strategy-lab/shared/strategy-version';
import { canonicalStrategyVersionId } from '@crypto-strategy-lab/shared/strategy';
import {
  CombinationEngine,
  RuleStrategy,
  StrategyRegistry,
  type CompositeStrategy,
  type Strategy,
} from '@crypto-strategy-lab/strategy-engine';

import type {
  AddLibraryVersionResult,
  LibraryEntryDetailRow,
  LibraryEntryRow,
  LibraryVersionForOwner,
  ListLibraryEntriesResult,
  StrategyLibraryRepository,
  UpdateLibraryEntryMetadataInput,
} from '../repositories/interfaces/strategyLibraryRepository.interface';

const DEFAULT_LIBRARY_VERSION = '1.0.0';
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const NAME_MAX_LENGTH = 200;

export interface AddVersionInput {
  libraryVersion: string;
  params?: Readonly<Record<string, unknown>>;
  composite?: CompositeStrategyRequest;
}

export interface ListEntriesOptions {
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

export interface LibraryListResult {
  builtins: LibraryBuiltin[];
  entries: LibraryEntryRow[];
  total: number;
  limit: number;
  offset: number;
}

export type ValidateStrategyResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly message: string };

export type StrategyLibraryValidationCode =
  | 'INVALID_NAME'
  | 'INVALID_REQUEST'
  | 'UNKNOWN_STRATEGY'
  | 'INVALID_STRATEGY'
  | 'INVALID_PROVENANCE'
  | 'INVALID_LIBRARY_VERSION'
  | 'DUPLICATE_LIBRARY_VERSION';

export class StrategyLibraryValidationError extends Error {
  public readonly code: StrategyLibraryValidationCode;

  public constructor(
    code: StrategyLibraryValidationCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'StrategyLibraryValidationError';
    this.code = code;
  }
}

interface ResolvedStrategyContent {
  type: string;
  params: unknown;
  canonicalIdentity: string;
  versionTag: string;
}

export interface StrategyLibraryServiceDependencies {
  repository: StrategyLibraryRepository;
  combinationEngine?: CombinationEngine;
}

export class StrategyLibraryService {
  private readonly repository: StrategyLibraryRepository;

  private readonly combinationEngine: CombinationEngine;

  public constructor({
    repository,
    combinationEngine = new CombinationEngine(),
  }: StrategyLibraryServiceDependencies) {
    this.repository = repository;
    this.combinationEngine = combinationEngine;
  }

  public async list(
    ownerId: string,
    options: ListEntriesOptions = {},
  ): Promise<LibraryListResult> {
    const limit = clamp(options.limit ?? 20, 1, 100);
    const offset = Math.max(0, options.offset ?? 0);
    const includeArchived = options.includeArchived ?? false;

    const result: ListLibraryEntriesResult = await this.repository.listEntries(
      ownerId,
      { limit, offset, includeArchived },
    );

    return {
      builtins: listBuiltins(),
      entries: result.entries,
      total: result.total,
      limit,
      offset,
    };
  }

  public getEntry(
    ownerId: string,
    entryId: string,
  ): Promise<LibraryEntryDetailRow | null> {
    return this.repository.getEntry(ownerId, entryId);
  }

  public async create(
    ownerId: string,
    request: CreateLibraryEntryRequest,
  ): Promise<LibraryEntryDetailRow> {
    const name = normalizeName(request.name);
    const { source, sourceInput } = normalizeProvenance(
      request.source,
      request.sourceInput,
    );
    const libraryVersion = normalizeLibraryVersion(
      request.libraryVersion ?? DEFAULT_LIBRARY_VERSION,
    );
    const resolved = this.resolveContent(request);

    return this.repository.create({
      ownerId,
      name,
      ...(request.description === undefined
        ? {}
        : { description: request.description }),
      tags: request.tags ?? [],
      type: resolved.type,
      source,
      ...(sourceInput === undefined ? {} : { sourceInput }),
      params: resolved.params,
      canonicalIdentity: resolved.canonicalIdentity,
      versionTag: resolved.versionTag,
      libraryVersion,
    });
  }

  public async addVersion(
    ownerId: string,
    entryId: string,
    input: AddVersionInput,
  ): Promise<AddLibraryVersionResult | null> {
    const libraryVersion = normalizeLibraryVersion(input.libraryVersion);
    const entry = await this.repository.getEntry(ownerId, entryId);
    if (entry === null) return null;

    const resolved =
      entry.type === 'composite'
        ? this.resolveComposite(requireComposite(input.composite, entry.type))
        : this.resolveSingular(entry.type, input.params ?? {});

    return this.repository.addVersion(ownerId, entryId, {
      params: resolved.params,
      canonicalIdentity: resolved.canonicalIdentity,
      versionTag: resolved.versionTag,
      libraryVersion,
    });
  }

  public updateMetadata(
    ownerId: string,
    entryId: string,
    input: UpdateLibraryEntryMetadataInput,
  ): Promise<LibraryEntryDetailRow | null> {
    if (input.name !== undefined) {
      normalizeName(input.name);
    }
    return this.repository.updateMetadata(ownerId, entryId, input);
  }

  public setArchived(
    ownerId: string,
    entryId: string,
    archived: boolean,
  ): Promise<LibraryEntryDetailRow | null> {
    return this.repository.setArchived(ownerId, entryId, archived);
  }

  public findVersionForOwner(
    ownerId: string,
    versionId: string,
  ): Promise<LibraryVersionForOwner | null> {
    return this.repository.findVersionForOwner(ownerId, versionId);
  }

  public validate(params: unknown): ValidateStrategyResult {
    try {
      new RuleStrategy(params);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        message:
          error instanceof Error
            ? error.message
            : 'Strategy parameters invalid',
      };
    }
  }

  private resolveContent(
    request: CreateLibraryEntryRequest,
  ): ResolvedStrategyContent {
    if (isCompositeCreateRequest(request)) {
      return this.resolveComposite(request.composite);
    }
    return this.resolveSingular(request.strategyId, request.params ?? {});
  }

  private resolveSingular(
    strategyId: string,
    params: unknown,
  ): ResolvedStrategyContent {
    if (StrategyRegistry.get(strategyId) === undefined) {
      throw new StrategyLibraryValidationError(
        'UNKNOWN_STRATEGY',
        `Strategy ${strategyId} is not registered`,
      );
    }

    let strategy: Strategy;
    try {
      strategy = StrategyRegistry.create(strategyId, params);
    } catch (error) {
      throw new StrategyLibraryValidationError(
        'INVALID_STRATEGY',
        error instanceof Error ? error.message : 'Strategy parameters invalid',
        { cause: error },
      );
    }

    const resolvedParams = this.storableParams(strategyId, strategy, params);
    return {
      type: strategyId,
      params: resolvedParams,
      canonicalIdentity: canonicalStrategyVersionId(strategyId, resolvedParams),
      versionTag: computeStrategyVersionTag(strategyId, resolvedParams),
    };
  }

  // Some Strategies (RuleStrategy) resolve into a shape their own constructor can't re-accept;
  // round-trip and fall back to the authored input instead of special-casing a Strategy id.
  private storableParams(
    strategyId: string,
    strategy: Strategy,
    originalParams: unknown,
  ): Readonly<Record<string, unknown>> {
    const resolved = isRecord(strategy.params) ? strategy.params : {};
    try {
      StrategyRegistry.create(strategyId, resolved);
      return resolved;
    } catch {
      return isRecord(originalParams) ? originalParams : {};
    }
  }

  private resolveComposite(
    request: CompositeStrategyRequest,
  ): ResolvedStrategyContent {
    let composite: CompositeStrategy;
    try {
      const members = request.members.map((member) => {
        const strategy = StrategyRegistry.create(
          member.strategyId,
          member.params,
        );
        return member.weight === undefined
          ? { strategy }
          : { strategy, weight: member.weight };
      });
      composite = this.combinationEngine.assemble({
        members,
        mode: request.mode,
        ...(request.threshold === undefined
          ? {}
          : { threshold: request.threshold }),
        ...(request.stopLoss === undefined
          ? {}
          : { stopLoss: request.stopLoss }),
        ...(request.takeProfit === undefined
          ? {}
          : { takeProfit: request.takeProfit }),
      });
    } catch (error) {
      throw new StrategyLibraryValidationError(
        'INVALID_STRATEGY',
        error instanceof Error ? error.message : 'Composite strategy invalid',
        { cause: error },
      );
    }

    const persistedComposite: CompositeStrategyRequest = {
      members: composite.members.map((member) => ({
        strategyId: member.strategyId,
        params: member.params,
        weight: member.weight,
      })),
      mode: composite.mode,
      threshold: composite.threshold,
      ...(composite.stopLoss === undefined
        ? {}
        : { stopLoss: composite.stopLoss }),
      ...(composite.takeProfit === undefined
        ? {}
        : { takeProfit: composite.takeProfit }),
    };

    return {
      type: 'composite',
      params: persistedComposite,
      canonicalIdentity: composite.identity,
      versionTag: computeStrategyVersionTag('composite', persistedComposite),
    };
  }
}

function listBuiltins(): LibraryBuiltin[] {
  return StrategyRegistry.list()
    .map((strategyId) => ({
      strategyId,
      paramsSchema: StrategyRegistry.get(strategyId)!.paramsSchema,
    }))
    .filter((builtin) => (builtin.paramsSchema.required?.length ?? 0) === 0);
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > NAME_MAX_LENGTH) {
    throw new StrategyLibraryValidationError(
      'INVALID_NAME',
      `Strategy name must be between 1 and ${NAME_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

function normalizeProvenance(
  source: StrategyProvenance,
  sourceInput: string | undefined,
): { source: StrategyProvenance; sourceInput: string | undefined } {
  if (source === 'MANUAL') {
    return { source, sourceInput: undefined };
  }
  const trimmed = sourceInput?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    throw new StrategyLibraryValidationError(
      'INVALID_PROVENANCE',
      `sourceInput is required when source is ${source}`,
    );
  }
  return { source, sourceInput: trimmed };
}

function normalizeLibraryVersion(libraryVersion: string): string {
  const trimmed = libraryVersion.trim();
  if (!SEMVER_PATTERN.test(trimmed)) {
    throw new StrategyLibraryValidationError(
      'INVALID_LIBRARY_VERSION',
      'Library Version must look like a semantic version, e.g. 1.0.0',
    );
  }
  return trimmed;
}

function isCompositeCreateRequest(
  request: CreateLibraryEntryRequest,
): request is CreateCompositeLibraryEntryRequest {
  return request.strategyId === 'composite';
}

function requireComposite(
  composite: CompositeStrategyRequest | undefined,
  entryType: string,
): CompositeStrategyRequest {
  if (composite === undefined) {
    throw new StrategyLibraryValidationError(
      'INVALID_REQUEST',
      `Entry of type ${entryType} requires a composite definition`,
    );
  }
  return composite;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
