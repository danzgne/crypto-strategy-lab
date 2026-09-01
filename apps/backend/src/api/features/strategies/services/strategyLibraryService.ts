import type {
  CompositeStrategyRequest,
  RuleStrategyParams,
  SaveStrategyRequest,
  SavedStrategy,
  StrategyProvenance,
} from '@crypto-strategy-lab/shared';
import { computeStrategyVersionTag } from '@crypto-strategy-lab/shared/strategy-version';
import {
  CombinationEngine,
  RULE_STRATEGY_ID,
  RuleStrategy,
  StrategyRegistry,
  type CompositeStrategy,
  type Strategy,
} from '@crypto-strategy-lab/strategy-engine';

import type {
  CreateStrategyLibraryEntryInput,
  PersistedStrategyRequest,
  StrategyLibraryEntry,
  StrategyLibraryRepository,
} from '../repositories/interfaces/strategyLibraryRepository.interface';
import type {
  SaveCompositeStrategyRequest,
  SaveSingularStrategyRequest,
} from '@crypto-strategy-lab/shared';
import type { StrategyLibraryServiceInterface } from './interfaces/strategyLibraryService.interface';

const DEFAULT_LIBRARY_VERSION = '1.0.0';
const DEFAULT_LIST_LIMIT = 10;

export interface SaveStrategyInput {
  ownerId: string;
  name: string;
  description?: string | undefined;
  tags?: readonly string[] | undefined;
  source: StrategyProvenance;
  sourceInput: string;
  params: unknown;
  libraryVersion?: string | undefined;
}

export type SaveStrategyResult =
  | { readonly outcome: 'SUCCESS'; readonly entry: StrategyLibraryEntry }
  | { readonly outcome: 'GENERATION_INVALID'; readonly message: string };

export type ValidateStrategyResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly message: string };

type ConstructResult =
  | { readonly ok: true; readonly strategy: RuleStrategy }
  | { readonly ok: false; readonly message: string };

export interface StrategyLibraryServiceDependencies {
  repository: StrategyLibraryRepository;
}

export type StrategyLibraryRepositoryInput =
  StrategyLibraryServiceDependencies | StrategyLibraryRepository;

export type StrategyLibraryCreateInput = CreateStrategyLibraryEntryInput;

export type StrategyLibrarySaveRequest = SaveStrategyRequest;

export type StrategyLibrarySavedResult = SavedStrategy;

export type StrategyLibraryValidationCode =
  'INVALID_NAME' | 'INVALID_REQUEST' | 'UNKNOWN_STRATEGY' | 'INVALID_STRATEGY';

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

export class StrategyLibraryService implements StrategyLibraryServiceInterface {
  private readonly repository: StrategyLibraryRepository;

  private readonly combinationEngine: CombinationEngine;

  public constructor(
    dependenciesOrRepository: StrategyLibraryRepositoryInput,
    combinationEngine = new CombinationEngine(),
  ) {
    this.repository = isServiceDependencies(dependenciesOrRepository)
      ? dependenciesOrRepository.repository
      : dependenciesOrRepository;
    this.combinationEngine = combinationEngine;
  }

  public list(ownerId: string): Promise<SavedStrategy[]> {
    if (this.repository.listByOwner === undefined) {
      return Promise.reject(
        new Error(
          'Strategy library repository does not support saved strategies',
        ),
      );
    }
    return this.repository.listByOwner(ownerId);
  }

  public async save(input: SaveStrategyInput): Promise<SaveStrategyResult>;

  public async save(
    ownerId: string,
    request: SaveStrategyRequest,
  ): Promise<SavedStrategy>;

  public async save(
    inputOrOwnerId: SaveStrategyInput | string,
    request?: SaveStrategyRequest,
  ): Promise<SaveStrategyResult | SavedStrategy> {
    if (typeof inputOrOwnerId === 'string') {
      if (request === undefined) {
        throw new StrategyLibraryValidationError(
          'INVALID_REQUEST',
          'A strategy save request is required',
        );
      }
      return this.saveNamed(inputOrOwnerId, request);
    }

    return this.saveGenerated(inputOrOwnerId);
  }

  public validate(params: unknown): ValidateStrategyResult {
    const result = this.tryConstruct(params);
    return result.ok
      ? { valid: true }
      : { valid: false, message: result.message };
  }

  public async listRecent(
    ownerId: string,
    limit: number = DEFAULT_LIST_LIMIT,
  ): Promise<StrategyLibraryEntry[]> {
    if (this.repository.listRecentByOwner === undefined) {
      throw new Error(
        'Strategy library repository does not support generated strategy entries',
      );
    }
    return this.repository.listRecentByOwner(ownerId, limit);
  }

