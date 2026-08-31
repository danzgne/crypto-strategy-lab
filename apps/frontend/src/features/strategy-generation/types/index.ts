import type {
  RuleStrategyParams,
  StrategyProvenance,
} from '@crypto-strategy-lab/shared/strategy';

export type { RuleStrategyParams, StrategyProvenance };

export type GenerationKind = StrategyProvenance;

export interface GenerateStrategyRequest {
  kind: GenerationKind;
  input: string;
}

export interface GenerateStrategyResponse {
  name: string;
  description: string;
  tags: string[];
  params: RuleStrategyParams;
  unsupportedRequests: string[];
  generatedBy: string;
}

export interface SaveStrategyRequest {
  name: string;
  description?: string | undefined;
  tags?: string[] | undefined;
  source: StrategyProvenance;
  sourceInput: string;
  libraryVersion?: string | undefined;
  params: RuleStrategyParams;
}

export interface StrategyLibraryVersion {
  id: string;
  params: RuleStrategyParams;
  versionTag: string;
  libraryVersion: string;
}

export interface StrategyLibraryEntry {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  source: StrategyProvenance;
  sourceInput: string;
  createdAt: string;
  version: StrategyLibraryVersion;
}

export interface StrategyLibrarySummary {
  id: string;
  name: string;
  source: StrategyProvenance;
  createdAt: string;
  libraryVersion: string;
  tags: string[];
}
