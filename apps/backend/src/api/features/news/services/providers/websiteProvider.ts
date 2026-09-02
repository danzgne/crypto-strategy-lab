import type {
  NewsProviderType,
  NewsSource,
  RawNewsItem,
} from '@crypto-strategy-lab/shared';
import type {
  ExtractionAttemptMetrics,
  NewsProviderWithExtractionMetrics,
} from '../interfaces/newsProvider.interface';
import type { ActiveTemplatePort } from '../extraction/activeTemplatePort.interface';
import { applyTemplate } from '../extraction/templateApplier';
import { fetchSourceHtml } from '../extraction/htmlFetcher';

export interface WebsiteNewsResult {
  items: RawNewsItem[];
  metrics: ExtractionAttemptMetrics;
}

/**
 * Reads a listing page using its Source's active Extraction Template. Applying a
 * template is pure selector evaluation (see templateApplier); this class owns only
 * the fetch and the glue to the one-method template port. It never calls an LLM
 * itself and never falls back to a heuristic: a missing or unusable template fails
 * the crawl attempt outright, which is what keeps the drift signal honest.
 */
export class WebsiteNewsProvider implements NewsProviderWithExtractionMetrics {
  public readonly providerType: NewsProviderType = 'WEBSITE';

  public constructor(
    private readonly templatePort: ActiveTemplatePort,
    private readonly fetchHtml: (
      url: string,
    ) => Promise<string> = fetchSourceHtml,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async fetchNews(source: NewsSource): Promise<RawNewsItem[]> {
    return (await this.fetchNewsWithMetrics(source)).items;
  }

  public async fetchNewsWithMetrics(
    source: NewsSource,
  ): Promise<WebsiteNewsResult> {
    const active = await this.templatePort.getActiveTemplate(source);
    if (!active) {
      throw new Error(
        `No usable extraction template is available for source "${source.name}" (${source.id})`,
      );
    }

    const html = await this.fetchHtml(source.url);
    const { items, metrics } = applyTemplate(
      html,
      active.template,
      source.url,
      source.name,
      this.now(),
    );

    return {
      items,
      metrics: {
        templateVersionId: active.versionId,
        emptyFieldRate: metrics.emptyFieldRate,
        malformedFieldRate: metrics.malformedFieldRate,
        avgConfidence: active.template.confidence,
      },
    };
  }
}
