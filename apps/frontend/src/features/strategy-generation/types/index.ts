import type {
  RuleStrategyParams,
  StrategyProvenance,
} from '@crypto-strategy-lab/shared/strategy';

export type { RuleStrategyParams, StrategyProvenance };

export type GenerationKind = 'USER_PROMPT' | 'WEB_IMPORT';

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
  source: GenerationKind;
  sourceInput: string;
  libraryVersion?: string | undefined;
  strategyId: 'rule';
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
  sourceInput: string | null;
  createdAt: string;
  latestVersion: StrategyLibraryVersion;
}

export interface StrategyLibrarySummary {
  id: string;
  name: string;
  source: StrategyProvenance;
  createdAt: string;
  libraryVersion: string;
  tags: string[];
}

export interface ValidateStrategyResult {
  valid: boolean;
  message?: string;
}
