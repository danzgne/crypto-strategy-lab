import type { RuleStrategyParams } from '@crypto-strategy-lab/shared';

import type { AppPrismaClient } from '@/database/prismaClient';

import type {
  CreateStrategyLibraryEntryInput,
  StrategyLibraryEntry,
  StrategyLibraryRepository,
} from './interfaces/strategyLibraryRepository.interface';

interface StrategyDefinitionRow {
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

  public async createWithFirstVersion(
    input: CreateStrategyLibraryEntryInput,
  ): Promise<StrategyLibraryEntry> {
    const created = await this.prisma.strategyDefinition.create({
      data: {
        ownerId: input.ownerId,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        source: input.source,
        sourceInput: input.sourceInput,
        tags: [...input.tags],
        versions: {
          create: {
            ownerId: input.ownerId,
            params: input.params as object,
            versionTag: input.versionTag,
            libraryVersion: input.libraryVersion,
          },
        },
      },
      include: { versions: true },
    });

    return mapEntry(created);
  }

  public async listRecentByOwner(
    ownerId: string,
    limit: number,
  ): Promise<StrategyLibraryEntry[]> {
    const rows = await this.prisma.strategyDefinition.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        versions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return rows.filter(hasVersion).map(mapEntry);
  }
}

function hasVersion(row: StrategyDefinitionRow): boolean {
  return row.versions.length > 0;
}

function mapEntry(row: StrategyDefinitionRow): StrategyLibraryEntry {
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
    source: row.source,
    sourceInput: row.sourceInput,
    tags: row.tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    latestVersion: {
      id: latest.id,
      params: latest.params as RuleStrategyParams,
      versionTag: latest.versionTag,
      libraryVersion: latest.libraryVersion,
      createdAt: latest.createdAt,
    },
  };
}
