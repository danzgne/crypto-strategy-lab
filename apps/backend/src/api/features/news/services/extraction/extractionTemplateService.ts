import type {
  ExtractionPanelData,
  ExtractionSettings,
  ExtractionTemplate,
  ExtractionTemplateVersion,
  NewsSource,
  RawNewsItem,
  TemplateApplicationMetrics,
} from '@crypto-strategy-lab/shared';
import type { LlmJsonProvider } from '@/llm/llmJsonProvider.interface';
import type { AppLogger } from '@/utils/logger';
import { createAppLogger } from '@/utils/logger';
import { AppError } from '@/errors/AppError';
import type { ExtractionTemplateRepository } from '../../repositories/interfaces/extractionTemplateRepository.interface';
import type {
  ActiveTemplatePort,
  ActiveTemplateRecord,
} from './activeTemplatePort.interface';
import { applyTemplate } from './templateApplier';
import { evaluateDrift } from './driftEvaluator';
import { isSourceHealthy } from '../sourceHealth';
import { trimHtmlForModel } from './htmlTrimmer';
import { validateTemplateSelectors } from './selectorValidator';
import { normalizeGeneratedTemplate } from './normalizeGeneratedTemplate';
import {
  buildGenerationPrompt,
  buildProposalPrompt,
  EXTRACTION_TEMPLATE_CONSUMER_ID,
} from './prompt';
import { EXTRACTION_TEMPLATE_WIRE_SCHEMA } from './wireSchema';
import { fetchSourceHtml } from './htmlFetcher';

export interface SourceLookupPort {
  findSourceById(id: string): Promise<NewsSource | null>;
}

export interface SettingsStore {
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

export interface GenerateTemplateResult {
  template: ExtractionTemplate;
  metrics: TemplateApplicationMetrics;
  generatedBy: string;
}

export interface PreviewTemplateResult {
  items: RawNewsItem[];
  metrics: TemplateApplicationMetrics;
}

export interface UpdateExtractionSettingsInput {
  driftDetectionEnabled?: boolean | undefined;
  driftThreshold?: number | undefined;
}

interface ExtractionTemplateServiceDependencies {
  templateRepository: ExtractionTemplateRepository;
  sourceLookup: SourceLookupPort;
  settingsStore: SettingsStore;
  llmProvider: LlmJsonProvider;
  fetchHtml?: ((url: string) => Promise<string>) | undefined;
  logger?: AppLogger | undefined;
  now?: (() => Date) | undefined;
}

const DRIFT_ENABLED_SETTING_KEY = 'extraction.drift_detection_enabled';
const DRIFT_THRESHOLD_SETTING_KEY = 'extraction.drift_threshold';
const CRAWL_INTERVAL_SETTING_KEY = 'news.crawl_interval_minutes';
const DEFAULT_DRIFT_THRESHOLD = 0.1;
const DEFAULT_REFRESH_INTERVAL_MINUTES = 3;

export class ExtractionTemplateService implements ActiveTemplatePort {
  private readonly templateRepository: ExtractionTemplateRepository;
  private readonly sourceLookup: SourceLookupPort;
  private readonly settingsStore: SettingsStore;
  private readonly llmProvider: LlmJsonProvider;
  private readonly fetchHtml: (url: string) => Promise<string>;
  private readonly logger: AppLogger;
  private readonly now: () => Date;

  private readonly inFlightBySourceId = new Set<string>();
  private readonly rerunRequestedBySourceId = new Set<string>();
  private readonly activePasses = new Set<Promise<void>>();
  private isClosed = false;

  public constructor({
    templateRepository,
    sourceLookup,
    settingsStore,
    llmProvider,
    fetchHtml = fetchSourceHtml,
    logger = createAppLogger({
      service: 'extraction-template-service',
      enabled: false,
    }),
    now = () => new Date(),
  }: ExtractionTemplateServiceDependencies) {
    this.templateRepository = templateRepository;
    this.sourceLookup = sourceLookup;
    this.settingsStore = settingsStore;
    this.llmProvider = llmProvider;
    this.fetchHtml = fetchHtml;
    this.logger = logger;
    this.now = now;
  }

  // --- ActiveTemplatePort: consumed by WebsiteNewsProvider ---

  public async getActiveTemplate(
    source: NewsSource,
  ): Promise<ActiveTemplateRecord | null> {
    const active = await this.templateRepository.getActiveVersion(source.id);
    if (active) {
      return { versionId: active.id, template: active.template };
    }

    const generated = await this.generateAndActivateFirstVersion(source);
    return generated
      ? { versionId: generated.id, template: generated.template }
      : null;
  }

