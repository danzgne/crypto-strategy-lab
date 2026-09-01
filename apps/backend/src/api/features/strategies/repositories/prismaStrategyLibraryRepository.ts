import type {
  CompositeStrategyRequest,
  RuleStrategyParams,
  SavedStrategy,
  SavedStrategyParams,
} from '@crypto-strategy-lab/shared';
import { computeStrategyVersionTag } from '@crypto-strategy-lab/shared/strategy-version';
import {
  canonicalStrategyVersionId,
  canonicalizeValue,
} from '@crypto-strategy-lab/shared/strategy';
import { Prisma } from '../../../../../../../generated/prisma/client';

import type { AppPrismaClient } from '@/database/prismaClient';

import type {
  CreateStrategyLibraryEntryInput,
  PersistedStrategyRequest,
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

export class PrismaStrategyLibraryRepository
  implements StrategyLibraryRepository
{
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

  public async listByOwner(ownerId: string): Promise<SavedStrategy[]> {
    const versions = await this.prisma.strategyVersion.findMany({
      include: { strategyDefinition: true },
      orderBy: { createdAt: 'desc' },
      where: { ownerId, strategyDefinition: { isPrivate: false } },
    });

    return versions.map((version) =>
      toSavedStrategy({
        createdAt: version.createdAt,
        definition: version.strategyDefinition,
        params: version.params,
        versionId: version.id,
      }),
    );
  }

  public async create(
    ownerId: string,
    request: PersistedStrategyRequest,
  ): Promise<SavedStrategy> {
    const params = 'composite' in request ? request.composite : request.params;
    const versionTag =
      request.versionTag ??
      computeStrategyVersionTag(request.strategyId, params);
    const canonicalIdentity = canonicalIdentityForRequest(request);
    const record = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.strategyVersion.findUnique({
        include: { strategyDefinition: true },
        where: {
          ownerId_canonicalIdentity: { canonicalIdentity, ownerId },
        },
      });
      const version =
        existing?.strategyDefinition.isPrivate === false
          ? existing
          : await (async () => {
              const definition = await transaction.strategyDefinition.create({
                data: {
                  description: request.description ?? null,
                  isPrivate: false,
                  name: request.name,
                  ownerId,
                  source: request.source ?? 'USER_PROMPT',
                  sourceInput: request.sourceInput ?? request.name,
                  tags: [...(request.tags ?? [])],
                  type: request.strategyId,
                },
              });
              return transaction.strategyVersion.create({
                data: {
                  canonicalIdentity,
                  libraryVersion: request.libraryVersion ?? '1.0.0',
                  ownerId,
                  params: toInputJson(params),
                  strategyDefinitionId: definition.id,
                  versionTag,
                },
              });
            })();
      const definition = await transaction.strategyDefinition.findUniqueOrThrow(
        { where: { id: version.strategyDefinitionId } },
      );

      return {
        createdAt: version.createdAt,
        definition,
        params: version.params,
        versionId: version.id,
      };
    });

    return toSavedStrategy(record);
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

function canonicalIdentityForRequest(
  request: PersistedStrategyRequest,
): string {
  if (!('composite' in request)) {
    return canonicalStrategyVersionId(request.strategyId, request.params);
  }

  const members = request.composite.members
    .map((member) => ({
      versionId: canonicalStrategyVersionId(
        member.strategyId,
        member.params ?? {},
      ),
      weight: member.weight ?? 1,
    }))
    .sort((left, right) => left.versionId.localeCompare(right.versionId));
  return canonicalizeValue({
    members,
    mode: request.composite.mode,
    stopLoss: request.composite.stopLoss,
    takeProfit: request.composite.takeProfit,
    threshold: request.composite.threshold ?? 0.3,
  });
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toSavedStrategy({
  createdAt,
  definition,
  params,
  versionId,
}: {
  createdAt: Date;
  definition: {
    id: string;
    name: string;
    description: string | null;
    type: string;
  };
  params: unknown;
  versionId: string;
}): SavedStrategy {
  const base = {
    createdAt: createdAt.toISOString(),
    description: definition.description,
    id: definition.id,
    name: definition.name,
    versionId,
  };

  if (definition.type === 'composite') {
    return {
      ...base,
      composite: params as CompositeStrategyRequest,
      kind: 'composite',
      strategyId: 'composite',
    };
  }

  return {
    ...base,
    kind: 'singular',
    params: isRecord(params) ? params : {},
    strategyId: definition.type,
  } satisfies SavedStrategy;
}

function isRecord(value: unknown): value is SavedStrategyParams {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
