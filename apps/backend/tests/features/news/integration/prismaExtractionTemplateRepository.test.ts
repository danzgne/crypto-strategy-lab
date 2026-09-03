import { config as loadEnvironment } from 'dotenv';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  createPrismaClient,
  type AppPrismaClient,
} from '@/database/prismaClient';
import { PrismaExtractionTemplateRepository } from '@/api/features/news/repositories/prismaExtractionTemplateRepository';
import type { ExtractionTemplate } from '@crypto-strategy-lab/shared';

loadEnvironment({
  path: new URL('../../../../../../.env', import.meta.url),
  quiet: true,
});

const TEMPLATE: ExtractionTemplate = {
  item: 'article.card',
  fields: {
    title: { selector: 'h2' },
    summary: { selector: 'p' },
    publishedAt: { selector: 'time', attr: 'datetime' },
    url: { selector: 'a' },
  },
  confidence: 0.9,
};

// Each test creates and tears down its own News Source rather than sharing one across
// the file: an unrelated integration suite (newsRoutes.test.ts) truncates news_sources
// wholesale in its own beforeAll/afterAll, and vitest runs test files concurrently
// against the same database, so a source shared for the whole file's duration would
// race with that. Scoping creation to beforeEach shrinks the exposure to one test.
describe('PrismaExtractionTemplateRepository', () => {
  let prisma: AppPrismaClient;
  let repository: PrismaExtractionTemplateRepository;
  let sourceId: string;

  beforeAll(async () => {
    prisma = createPrismaClient(process.env.DATABASE_URL!);
    await prisma.$connect();
    repository = new PrismaExtractionTemplateRepository(prisma);
  });

  beforeEach(async () => {
    const source = await prisma.newsSource.create({
      data: {
        name: `Issue46 fixture ${Date.now()}`,
        url: `https://issue46-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.example.com/news/`,
        providerType: 'WEBSITE',
      },
    });
    sourceId = source.id;
  });

  afterEach(async () => {
    await prisma.extractionTemplateVersion.deleteMany({
      where: { newsSourceId: sourceId },
    });
    await prisma.newsSource.deleteMany({ where: { id: sourceId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates version 1 as ACTIVE, immediately activated', async () => {
    const version = await repository.createActiveVersion({
      newsSourceId: sourceId,
      template: TEMPLATE,
      confidence: 0.9,
      generatedBy: 'test-provider',
    });

    expect(version.version).toBe(1);
    expect(version.status).toBe('ACTIVE');
    expect(version.activatedAt).not.toBeNull();

    const active = await repository.getActiveVersion(sourceId);
    expect(active?.id).toBe(version.id);
  });

  it('rejects a second ACTIVE row for the same source at the database level', async () => {
    await repository.createActiveVersion({
      newsSourceId: sourceId,
      template: TEMPLATE,
      confidence: 0.9,
      generatedBy: 'test-provider',
    });

    await expect(
      prisma.extractionTemplateVersion.create({
        data: {
          newsSourceId: sourceId,
          version: 999,
          status: 'ACTIVE',
          template: TEMPLATE as unknown as object,
          confidence: 0.5,
          generatedBy: 'raw-insert',
        },
      }),
    ).rejects.toThrow();
  });

  it('numbers a proposed version 2 and links it to the active version', async () => {
    const active = await repository.createActiveVersion({
      newsSourceId: sourceId,
      template: TEMPLATE,
      confidence: 0.9,
      generatedBy: 'test-provider',
    });

    const proposed = await repository.createProposedVersion({
      newsSourceId: sourceId,
      template: { ...TEMPLATE, confidence: 0.7 },
      confidence: 0.7,
      generatedBy: 'test-provider',
      basedOnVersionId: active.id,
      projectedEmptyFieldRate: 0.02,
      projectedMalformedFieldRate: 0.01,
    });

    expect(proposed.version).toBe(2);
    expect(proposed.status).toBe('PROPOSED');
    expect(proposed.basedOnVersionId).toBe(active.id);

    const stillProposed = await repository.getProposedVersion(sourceId);
    expect(stillProposed?.id).toBe(proposed.id);
  });

  it('activating a proposed version supersedes the previously active one, in one transaction', async () => {
    const previousActive = await repository.createActiveVersion({
      newsSourceId: sourceId,
      template: TEMPLATE,
      confidence: 0.9,
      generatedBy: 'test-provider',
    });
    const proposed = await repository.createProposedVersion({
      newsSourceId: sourceId,
      template: { ...TEMPLATE, confidence: 0.7 },
      confidence: 0.7,
      generatedBy: 'test-provider',
      basedOnVersionId: previousActive.id,
    });

    const activated = await repository.activateVersion(
      sourceId,
      proposed.id,
      new Date(),
    );

    expect(activated.status).toBe('ACTIVE');
    expect(activated.id).toBe(proposed.id);

    const supersededPrevious = await repository.getVersionById(
      sourceId,
      previousActive.id,
    );
    expect(supersededPrevious?.status).toBe('SUPERSEDED');

    const nowActive = await repository.getActiveVersion(sourceId);
    expect(nowActive?.id).toBe(proposed.id);
  });

  it('rolling back to a superseded version mints no new version number', async () => {
    const supersededOne = await repository.createActiveVersion({
      newsSourceId: sourceId,
      template: TEMPLATE,
      confidence: 0.9,
      generatedBy: 'test-provider',
    });
    const proposed = await repository.createProposedVersion({
      newsSourceId: sourceId,
      template: { ...TEMPLATE, confidence: 0.7 },
      confidence: 0.7,
      generatedBy: 'test-provider',
      basedOnVersionId: supersededOne.id,
    });
    await repository.activateVersion(sourceId, proposed.id, new Date());

    const versionsBefore = await repository.listVersions(sourceId);
    const rolledBack = await repository.activateVersion(
      sourceId,
      supersededOne.id,
      new Date(),
    );

    expect(rolledBack.version).toBe(supersededOne.version);
    const versionsAfter = await repository.listVersions(sourceId);
    expect(versionsAfter).toHaveLength(versionsBefore.length);
  });

  it('rejects a proposed version, and it cannot be reactivated', async () => {
    const active = await repository.createActiveVersion({
      newsSourceId: sourceId,
      template: TEMPLATE,
      confidence: 0.9,
      generatedBy: 'test-provider',
    });
    const proposal = await repository.createProposedVersion({
      newsSourceId: sourceId,
      template: TEMPLATE,
      confidence: 0.6,
      generatedBy: 'test-provider',
      basedOnVersionId: active.id,
    });

    const rejected = await repository.rejectVersion(sourceId, proposal.id);
    expect(rejected.status).toBe('REJECTED');

    await expect(
      repository.activateVersion(sourceId, proposal.id, new Date()),
    ).rejects.toThrow(/rejected/i);
  });
});