  // --- Authoring bench ---

  public async previewTemplate(
    source: NewsSource,
    options: {
      html?: string | undefined;
      template?: ExtractionTemplate | undefined;
    },
  ): Promise<PreviewTemplateResult> {
    const html = options.html ?? (await this.fetchHtml(source.url));
    const template =
      options.template ??
      (await this.templateRepository.getActiveVersion(source.id))?.template;
    if (!template) {
      throw new AppError(
        'No template to preview: pass one, or activate a version for this source first',
        400,
        'NO_TEMPLATE',
      );
    }

    const { items, metrics } = applyTemplate(
      html,
      template,
      source.url,
      source.name,
      this.now(),
    );
    return { items, metrics };
  }

  public async generateTemplate(
    source: NewsSource,
    options: { html?: string | undefined },
  ): Promise<GenerateTemplateResult> {
    const html = options.html ?? (await this.fetchHtml(source.url));
    const candidate = await this.generateCandidate(source.url, html);
    if (!candidate) {
      throw new AppError(
        'Template generation failed or produced only unsupported selectors',
        502,
        'GENERATION_FAILED',
      );
    }

    const { metrics } = applyTemplate(
      html,
      candidate.template,
      source.url,
      source.name,
      this.now(),
    );
    return {
      template: candidate.template,
      metrics,
      generatedBy: candidate.generatedBy,
    };
  }

  public async saveProposedVersion(
    source: NewsSource,
    template: ExtractionTemplate,
    generatedBy: string,
  ): Promise<ExtractionTemplateVersion> {
    const issues = validateTemplateSelectors(template);
    if (issues.length > 0) {
      throw new AppError(
        `Template has unsupported selectors: ${issues.join(', ')}`,
        400,
        'INVALID_SELECTORS',
      );
    }

    const [active, existingProposed] = await Promise.all([
      this.templateRepository.getActiveVersion(source.id),
      this.templateRepository.getProposedVersion(source.id),
    ]);
    if (!active) {
      throw new AppError(
        'Cannot propose a replacement before a version has ever been activated',
        409,
        'NO_ACTIVE_VERSION',
      );
    }
    if (existingProposed) {
      throw new AppError(
        'A proposed version is already open for this source',
        409,
        'PROPOSAL_ALREADY_OPEN',
      );
    }

    const html = await this.fetchHtml(source.url);
    const { metrics } = applyTemplate(
      html,
      template,
      source.url,
      source.name,
      this.now(),
    );

    return this.templateRepository.createProposedVersion({
      newsSourceId: source.id,
      template,
      confidence: template.confidence,
      generatedBy,
      basedOnVersionId: active.id,
      projectedEmptyFieldRate: metrics.emptyFieldRate,
      projectedMalformedFieldRate: metrics.malformedFieldRate,
    });
  }

  public async listVersions(
    sourceId: string,
  ): Promise<ExtractionTemplateVersion[]> {
    return this.templateRepository.listVersions(sourceId);
  }

  public async activateVersion(
    sourceId: string,
    versionId: string,
  ): Promise<ExtractionTemplateVersion> {
    return this.templateRepository.activateVersion(
      sourceId,
      versionId,
      this.now(),
    );
  }

  public async rejectVersion(
    sourceId: string,
    versionId: string,
  ): Promise<ExtractionTemplateVersion> {
    return this.templateRepository.rejectVersion(sourceId, versionId);
  }

  // --- Source health / drift panel ---

