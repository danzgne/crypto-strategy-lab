import type { AppPrismaClient } from '@/database/prismaClient';
import type {
  ExtractionAttemptSample,
  ExtractionTemplateRepository,
  NewExtractionVersionInput,
  Trailing24hExtractionStats,
} from './interfaces/extractionTemplateRepository.interface';
import type {
  ExtractionTemplate,
  ExtractionTemplateVersion,
} from '@crypto-strategy-lab/shared';
import { AppError } from '@/errors/AppError';
import { Prisma } from '../../../../../../../generated/prisma/client';

type PersistedVersion = {
  id: string;
  newsSourceId: string;
  version: number;
  status: string;
  template: Prisma.JsonValue;
  confidence: Prisma.Decimal;
  generatedBy: string;
  basedOnVersionId: string | null;
  projectedEmptyFieldRate: Prisma.Decimal | null;
  projectedMalformedFieldRate: Prisma.Decimal | null;
  activatedAt: Date | null;
  createdAt: Date;
};

function mapVersion(row: PersistedVersion): ExtractionTemplateVersion {
  return {
    id: row.id,
    newsSourceId: row.newsSourceId,
    version: row.version,
    status: row.status as ExtractionTemplateVersion['status'],
    template: row.template as unknown as ExtractionTemplate,
    confidence: Number(row.confidence),
    generatedBy: row.generatedBy,
    basedOnVersionId: row.basedOnVersionId,
    projectedEmptyFieldRate:
      row.projectedEmptyFieldRate === null
        ? null
        : Number(row.projectedEmptyFieldRate),
    projectedMalformedFieldRate:
      row.projectedMalformedFieldRate === null
        ? null
        : Number(row.projectedMalformedFieldRate),
    activatedAt: row.activatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PrismaExtractionTemplateRepository implements ExtractionTemplateRepository {
  public constructor(private readonly prisma: AppPrismaClient) {}

  public async getActiveVersion(
    sourceId: string,
  ): Promise<ExtractionTemplateVersion | null> {
    const row = await this.prisma.extractionTemplateVersion.findFirst({
      where: { newsSourceId: sourceId, status: 'ACTIVE' },
    });
    return row ? mapVersion(row) : null;
  }

  public async getProposedVersion(
    sourceId: string,
  ): Promise<ExtractionTemplateVersion | null> {
    const row = await this.prisma.extractionTemplateVersion.findFirst({
      where: { newsSourceId: sourceId, status: 'PROPOSED' },
    });
    return row ? mapVersion(row) : null;
  }

  public async listVersions(
    sourceId: string,
    limit = 50,
  ): Promise<ExtractionTemplateVersion[]> {
    const rows = await this.prisma.extractionTemplateVersion.findMany({
      where: { newsSourceId: sourceId },
      orderBy: { version: 'desc' },
      take: limit,
    });
    return rows.map(mapVersion);
  }

  public async getVersionById(
    sourceId: string,
    versionId: string,
  ): Promise<ExtractionTemplateVersion | null> {
    const row = await this.prisma.extractionTemplateVersion.findFirst({
      where: { id: versionId, newsSourceId: sourceId },
    });
    return row ? mapVersion(row) : null;
  }

  public async createActiveVersion(
    input: NewExtractionVersionInput,
  ): Promise<ExtractionTemplateVersion> {
    const version = await this.nextVersionNumber(input.newsSourceId);
    const now = new Date();
    const row = await this.prisma.extractionTemplateVersion.create({
      data: {
        newsSourceId: input.newsSourceId,
        version,
        status: 'ACTIVE',
        template: input.template as unknown as Prisma.InputJsonValue,
        confidence: input.confidence,
        generatedBy: input.generatedBy,
        projectedEmptyFieldRate: input.projectedEmptyFieldRate ?? null,
        projectedMalformedFieldRate: input.projectedMalformedFieldRate ?? null,
        activatedAt: now,
      },
    });
    return mapVersion(row);
  }

  public async createProposedVersion(
    input: NewExtractionVersionInput & { basedOnVersionId: string },
  ): Promise<ExtractionTemplateVersion> {
    const version = await this.nextVersionNumber(input.newsSourceId);
    const row = await this.prisma.extractionTemplateVersion.create({
      data: {
        newsSourceId: input.newsSourceId,
        version,
        status: 'PROPOSED',
        template: input.template as unknown as Prisma.InputJsonValue,
        confidence: input.confidence,
        generatedBy: input.generatedBy,
        basedOnVersionId: input.basedOnVersionId,
        projectedEmptyFieldRate: input.projectedEmptyFieldRate ?? null,
        projectedMalformedFieldRate: input.projectedMalformedFieldRate ?? null,
      },
    });
    return mapVersion(row);
  }

  public async activateVersion(
    sourceId: string,
    versionId: string,
    now: Date,
  ): Promise<ExtractionTemplateVersion> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.extractionTemplateVersion.findFirst({
        where: { id: versionId, newsSourceId: sourceId },
      });
      if (!target) {
        throw new AppError('Template version not found', 404, 'NOT_FOUND');
      }
      if (target.status === 'ACTIVE') {
        return mapVersion(target);
      }
      if (target.status === 'REJECTED') {
        throw new AppError(
          'A rejected template version cannot be activated',
          409,
          'VERSION_REJECTED',
        );
      }

      await tx.extractionTemplateVersion.updateMany({
        where: { newsSourceId: sourceId, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED' },
      });

      const updated = await tx.extractionTemplateVersion.update({
        where: { id: versionId },
        data: { status: 'ACTIVE', activatedAt: now },
      });
      return mapVersion(updated);
    });
  }

  public async rejectVersion(
    sourceId: string,
    versionId: string,
  ): Promise<ExtractionTemplateVersion> {
    const target = await this.prisma.extractionTemplateVersion.findFirst({
      where: { id: versionId, newsSourceId: sourceId },
    });
    if (!target) {
      throw new AppError('Template version not found', 404, 'NOT_FOUND');
    }
    if (target.status !== 'PROPOSED') {
      throw new AppError(
        'Only a proposed template version can be rejected',
        409,
        'VERSION_NOT_PROPOSED',
      );
    }

    const updated = await this.prisma.extractionTemplateVersion.update({
      where: { id: versionId },
      data: { status: 'REJECTED' },
    });
    return mapVersion(updated);
  }

  public async getAttemptsForVersionSince(
    templateVersionId: string,
    since: Date,
  ): Promise<ExtractionAttemptSample[]> {
    const rows = await this.prisma.newsCrawlAttempt.findMany({
      where: {
        templateVersionId,
        crawledAt: { gte: since },
        emptyFieldRate: { not: null },
        malformedFieldRate: { not: null },
      },
      select: {
        itemsFound: true,
        emptyFieldRate: true,
        malformedFieldRate: true,
      },
      orderBy: { crawledAt: 'asc' },
    });

    return rows.flatMap((row) => {
      if (row.emptyFieldRate === null || row.malformedFieldRate === null)
        return [];
      return [
        {
          itemsFound: row.itemsFound,
          emptyFieldRate: Number(row.emptyFieldRate),
          malformedFieldRate: Number(row.malformedFieldRate),
        },
      ];
    });
  }

  public async getTrailing24hStats(
    sourceId: string,
    now: Date,
  ): Promise<Trailing24hExtractionStats> {
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const rows = await this.prisma.newsCrawlAttempt.findMany({
      where: {
        newsSourceId: sourceId,
        crawledAt: { gte: windowStart, lte: now },
        avgConfidence: { not: null },
      },
      select: { itemsFound: true, avgConfidence: true },
    });

    let itemsAnalysed = 0;
    let weightedConfidenceSum = 0;
    let confidenceWeight = 0;

    for (const row of rows) {
      itemsAnalysed += row.itemsFound;
      if (row.avgConfidence === null) continue;
      const weight = Math.max(row.itemsFound, 1);
      weightedConfidenceSum += weight * Number(row.avgConfidence);
      confidenceWeight += weight;
    }

    return {
      avgConfidence:
        confidenceWeight > 0 ? weightedConfidenceSum / confidenceWeight : null,
      itemsAnalysed,
    };
  }

  private async nextVersionNumber(sourceId: string): Promise<number> {
    const latest = await this.prisma.extractionTemplateVersion.findFirst({
      where: { newsSourceId: sourceId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (latest?.version ?? 0) + 1;
  }
}
