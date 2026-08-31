import type {
  RuleStrategyParams,
  StrategyProvenance,
} from '@crypto-strategy-lab/shared';
import { computeStrategyVersionTag } from '@crypto-strategy-lab/shared/strategy-version';
import {
  RULE_STRATEGY_ID,
  RuleStrategy,
} from '@crypto-strategy-lab/strategy-engine';

import type {
  StrategyLibraryEntry,
  StrategyLibraryRepository,
} from '../repositories/interfaces/strategyLibraryRepository.interface';

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

export interface StrategyLibraryServiceDependencies {
  repository: StrategyLibraryRepository;
}

export class StrategyLibraryService {
  private readonly repository: StrategyLibraryRepository;

  public constructor({ repository }: StrategyLibraryServiceDependencies) {
    this.repository = repository;
  }

  public async save(input: SaveStrategyInput): Promise<SaveStrategyResult> {
    let strategy: RuleStrategy;
    try {
      strategy = new RuleStrategy(input.params);
    } catch (error) {
      return {
        outcome: 'GENERATION_INVALID',
        message: (error as Error).message,
      };
    }

    const versionTag = computeStrategyVersionTag(
      RULE_STRATEGY_ID,
      strategy.params,
    );

    const entry = await this.repository.createWithFirstVersion({
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

  public async listRecent(
    ownerId: string,
    limit: number = DEFAULT_LIST_LIMIT,
  ): Promise<StrategyLibraryEntry[]> {
    return this.repository.listRecentByOwner(ownerId, limit);
  }
}
