import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type {
  ExtractionTemplate,
  ExtractionTemplateVersion,
  NewsSource,
} from '@crypto-strategy-lab/shared';
import type {
  LlmJsonGenerateInput,
  LlmJsonGenerateResult,
  LlmJsonProvider,
} from '@/llm/llmJsonProvider.interface';
import { ExtractionTemplateService } from '@/api/features/news/services/extraction/extractionTemplateService';
import type {
  ExtractionAttemptSample,
  ExtractionTemplateRepository,
  NewExtractionVersionInput,
  Trailing24hExtractionStats,
} from '@/api/features/news/repositories/interfaces/extractionTemplateRepository.interface';
import { createAppLogger } from '@/utils/logger';

const VALID_TEMPLATE_WIRE = {
  item: 'article.cs-article-card',
  fields: {
    title: { selector: 'h2.cs-article-card__title', attr: null },
    summary: { selector: 'p.cs-article-card__excerpt', attr: null },
    publishedAt: { selector: 'time', attr: 'datetime' },
    url: { selector: 'a.cs-article-card__link', attr: null },
  },
  confidence: 0.85,
  notes: null,
};

const INVALID_SELECTOR_TEMPLATE_WIRE = {
  ...VALID_TEMPLATE_WIRE,
  item: 'article > div.card',
};

class FakeExtractionTemplateRepository implements ExtractionTemplateRepository {
  public versions: ExtractionTemplateVersion[] = [];
  private nextId = 1;
  public attemptsByVersionId = new Map<string, ExtractionAttemptSample[]>();
  public trailing24h: Trailing24hExtractionStats = {
    avgConfidence: null,
    itemsAnalysed: 0,
  };

  public async getActiveVersion(
    sourceId: string,
  ): Promise<ExtractionTemplateVersion | null> {
    return (
      this.versions.find(
        (v) => v.newsSourceId === sourceId && v.status === 'ACTIVE',
      ) ?? null
    );
  }

  public async getProposedVersion(
    sourceId: string,
  ): Promise<ExtractionTemplateVersion | null> {
    return (
      this.versions.find(
        (v) => v.newsSourceId === sourceId && v.status === 'PROPOSED',
      ) ?? null
    );
  }

  public async listVersions(
    sourceId: string,
  ): Promise<ExtractionTemplateVersion[]> {
    return this.versions
      .filter((v) => v.newsSourceId === sourceId)
      .sort((a, b) => b.version - a.version);
  }

  public async getVersionById(
    sourceId: string,
    versionId: string,
  ): Promise<ExtractionTemplateVersion | null> {
    return (
      this.versions.find(
        (v) => v.newsSourceId === sourceId && v.id === versionId,
      ) ?? null
    );
  }

  public async createActiveVersion(
    input: NewExtractionVersionInput,
  ): Promise<ExtractionTemplateVersion> {
    const version = this.buildVersion(input, 'ACTIVE', null);
    version.activatedAt = new Date().toISOString();
    this.versions.push(version);
    return version;
  }

  public async createProposedVersion(
    input: NewExtractionVersionInput & { basedOnVersionId: string },
  ): Promise<ExtractionTemplateVersion> {
    const version = this.buildVersion(
      input,
      'PROPOSED',
      input.basedOnVersionId,
    );
    this.versions.push(version);
    return version;
  }

  public async activateVersion(
    sourceId: string,
    versionId: string,
    now: Date,
  ): Promise<ExtractionTemplateVersion> {
    const target = this.versions.find(
      (v) => v.newsSourceId === sourceId && v.id === versionId,
    );
    if (!target) throw new Error('not found');
    for (const v of this.versions) {
      if (v.newsSourceId === sourceId && v.status === 'ACTIVE')
        v.status = 'SUPERSEDED';
    }
    target.status = 'ACTIVE';
    target.activatedAt = now.toISOString();
    return target;
  }

  public async rejectVersion(
    sourceId: string,
    versionId: string,
  ): Promise<ExtractionTemplateVersion> {
    const target = this.versions.find(
      (v) => v.newsSourceId === sourceId && v.id === versionId,
    );
    if (!target) throw new Error('not found');
    target.status = 'REJECTED';
    return target;
  }

