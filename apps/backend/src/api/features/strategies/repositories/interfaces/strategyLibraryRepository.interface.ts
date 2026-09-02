import type { StrategyProvenance } from '@crypto-strategy-lab/shared';

export interface LibraryVersionRow {
  id: string;
  params: unknown;
  versionTag: string;
  libraryVersion: string;
  createdAt: Date;
}

export interface LibraryEntryRow {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  type: string;
  source: StrategyProvenance;
  sourceInput: string | null;
  tags: string[];
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  latestVersion: LibraryVersionRow;
}

export interface LibraryEntryDetailRow extends LibraryEntryRow {
  versions: LibraryVersionRow[];
}

export interface CreateLibraryEntryInput {
  ownerId: string;
  name: string;
  description?: string | undefined;
  tags: readonly string[];
  type: string;
  source: StrategyProvenance;
  sourceInput?: string | undefined;
  params: unknown;
  canonicalIdentity: string;
  versionTag: string;
  libraryVersion: string;
}

export interface ListLibraryEntriesOptions {
  limit: number;
  offset: number;
  includeArchived: boolean;
}

export interface ListLibraryEntriesResult {
  entries: LibraryEntryRow[];
  total: number;
}

export interface AddLibraryVersionInput {
  params: unknown;
  versionTag: string;
  libraryVersion: string;
}

export type AddLibraryVersionResult =
  | { outcome: 'CREATED'; entry: LibraryEntryDetailRow }
  | { outcome: 'DUPLICATE_LIBRARY_VERSION' };

export interface UpdateLibraryEntryMetadataInput {
  name?: string | undefined;
  description?: string | undefined;
  tags?: readonly string[] | undefined;
}

export interface LibraryVersionForOwner {
  id: string;
  entryId: string;
  strategyId: string;
  params: unknown;
}

export interface StrategyLibraryRepository {
  create(input: CreateLibraryEntryInput): Promise<LibraryEntryDetailRow>;

  listEntries(
    ownerId: string,
    options: ListLibraryEntriesOptions,
  ): Promise<ListLibraryEntriesResult>;

  getEntry(
    ownerId: string,
    entryId: string,
  ): Promise<LibraryEntryDetailRow | null>;

  addVersion(
    ownerId: string,
    entryId: string,
    input: AddLibraryVersionInput,
  ): Promise<AddLibraryVersionResult | null>;

  updateMetadata(
    ownerId: string,
    entryId: string,
    input: UpdateLibraryEntryMetadataInput,
  ): Promise<LibraryEntryDetailRow | null>;

  setArchived(
    ownerId: string,
    entryId: string,
    archived: boolean,
  ): Promise<LibraryEntryDetailRow | null>;

  findVersionForOwner(
    ownerId: string,
    versionId: string,
  ): Promise<LibraryVersionForOwner | null>;
}