  public async getPanelData(source: NewsSource): Promise<ExtractionPanelData> {
    const now = this.now();
    const [
      activeVersion,
      proposedVersion,
      versionHistory,
      trailing24h,
      settings,
      refreshIntervalMinutes,
    ] = await Promise.all([
      this.templateRepository.getActiveVersion(source.id),
      this.templateRepository.getProposedVersion(source.id),
      this.templateRepository.listVersions(source.id),
      this.templateRepository.getTrailing24hStats(source.id, now),
      this.getSettings(),
      this.getRefreshIntervalMinutes(),
    ]);

    const lastAttempt = source.lastCrawlAttempt;
    const active = isSourceHealthy(
      lastAttempt
        ? { status: lastAttempt.status, crawledAt: lastAttempt.crawledAt }
        : null,
      refreshIntervalMinutes,
      now,
    );

    const drift =
      activeVersion?.activatedAt !== undefined &&
      activeVersion?.activatedAt !== null
        ? evaluateDrift(
            await this.templateRepository.getAttemptsForVersionSince(
              activeVersion.id,
              new Date(activeVersion.activatedAt),
            ),
            settings.driftThreshold,
          )
        : {
            status: 'INSUFFICIENT_DATA' as const,
            threshold: settings.driftThreshold,
            combinedRate: null,
            sampleAttempts: 0,
            sampleItems: 0,
          };

    return {
      source: {
        id: source.id,
        name: source.name,
        url: source.url,
        providerType: source.providerType,
        isActive: source.isActive,
      },
      activeVersion,
      proposedVersion,
      versionHistory,
      health: {
        sourceId: source.id,
        enabled: source.isActive,
        active,
        lastAttemptAt: lastAttempt?.crawledAt ?? null,
        lastAttemptStatus: lastAttempt?.status ?? null,
        avgConfidence24h: trailing24h.avgConfidence,
        itemsAnalysed24h: trailing24h.itemsAnalysed,
      },
      drift,
      settings,
    };
  }

  // --- Settings ---

  public async getSettings(): Promise<ExtractionSettings> {
    const [enabledRaw, thresholdRaw] = await Promise.all([
      this.settingsStore.getSetting(DRIFT_ENABLED_SETTING_KEY),
      this.settingsStore.getSetting(DRIFT_THRESHOLD_SETTING_KEY),
    ]);

    const driftDetectionEnabled =
      enabledRaw === null ? true : enabledRaw === 'true';
    const parsedThreshold =
      thresholdRaw === null ? Number.NaN : Number(thresholdRaw);
    const driftThreshold =
      Number.isFinite(parsedThreshold) &&
      parsedThreshold > 0 &&
      parsedThreshold <= 1
        ? parsedThreshold
        : DEFAULT_DRIFT_THRESHOLD;

    return { driftDetectionEnabled, driftThreshold };
  }

  public async updateSettings(
    patch: UpdateExtractionSettingsInput,
  ): Promise<ExtractionSettings> {
    if (patch.driftDetectionEnabled !== undefined) {
      await this.settingsStore.setSetting(
        DRIFT_ENABLED_SETTING_KEY,
        String(patch.driftDetectionEnabled),
      );
    }
    if (patch.driftThreshold !== undefined) {
      if (!(patch.driftThreshold > 0 && patch.driftThreshold <= 1)) {
        throw new AppError(
          'driftThreshold must be between 0 and 1',
          400,
          'VALIDATION_ERROR',
        );
      }
      await this.settingsStore.setSetting(
        DRIFT_THRESHOLD_SETTING_KEY,
        String(patch.driftThreshold),
      );
    }
    return this.getSettings();
  }

  // --- Drift evaluation, triggered by ExtractionValidated ---