  public async getAttemptsForVersionSince(
    templateVersionId: string,
  ): Promise<ExtractionAttemptSample[]> {
    return this.attemptsByVersionId.get(templateVersionId) ?? [];
  }

  public async getTrailing24hStats(): Promise<Trailing24hExtractionStats> {
    return this.trailing24h;
  }

  private buildVersion(
    input: NewExtractionVersionInput,
    status: ExtractionTemplateVersion['status'],
    basedOnVersionId: string | null,
  ): ExtractionTemplateVersion {
    const existing = this.versions.filter(
      (v) => v.newsSourceId === input.newsSourceId,
    );
    const version =
      existing.length === 0
        ? 1
        : Math.max(...existing.map((v) => v.version)) + 1;
    return {
      id: `version-${this.nextId++}`,
      newsSourceId: input.newsSourceId,
      version,
      status,
      template: input.template,
      confidence: input.confidence,
      generatedBy: input.generatedBy,
      basedOnVersionId,
      projectedEmptyFieldRate: input.projectedEmptyFieldRate ?? null,
      projectedMalformedFieldRate: input.projectedMalformedFieldRate ?? null,
      activatedAt: null,
      createdAt: new Date().toISOString(),
    };
  }
}

function fakeLlmProvider(
  responses: (LlmJsonGenerateResult<unknown> | 'ALL_PROVIDERS_UNAVAILABLE')[],
): LlmJsonProvider {
  const queue = [...responses];
  const generate = vi.fn(async (_input: LlmJsonGenerateInput<unknown>) => {
    const next = queue.shift();
    if (next === undefined || next === 'ALL_PROVIDERS_UNAVAILABLE') {
      return { outcome: 'ALL_PROVIDERS_UNAVAILABLE' };
    }
    return next;
  });
  return {
    name: 'fake',
    generate: generate as unknown as LlmJsonProvider['generate'],
  };
}

function successResult(value: unknown): LlmJsonGenerateResult<unknown> {
  return { outcome: 'SUCCESS', value, generatedBy: 'fake-provider' };
}

