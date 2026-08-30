import type {
  CompositeStrategyRequest,
  RuleStrategyParams,
  SavedStrategy,
  StrategyProvenance,
} from '@crypto-strategy-lab/shared';

export interface CreateStrategyLibraryEntryInput {
  ownerId: string;
  name: string;
  description?: string | undefined;
  tags: readonly string[];
  type: string;
  source: StrategyProvenance;
  sourceInput: string;
  params: RuleStrategyParams;
  versionTag: string;
  libraryVersion: string;
}

export interface StrategyLibraryVersionSummary {
  id: string;
  params: RuleStrategyParams;
  versionTag: string;
  libraryVersion: string;
  createdAt: Date;
}

export interface StrategyLibraryEntry {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  type: string;
  source: string;
  sourceInput: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  latestVersion: StrategyLibraryVersionSummary;
}

export type PersistedStrategyRequest =
  PersistedSingularStrategyRequest | PersistedCompositeStrategyRequest;

interface PersistedStrategyMetadata {
  description?: string;
  source?: StrategyProvenance;
  sourceInput?: string;
  tags?: readonly string[];
  versionTag?: string;
  libraryVersion?: string;
}

export interface PersistedSingularStrategyRequest extends PersistedStrategyMetadata {
  name: string;
  strategyId: string;
  params: Readonly<Record<string, unknown>>;
  composite?: never;
}

export interface PersistedCompositeStrategyRequest extends PersistedStrategyMetadata {
  name: string;
  strategyId: 'composite';
  composite: CompositeStrategyRequest;
  params?: never;
}

export interface StrategyLibraryRepository {
  createWithFirstVersion?(
    input: CreateStrategyLibraryEntryInput,
  ): Promise<StrategyLibraryEntry>;
  listRecentByOwner?(
    ownerId: string,
    limit: number,
  ): Promise<StrategyLibraryEntry[]>;
  listByOwner?(ownerId: string): Promise<SavedStrategy[]>;
  create?(
    ownerId: string,
    request: PersistedStrategyRequest,
  ): Promise<SavedStrategy>;
}
