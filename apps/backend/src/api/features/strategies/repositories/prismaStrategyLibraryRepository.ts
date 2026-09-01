import { isStrategyProvenance } from '@crypto-strategy-lab/shared';
import { Prisma } from '../../../../../../../generated/prisma/client';

import type { AppPrismaClient } from '@/database/prismaClient';

import type {
  AddLibraryVersionInput,
  AddLibraryVersionResult,
  CreateLibraryEntryInput,
  LibraryEntryDetailRow,
  LibraryEntryRow,
  LibraryVersionForOwner,
  LibraryVersionRow,
  ListLibraryEntriesOptions,
  ListLibraryEntriesResult,
  StrategyLibraryRepository,
  UpdateLibraryEntryMetadataInput,
} from './interfaces/strategyLibraryRepository.interface';

interface StrategyDefinitionRow {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  type: string;
  source: string;
  sourceInput: string | null;
  tags: string[];
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  versions: Array<{
    id: string;
    params: unknown;
    versionTag: string;
    libraryVersion: string;
    createdAt: Date;
  }>;
}

export class PrismaStrategyLibraryRepository implements StrategyLibraryRepository {
  public constructor(private readonly prisma: AppPrismaClient) {}

  public async create(
    input: CreateLibraryEntryInput,
  ): Promise<LibraryEntryDetailRow> {
    const created = await this.prisma.strategyDefinition.create({
      data: {
        ownerId: input.ownerId,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        source: input.source,
        sourceInput: input.sourceInput ?? null,
        tags: [...input.tags],
        recordKind: 'LIBRARY_ENTRY',
        versions: {
          create: {
            ownerId: input.ownerId,
            params: toInputJson(input.params),
            versionTag: input.versionTag,
            libraryVersion: input.libraryVersion,
            canonicalIdentity: input.canonicalIdentity,
          },
        },
      },
      include: { versions: { orderBy: { createdAt: 'asc' } } },
    });

    return mapDetail(created);
  }

  public async listEntries(
    ownerId: string,
    options: ListLibraryEntriesOptions,
  ): Promise<ListLibraryEntriesResult> {
    const where = {
      ownerId,
      recordKind: 'LIBRARY_ENTRY' as const,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.strategyDefinition.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit,
        skip: options.offset,
        include: {
          versions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.strategyDefinition.count({ where }),
    ]);

    return { entries: rows.filter(hasVersion).map(mapEntry), total };
  }

  public async getEntry(
    ownerId: string,
    entryId: string,
  ): Promise<LibraryEntryDetailRow | null> {
    const row = await this.prisma.strategyDefinition.findFirst({
      where: { id: entryId, ownerId, recordKind: 'LIBRARY_ENTRY' },
      include: { versions: { orderBy: { createdAt: 'asc' } } },
    });
    if (row === null || !hasVersion(row)) return null;
    return mapDetail(row);
  }

  public async addVersion(
    ownerId: string,
    entryId: string,
    input: AddLibraryVersionInput,
  ): Promise<AddLibraryVersionResult | null> {
    return this.prisma.$transaction(async (transaction) => {
      const definition = await transaction.strategyDefinition.findFirst({
        where: { id: entryId, ownerId, recordKind: 'LIBRARY_ENTRY' },
      });
      if (definition === null) return null;

      const duplicateLabel = await transaction.strategyVersion.findFirst({
        where: {
          strategyDefinitionId: entryId,
          libraryVersion: input.libraryVersion,
        },
      });
      const existingByIdentity = await transaction.strategyVersion.findUnique({
        where: {
          ownerId_strategyDefinitionId_canonicalIdentity: {
            ownerId,
            strategyDefinitionId: entryId,
            canonicalIdentity: input.canonicalIdentity,
          },
        },
      });

      if (
        duplicateLabel !== null &&
        existingByIdentity?.id !== duplicateLabel.id
      ) {
        return { outcome: 'DUPLICATE_LIBRARY_VERSION' };
      }

      if (existingByIdentity === null) {
        await transaction.strategyVersion.create({
          data: {
            ownerId,
            strategyDefinitionId: entryId,
            params: toInputJson(input.params),
            versionTag: input.versionTag,
            libraryVersion: input.libraryVersion,
            canonicalIdentity: input.canonicalIdentity,
          },
        });
      }

      const reloaded = await transaction.strategyDefinition.findUniqueOrThrow({
        where: { id: entryId },
        include: { versions: { orderBy: { createdAt: 'asc' } } },
      });
      return { outcome: 'CREATED', entry: mapDetail(reloaded) };
    });
  }

  public async updateMetadata(
    ownerId: string,
    entryId: string,
    input: UpdateLibraryEntryMetadataInput,
  ): Promise<LibraryEntryDetailRow | null> {
    const updated = await this.prisma.strategyDefinition.updateMany({
      where: { id: entryId, ownerId, recordKind: 'LIBRARY_ENTRY' },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.tags === undefined ? {} : { tags: [...input.tags] }),
      },
    });
    if (updated.count === 0) return null;
    return this.getEntry(ownerId, entryId);
  }

  public async setArchived(
    ownerId: string,
    entryId: string,
    archived: boolean,
  ): Promise<LibraryEntryDetailRow | null> {
    const updated = await this.prisma.strategyDefinition.updateMany({
      where: { id: entryId, ownerId, recordKind: 'LIBRARY_ENTRY' },
      data: { archivedAt: archived ? new Date() : null },
    });
    if (updated.count === 0) return null;
    return this.getEntry(ownerId, entryId);
  }

  public async findVersionForOwner(
    ownerId: string,
    versionId: string,
  ): Promise<LibraryVersionForOwner | null> {
    const version = await this.prisma.strategyVersion.findFirst({
      where: {
        id: versionId,
        ownerId,
        strategyDefinition: { recordKind: 'LIBRARY_ENTRY' },
      },
      include: { strategyDefinition: true },
    });
    if (version === null) return null;
    return {
      id: version.id,
      entryId: version.strategyDefinitionId,
      strategyId: version.strategyDefinition.type,
      params: version.params,
    };
  }
}

function hasVersion(row: StrategyDefinitionRow): boolean {
  return row.versions.length > 0;
}

function mapVersion(version: {
  id: string;
  params: unknown;
  versionTag: string;
  libraryVersion: string;
  createdAt: Date;
}): LibraryVersionRow {
  return {
    id: version.id,
    params: version.params,
    versionTag: version.versionTag,
    libraryVersion: version.libraryVersion,
    createdAt: version.createdAt,
  };
}

function mapEntry(row: StrategyDefinitionRow): LibraryEntryRow {
  const latest = row.versions[0];
  if (latest === undefined) {
    throw new Error(
      `Strategy definition ${row.id} has no versions; this should be unreachable`,
    );
  }
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    description: row.description,
    type: row.type,
    source: assertProvenance(row.source),
    sourceInput: row.sourceInput,
    tags: row.tags,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    latestVersion: mapVersion(latest),
  };
}

function mapDetail(row: StrategyDefinitionRow): LibraryEntryDetailRow {
  const versions = row.versions.map(mapVersion);
  const latestVersion = versions.at(-1);
  if (latestVersion === undefined) {
    throw new Error(
      `Strategy definition ${row.id} has no versions; this should be unreachable`,
    );
  }
  return { ...mapEntry(row), versions, latestVersion };
}

function assertProvenance(source: string) {
  if (!isStrategyProvenance(source)) {
    throw new Error(`Strategy library entry has an unknown source "${source}"`);
  }
  return source;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