  public schedulePass(sourceId: string): void {
    if (this.isClosed) return;
    if (this.inFlightBySourceId.has(sourceId)) {
      this.rerunRequestedBySourceId.add(sourceId);
      return;
    }

    this.inFlightBySourceId.add(sourceId);
    const pass = this.checkAndProposeIfDrifted(sourceId)
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.error(
          { err: error, sourceId },
          'Drift evaluation pass failed',
        );
      })
      .finally(() => {
        this.inFlightBySourceId.delete(sourceId);
        this.activePasses.delete(pass);
        if (this.rerunRequestedBySourceId.delete(sourceId)) {
          this.schedulePass(sourceId);
        }
      });
    this.activePasses.add(pass);
  }

  public async close(): Promise<void> {
    this.isClosed = true;
    await Promise.all(this.activePasses);
  }

  /**
   * Evaluates drift for one Source's active template and, only when it has crossed
   * the threshold, generates and stores a PROPOSED replacement. Never activates
   * anything: the returned version (if any) still needs the explicit admin action.
   */
  public async checkAndProposeIfDrifted(
    sourceId: string,
  ): Promise<ExtractionTemplateVersion | null> {
    const settings = await this.getSettings();
    if (!settings.driftDetectionEnabled) return null;

    const source = await this.sourceLookup.findSourceById(sourceId);
    if (!source) return null;

    const active = await this.templateRepository.getActiveVersion(sourceId);
    if (
      !active ||
      active.activatedAt === null ||
      active.activatedAt === undefined
    )
      return null;

    const attempts = await this.templateRepository.getAttemptsForVersionSince(
      active.id,
      new Date(active.activatedAt),
    );
    const verdict = evaluateDrift(attempts, settings.driftThreshold);
    if (verdict.status !== 'DRIFTED') return null;

    const proposal = await this.proposeReplacement(source, active);
    if (proposal) {
      this.logger.info(
        {
          sourceId,
          versionId: proposal.id,
          combinedRate: verdict.combinedRate,
        },
        'Proposed a replacement extraction template after drift',
      );
    }
    return proposal;
  }

  private async proposeReplacement(
    source: NewsSource,
    active: ExtractionTemplateVersion,
  ): Promise<ExtractionTemplateVersion | null> {
    const existingProposed = await this.templateRepository.getProposedVersion(
      source.id,
    );
    if (existingProposed) return null;

    let html: string;
    try {
      html = await this.fetchHtml(source.url);
    } catch (error) {
      this.logger.warn(
        { sourceId: source.id, err: error },
        'Failed to fetch HTML for a drift replacement proposal',
      );
      return null;
    }

    const { fieldBreakdown } = applyTemplate(
      html,
      active.template,
      source.url,
      source.name,
      this.now(),
    );
    const prompt = buildProposalPrompt(
      source.url,
      trimHtmlForModel(html),
      active.template,
      fieldBreakdown,
    );

    const result = await this.llmProvider.generate({
      consumerId: EXTRACTION_TEMPLATE_CONSUMER_ID,
      prompt,
      schema: EXTRACTION_TEMPLATE_WIRE_SCHEMA,
    });
    if (result.outcome !== 'SUCCESS') {
      this.logger.warn(
        { sourceId: source.id, outcome: result.outcome },
        'Drift replacement proposal generation failed',
      );
      return null;
    }

    const candidate = normalizeGeneratedTemplate(result.value);
    const issues = validateTemplateSelectors(candidate);
    if (issues.length > 0) {
      this.logger.warn(
        { sourceId: source.id, issues },
        'Drift replacement proposal used unsupported selectors',
      );
      return null;
    }

    const dryRun = applyTemplate(
      html,
      candidate,
      source.url,
      source.name,
      this.now(),
    );

    return this.templateRepository.createProposedVersion({
      newsSourceId: source.id,
      template: candidate,
      confidence: candidate.confidence,
      generatedBy: result.generatedBy,
      basedOnVersionId: active.id,
      projectedEmptyFieldRate: dryRun.metrics.emptyFieldRate,
      projectedMalformedFieldRate: dryRun.metrics.malformedFieldRate,
    });
  }

  // --- Shared helpers ---

  private async generateAndActivateFirstVersion(
    source: NewsSource,
  ): Promise<ExtractionTemplateVersion | null> {
    let html: string;
    try {
      html = await this.fetchHtml(source.url);
    } catch (error) {
      this.logger.warn(
        { sourceId: source.id, err: error },
        'Failed to fetch HTML for v1 extraction template generation',
      );
      return null;
    }

    const candidate = await this.generateCandidate(source.url, html);
    if (!candidate) return null;

    return this.templateRepository.createActiveVersion({
      newsSourceId: source.id,
      template: candidate.template,
      confidence: candidate.template.confidence,
      generatedBy: candidate.generatedBy,
    });
  }

  private async generateCandidate(
    sourceUrl: string,
    html: string,
  ): Promise<{ template: ExtractionTemplate; generatedBy: string } | null> {
    const prompt = buildGenerationPrompt(sourceUrl, trimHtmlForModel(html));
    const result = await this.llmProvider.generate({
      consumerId: EXTRACTION_TEMPLATE_CONSUMER_ID,
      prompt,
      schema: EXTRACTION_TEMPLATE_WIRE_SCHEMA,
    });
    if (result.outcome !== 'SUCCESS') {
      this.logger.warn(
        { sourceUrl, outcome: result.outcome },
        'Extraction template generation failed',
      );
      return null;
    }

    const template = normalizeGeneratedTemplate(result.value);
    const issues = validateTemplateSelectors(template);
    if (issues.length > 0) {
      this.logger.warn(
        { sourceUrl, issues },
        'Generated extraction template used unsupported selectors',
      );
      return null;
    }

    return { template, generatedBy: result.generatedBy };
  }

  private async getRefreshIntervalMinutes(): Promise<number> {
    const raw = await this.settingsStore.getSetting(CRAWL_INTERVAL_SETTING_KEY);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 1
      ? parsed
      : DEFAULT_REFRESH_INTERVAL_MINUTES;
  }
}