  private async saveGenerated(
    input: SaveStrategyInput,
  ): Promise<SaveStrategyResult> {
    const result = this.tryConstruct(input.params);
    if (!result.ok) {
      return { outcome: 'GENERATION_INVALID', message: result.message };
    }
    const strategy = result.strategy;
    const createWithFirstVersion = this.repository.createWithFirstVersion;
    if (createWithFirstVersion === undefined) {
      throw new Error(
        'Strategy library repository does not support generated strategy entries',
      );
    }

    const versionTag = computeStrategyVersionTag(
      RULE_STRATEGY_ID,
      strategy.params,
    );

    const entry = await createWithFirstVersion.call(this.repository, {
      ownerId: input.ownerId,
      name: input.name,
      description: input.description,
      tags: input.tags ?? [],
      type: RULE_STRATEGY_ID,
      source: input.source,
      sourceInput: input.sourceInput,
      params: input.params as RuleStrategyParams,
      versionTag,
      libraryVersion: input.libraryVersion ?? DEFAULT_LIBRARY_VERSION,
    });

    return { outcome: 'SUCCESS', entry };
  }

  private async saveNamed(
    ownerId: string,
    request: SaveStrategyRequest,
  ): Promise<SavedStrategy> {
    const name = normalizeName(request);
    if (name === null) {
      throw new StrategyLibraryValidationError(
        'INVALID_NAME',
        'Strategy name must be between 1 and 80 characters',
      );
    }
    if (this.repository.create === undefined) {
      throw new Error(
        'Strategy library repository does not support named strategy entries',
      );
    }

    if (isCompositeSaveRequest(request)) {
      return this.saveComposite(ownerId, request, name);
    }
    return this.saveSingular(ownerId, request, name);
  }

  private saveSingular(
    ownerId: string,
    request: SaveSingularStrategyRequest,
    name: string,
  ): Promise<SavedStrategy> {
    if (StrategyRegistry.get(request.strategyId) === undefined) {
      throw new StrategyLibraryValidationError(
        'UNKNOWN_STRATEGY',
        `Strategy ${request.strategyId} is not registered`,
      );
    }

    let strategy: Strategy;
    try {
      strategy = StrategyRegistry.create(request.strategyId, request.params);
    } catch (error) {
      throw new StrategyLibraryValidationError(
        'INVALID_STRATEGY',
        error instanceof Error ? error.message : 'Strategy parameters invalid',
        { cause: error },
      );
    }

    const persisted: PersistedStrategyRequest = {
      ...(request.description === undefined
        ? {}
        : { description: request.description }),
      name,
      params: toParameterRecord(strategy),
      strategyId: request.strategyId,
    };
    return this.repository.create!(ownerId, persisted);
  }

  private saveComposite(
    ownerId: string,
    request: SaveCompositeStrategyRequest,
    name: string,
  ): Promise<SavedStrategy> {
    if (!isCompositeRequest(request.composite)) {
      throw new StrategyLibraryValidationError(
        'INVALID_REQUEST',
        'Composite strategy definition is required',
      );
    }

    let composite: CompositeStrategy;
    try {
      const members = request.composite.members.map((member) => {
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
        mode: request.composite.mode,
        ...(request.composite.threshold === undefined
          ? {}
          : { threshold: request.composite.threshold }),
        ...(request.composite.stopLoss === undefined
          ? {}
          : { stopLoss: request.composite.stopLoss }),
        ...(request.composite.takeProfit === undefined
          ? {}
          : { takeProfit: request.composite.takeProfit }),
      });
    } catch (error) {
      throw new StrategyLibraryValidationError(
        'INVALID_STRATEGY',
        error instanceof Error ? error.message : 'Composite strategy invalid',
        { cause: error },
      );
    }

    const persisted: PersistedStrategyRequest = {
      ...(request.description === undefined
        ? {}
        : { description: request.description }),
      composite: toCompositeRequest(composite),
      name,
      strategyId: 'composite',
    };
    return this.repository.create!(ownerId, persisted);
  }

  private tryConstruct(params: unknown): ConstructResult {
    try {
      return { ok: true, strategy: new RuleStrategy(params) };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Strategy parameters invalid',
      };
    }
  }
}

function isServiceDependencies(
  value: StrategyLibraryRepositoryInput,
): value is StrategyLibraryServiceDependencies {
  return typeof value === 'object' && value !== null && 'repository' in value;
}

function normalizeName(request: SaveStrategyRequest): string | null {
  if (!isRecord(request) || typeof request.name !== 'string') return null;
  const name = request.name.trim();
  return name.length === 0 || name.length > 80 ? null : name;
}

function toParameterRecord(
  strategy: Strategy,
): Readonly<Record<string, unknown>> {
  return isRecord(strategy.params) ? strategy.params : {};
}

function toCompositeRequest(
  composite: CompositeStrategy,
): CompositeStrategyRequest {
  return {
    members: composite.members.map((member) => ({
      params: member.params,
      strategyId: member.strategyId,
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCompositeRequest(value: unknown): value is CompositeStrategyRequest {
  return isRecord(value) && Array.isArray(value.members);
}

function isCompositeSaveRequest(
  request: SaveStrategyRequest,
): request is SaveCompositeStrategyRequest {
  return request.strategyId === 'composite';
}
