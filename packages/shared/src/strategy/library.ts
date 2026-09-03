import type { CompositeStrategyRequest } from '../realtime/transport';
import type { StrategyParamsSchema } from './types';
import type { StrategyProvenance } from './ruleParams';

export type LibraryEntryKind = 'singular' | 'composite';

export type LibraryEntryParams = Readonly<Record<string, unknown>>;

export interface LibraryEntryVersion {
  id: string;
  versionTag: string;
  libraryVersion: string;
  createdAt: string;
  params?: LibraryEntryParams;
  composite?: CompositeStrategyRequest;
}

interface LibraryEntryBase {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  source: StrategyProvenance;
  sourceInput: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  latestVersion: LibraryEntryVersion;
}

export interface SingularLibraryEntry extends LibraryEntryBase {
  kind: 'singular';
  strategyId: string;
}

export interface CompositeLibraryEntry extends LibraryEntryBase {
  kind: 'composite';
  strategyId: 'composite';
}

export type LibraryEntry = SingularLibraryEntry | CompositeLibraryEntry;

export interface LibraryEntryDetail extends LibraryEntryBase {
  kind: LibraryEntryKind;
  strategyId: string;
  versions: LibraryEntryVersion[];
}

export interface LibraryBuiltin {
  strategyId: string;
  paramsSchema: StrategyParamsSchema;
  // True for a Strategy usable only in live/preview evaluation (e.g. NewsSentimentStrategy), never
  // in a historical Search Space or backtest. Mirrors StrategyRegistry so clients don't duplicate it.
  liveOnly?: boolean;
}

export interface LibraryListResponse {
  builtins: LibraryBuiltin[];
  entries: LibraryEntry[];
  total: number;
  limit: number;
  offset: number;
}

interface CreateLibraryEntryRequestBase {
  name: string;
  description?: string;
  tags?: readonly string[];
  libraryVersion?: string;
  source: StrategyProvenance;
  sourceInput?: string;
}

export interface CreateSingularLibraryEntryRequest extends CreateLibraryEntryRequestBase {
  strategyId: string;
  params?: LibraryEntryParams;
  composite?: never;
}

export interface CreateCompositeLibraryEntryRequest extends CreateLibraryEntryRequestBase {
  strategyId: 'composite';
  composite: CompositeStrategyRequest;
  params?: never;
}

export type CreateLibraryEntryRequest =
  CreateSingularLibraryEntryRequest | CreateCompositeLibraryEntryRequest;

export interface AddLibraryEntryVersionRequest {
  libraryVersion: string;
  params?: LibraryEntryParams;
  composite?: CompositeStrategyRequest;
}

export interface UpdateLibraryEntryMetadataRequest {
  name?: string;
  description?: string;
  tags?: readonly string[];
}

export interface ArchiveLibraryEntryRequest {
  archived: boolean;
}
