import type {
  RuleStrategyParams,
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

export interface StrategyLibraryRepository {
  createWithFirstVersion(
    input: CreateStrategyLibraryEntryInput,
  ): Promise<StrategyLibraryEntry>;
  listRecentByOwner(
    ownerId: string,
    limit: number,
  ): Promise<StrategyLibraryEntry[]>;
}
