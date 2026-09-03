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

interface WebsiteNewsProviderDependencies {
  templatePort: ActiveTemplatePort;
  fetchHtml?: ((url: string) => Promise<string>) | undefined;
  now?: (() => Date) | undefined;
}

// Never falls back to a heuristic: a missing or unusable template fails the crawl
// attempt outright, which is what keeps the drift signal honest.
export class WebsiteNewsProvider implements NewsProviderWithExtractionMetrics {
  public readonly providerType: NewsProviderType = 'WEBSITE';

  private readonly templatePort: ActiveTemplatePort;
  private readonly fetchHtml: (url: string) => Promise<string>;
  private readonly now: () => Date;

  public constructor({
    templatePort,
    fetchHtml = fetchSourceHtml,
    now = () => new Date(),
  }: WebsiteNewsProviderDependencies) {
    this.templatePort = templatePort;
    this.fetchHtml = fetchHtml;
    this.now = now;
  }

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