const SOURCE: NewsSource = {
  id: 'source-1',
  name: 'CryptoSlate',
  url: 'https://cryptoslate.com/news/',
  providerType: 'WEBSITE',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('ExtractionTemplateService', () => {
  let repository: FakeExtractionTemplateRepository;
  let settings: Map<string, string>;
  let fetchHtml: ReturnType<typeof vi.fn<(url: string) => Promise<string>>>;
  const logger = createAppLogger({ service: 'test', enabled: false });

  beforeEach(() => {
    repository = new FakeExtractionTemplateRepository();
    settings = new Map();
    fetchHtml = vi
      .fn()
      .mockResolvedValue(
        '<html><body><article class="cs-article-card"></article></body></html>',
      );
  });

  function makeService(
    llmProvider: LlmJsonProvider,
  ): ExtractionTemplateService {
    return new ExtractionTemplateService({
      templateRepository: repository,
      sourceLookup: {
        findSourceById: async (id) => (id === SOURCE.id ? SOURCE : null),
      },
      settingsStore: {
        getSetting: async (key) => settings.get(key) ?? null,
        setSetting: async (key, value) => {
          settings.set(key, value);
        },
      },
      llmProvider,
      fetchHtml,
      logger,
      now: () => new Date('2026-09-02T15:16:10.000Z'),
    });
  }

  describe('getActiveTemplate (v1 self-activation)', () => {
    it('generates and self-activates version 1 when a source has no template yet', async () => {
      const llm = fakeLlmProvider([successResult(VALID_TEMPLATE_WIRE)]);
      const service = makeService(llm);

      const active = await service.getActiveTemplate(SOURCE);

      expect(active).not.toBeNull();
      expect(repository.versions).toHaveLength(1);
      expect(repository.versions[0]?.status).toBe('ACTIVE');
      expect(repository.versions[0]?.version).toBe(1);
      expect(repository.versions[0]?.activatedAt).not.toBeNull();
    });

    it('returns the already-active version without calling the LLM again', async () => {
      const llm = fakeLlmProvider([successResult(VALID_TEMPLATE_WIRE)]);
      const service = makeService(llm);

      await service.getActiveTemplate(SOURCE);
      await service.getActiveTemplate(SOURCE);

      expect(llm.generate).toHaveBeenCalledTimes(1);
    });

    it('returns null and stores nothing when the LLM is unavailable', async () => {
      const llm = fakeLlmProvider(['ALL_PROVIDERS_UNAVAILABLE']);
      const service = makeService(llm);

      const active = await service.getActiveTemplate(SOURCE);

      expect(active).toBeNull();
      expect(repository.versions).toHaveLength(0);
    });

    it('returns null and stores nothing when the generated template uses unsupported selectors', async () => {
      const llm = fakeLlmProvider([
        successResult(INVALID_SELECTOR_TEMPLATE_WIRE),
      ]);
      const service = makeService(llm);

      const active = await service.getActiveTemplate(SOURCE);

      expect(active).toBeNull();
      expect(repository.versions).toHaveLength(0);
    });

    it('uses the extraction consumer identifier, distinct from sentiment and strategy generation', async () => {
      const llm = fakeLlmProvider([successResult(VALID_TEMPLATE_WIRE)]);
      const service = makeService(llm);

      await service.getActiveTemplate(SOURCE);

      expect(llm.generate).toHaveBeenCalledWith(
        expect.objectContaining({ consumerId: 'extraction' }),
      );
    });
  });

  describe('template generation against the seeded fixture', () => {
    it('generates a candidate template from the real CryptoSlate snapshot', async () => {
      const fixturePath = fileURLToPath(
        new URL(
          '../../../../fixtures/news/cryptoslate-news-snapshot.html',
          import.meta.url,
        ),
      );
      const snapshot = await readFile(fixturePath, 'utf-8');
      fetchHtml.mockResolvedValue(snapshot);

      const llm = fakeLlmProvider([successResult(VALID_TEMPLATE_WIRE)]);
      const service = makeService(llm);

      const result = await service.generateTemplate(SOURCE, {});

      expect(result.template.item).toBe('article.cs-article-card');
      expect(result.metrics.itemCount).toBeGreaterThan(0);
      expect(result.metrics.emptyFieldRate).toBe(0);
      expect(result.generatedBy).toBe('fake-provider');
    });
  });

  describe('drift-triggered proposals', () => {
    async function withActiveVersion(llm: LlmJsonProvider): Promise<{
      service: ExtractionTemplateService;
      active: ExtractionTemplateVersion;
    }> {
      const service = makeService(llm);
      await service.getActiveTemplate(SOURCE);
      const active = repository.versions[0]!;
      return { service, active };
    }

    it('proposes a replacement, as PROPOSED only, when drift crosses the threshold', async () => {
      const llm = fakeLlmProvider([
        successResult(VALID_TEMPLATE_WIRE),
        successResult(VALID_TEMPLATE_WIRE),
      ]);
      const { service, active } = await withActiveVersion(llm);

      repository.attemptsByVersionId.set(
        active.id,
        Array.from({ length: 3 }, () => ({
          itemsFound: 10,
          emptyFieldRate: 0.09,
          malformedFieldRate: 0.05,
        })),
      );

      const proposal = await service.checkAndProposeIfDrifted(SOURCE.id);

      expect(proposal).not.toBeNull();
      expect(proposal?.status).toBe('PROPOSED');
      expect(proposal?.basedOnVersionId).toBe(active.id);
      expect(proposal?.projectedEmptyFieldRate).not.toBeNull();

      // Still only one ACTIVE version: a proposal never activates on its own.
      const versions = await repository.listVersions(SOURCE.id);
      expect(versions.filter((v) => v.status === 'ACTIVE')).toHaveLength(1);
      expect(versions.find((v) => v.status === 'ACTIVE')?.id).toBe(active.id);
    });

    it('does not propose when the combined error rate is under the threshold', async () => {
      const llm = fakeLlmProvider([successResult(VALID_TEMPLATE_WIRE)]);
      const { service, active } = await withActiveVersion(llm);

      repository.attemptsByVersionId.set(
        active.id,
        Array.from({ length: 3 }, () => ({
          itemsFound: 10,
          emptyFieldRate: 0.02,
          malformedFieldRate: 0.01,
        })),
      );

      const proposal = await service.checkAndProposeIfDrifted(SOURCE.id);

      expect(proposal).toBeNull();
      expect(repository.versions).toHaveLength(1);
    });

    it('does not mint a second proposal while one is already open', async () => {
      const llm = fakeLlmProvider([
        successResult(VALID_TEMPLATE_WIRE),
        successResult(VALID_TEMPLATE_WIRE),
      ]);
      const { service, active } = await withActiveVersion(llm);
      repository.attemptsByVersionId.set(
        active.id,
        Array.from({ length: 3 }, () => ({
          itemsFound: 10,
          emptyFieldRate: 0.09,
          malformedFieldRate: 0.05,
        })),
      );

      const first = await service.checkAndProposeIfDrifted(SOURCE.id);
      const second = await service.checkAndProposeIfDrifted(SOURCE.id);

      expect(first).not.toBeNull();
      expect(second).toBeNull();
      expect(
        repository.versions.filter((v) => v.status === 'PROPOSED'),
      ).toHaveLength(1);
    });

    it('does nothing when drift detection is turned off', async () => {
      const llm = fakeLlmProvider([successResult(VALID_TEMPLATE_WIRE)]);
      const { service, active } = await withActiveVersion(llm);
      settings.set('extraction.drift_detection_enabled', 'false');
      repository.attemptsByVersionId.set(
        active.id,
        Array.from({ length: 3 }, () => ({
          itemsFound: 10,
          emptyFieldRate: 0.5,
          malformedFieldRate: 0.5,
        })),
      );

      const proposal = await service.checkAndProposeIfDrifted(SOURCE.id);

      expect(proposal).toBeNull();
      expect(repository.versions).toHaveLength(1);
    });
  });

  describe('a proposed version never activates without an explicit admin action', () => {
    it('leaves a saved proposal as PROPOSED until activateVersion is called', async () => {
      const llm = fakeLlmProvider([successResult(VALID_TEMPLATE_WIRE)]);
      const service = makeService(llm);
      await service.getActiveTemplate(SOURCE);
      const active = repository.versions[0]!;

      const candidate: ExtractionTemplate = {
        ...active.template,
        confidence: 0.95,
      };
      const proposed = await service.saveProposedVersion(
        SOURCE,
        candidate,
        'admin-authored',
      );

      expect(proposed.status).toBe('PROPOSED');
      const stillActive = await repository.getActiveVersion(SOURCE.id);
      expect(stillActive?.id).toBe(active.id);

      const activated = await service.activateVersion(SOURCE.id, proposed.id);
      expect(activated.status).toBe('ACTIVE');
      const supersededPrevious = await repository.getVersionById(
        SOURCE.id,
        active.id,
      );
      expect(supersededPrevious?.status).toBe('SUPERSEDED');
    });

    it('rejects saving a second proposal while one is already open', async () => {
      const llm = fakeLlmProvider([successResult(VALID_TEMPLATE_WIRE)]);
      const service = makeService(llm);
      await service.getActiveTemplate(SOURCE);
      const active = repository.versions[0]!;
      await service.saveProposedVersion(
        SOURCE,
        active.template,
        'admin-authored',
      );

      await expect(
        service.saveProposedVersion(SOURCE, active.template, 'admin-authored'),
      ).rejects.toThrow(/already open/);
    });
  });

  describe('settings', () => {
    it('defaults to detection enabled and a 0.10 threshold when unset', async () => {
      const service = makeService(fakeLlmProvider([]));
      const result = await service.getSettings();
      expect(result).toEqual({
        driftDetectionEnabled: true,
        driftThreshold: 0.1,
      });
    });

    it('persists an updated threshold and toggle', async () => {
      const service = makeService(fakeLlmProvider([]));
      const result = await service.updateSettings({
        driftDetectionEnabled: false,
        driftThreshold: 0.2,
      });
      expect(result).toEqual({
        driftDetectionEnabled: false,
        driftThreshold: 0.2,
      });
    });

    it('rejects a threshold outside (0, 1]', async () => {
      const service = makeService(fakeLlmProvider([]));
      await expect(
        service.updateSettings({ driftThreshold: 1.5 }),
      ).rejects.toThrow();
    });
  });
});
