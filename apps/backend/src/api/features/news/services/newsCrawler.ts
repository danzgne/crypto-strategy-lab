import {
  createDomainEvent,
  type NewsSource,
  type NewsItem,
  type NewsProviderType,
  type RawNewsItem,
} from '@crypto-strategy-lab/shared';
import type { DomainEventPublisher } from '@/api/features/marketData/application/interfaces/domainEventPublisher.interface';
import type { AppLogger } from '@/utils/logger';
import type { NewsRepository } from '../repositories/interfaces/newsRepository.interface';
import {
  hasExtractionMetrics,
  type NewsProvider,
} from './interfaces/newsProvider.interface';
import type {
  NewsCrawlerInterface,
  CrawlResult,
  CrawlSummary,
} from './interfaces/newsCrawler.interface';
import type { IngestHtmlDto } from '../types/news.dto';

interface HtmlPasteParser {
  parseIngestedHtml(dto: IngestHtmlDto): RawNewsItem;
}

interface NewsCrawlerDependencies {
  newsRepository: NewsRepository;
  eventPublisher: DomainEventPublisher;
  logger: AppLogger;
  /** Providers to register, composed in index.ts alongside the rest of the app. */
  providers?: NewsProvider[];
  htmlPasteProvider?: HtmlPasteParser;
}

export class NewsCrawler implements NewsCrawlerInterface {
  private readonly newsRepository: NewsRepository;
  private readonly eventPublisher: DomainEventPublisher;
  private readonly logger: AppLogger;
  private readonly providers = new Map<NewsProviderType, NewsProvider>();
  private readonly htmlPasteProvider: HtmlPasteParser | undefined;

  public constructor({
    newsRepository,
    eventPublisher,
    logger,
    providers,
    htmlPasteProvider,
  }: NewsCrawlerDependencies) {
    this.newsRepository = newsRepository;
    this.eventPublisher = eventPublisher;
    this.logger = logger;
    this.htmlPasteProvider = htmlPasteProvider;

    if (providers) {
      for (const p of providers) {
        this.registerProvider(p);
      }
    }
  }

  public registerProvider(provider: NewsProvider): void {
    this.providers.set(provider.providerType, provider);
  }

  public async crawlSource(source: NewsSource): Promise<CrawlResult> {
    const provider = this.providers.get(source.providerType);
    if (!provider) {
      const errorMsg = `No provider registered for type: ${source.providerType}`;
      this.logger.error(
        { sourceId: source.id, providerType: source.providerType },
        errorMsg,
      );
      await this.newsRepository.recordCrawlAttempt({
        newsSourceId: source.id,
        status: 'FAILURE',
        itemsFound: 0,
        itemsPersisted: 0,
        errorMessage: errorMsg,
      });
      return {
        sourceId: source.id,
        sourceName: source.name,
        status: 'FAILURE',
        itemsFound: 0,
        itemsPersisted: 0,
        error: errorMsg,
      };
    }

    try {
      this.logger.info(
        { sourceId: source.id, sourceName: source.name, url: source.url },
        'Crawling news source',
      );

      const extractionMetrics = hasExtractionMetrics(provider);
      const { items: rawItems, metrics } = extractionMetrics
        ? await provider.fetchNewsWithMetrics(source)
        : { items: await provider.fetchNews(source), metrics: undefined };

      const { persistedItems } = await this.newsRepository.persistRawNewsItems(
        rawItems,
        source.id,
      );

      // Publish NewsCollected domain event for each newly persisted item
      for (const item of persistedItems) {
        const event = createDomainEvent('NewsCollected', {
          newsItemId: item.id,
          provider: source.providerType,
        });
        await this.eventPublisher.publish(event);
      }

      await this.newsRepository.recordCrawlAttempt({
        newsSourceId: source.id,
        status: 'SUCCESS',
        itemsFound: rawItems.length,
        itemsPersisted: persistedItems.length,
        templateVersionId: metrics?.templateVersionId,
        emptyFieldRate: metrics?.emptyFieldRate,
        malformedFieldRate: metrics?.malformedFieldRate,
        avgConfidence: metrics?.avgConfidence,
      });

      if (metrics) {
        const validatedEvent = createDomainEvent('ExtractionValidated', {
          newsSourceId: source.id,
          templateVersionId: metrics.templateVersionId,
        });
        await this.eventPublisher.publish(validatedEvent);
      }

      this.logger.info(
        {
          sourceId: source.id,
          sourceName: source.name,
          found: rawItems.length,
          persisted: persistedItems.length,
        },
        'News source crawled successfully',
      );

      return {
        sourceId: source.id,
        sourceName: source.name,
        status: 'SUCCESS',
        itemsFound: rawItems.length,
        itemsPersisted: persistedItems.length,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        { sourceId: source.id, sourceName: source.name, err: error },
        'Failed to crawl news source',
      );

      await this.newsRepository.recordCrawlAttempt({
        newsSourceId: source.id,
        status: 'FAILURE',
        itemsFound: 0,
        itemsPersisted: 0,
        errorMessage: errorMsg,
      });

      return {
        sourceId: source.id,
        sourceName: source.name,
        status: 'FAILURE',
        itemsFound: 0,
        itemsPersisted: 0,
        error: errorMsg,
      };
    }
  }

  public async crawlAllActiveSources(): Promise<CrawlSummary> {
    const startedAt = new Date().toISOString();
    const activeSources = await this.newsRepository.findSources(true);

    this.logger.info(
      { activeSourcesCount: activeSources.length },
      'Starting crawl for all active news sources',
    );

    const settledResults = await Promise.allSettled(
      activeSources.map((source) => this.crawlSource(source)),
    );

    const results: CrawlResult[] = [];
    let totalFound = 0;
    let totalPersisted = 0;

    for (let i = 0; i < settledResults.length; i++) {
      const settled = settledResults[i];
      const source = activeSources[i];
      if (settled && settled.status === 'fulfilled') {
        results.push(settled.value);
        totalFound += settled.value.itemsFound;
        totalPersisted += settled.value.itemsPersisted;
      } else if (source) {
        const errorMsg =
          settled && settled.status === 'rejected'
            ? settled.reason instanceof Error
              ? settled.reason.message
              : String(settled.reason)
            : 'Unknown crawl error';
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          status: 'FAILURE',
          itemsFound: 0,
          itemsPersisted: 0,
          error: errorMsg,
        });
      }
    }

    const completedAt = new Date().toISOString();
    this.logger.info(
      {
        sourcesProcessed: activeSources.length,
        totalFound,
        totalPersisted,
        startedAt,
        completedAt,
      },
      'Completed crawl for all active news sources',
    );

    return {
      startedAt,
      completedAt,
      sourcesProcessed: activeSources.length,
      totalFound,
      totalPersisted,
      results,
    };
  }

  public async ingestHtml(dto: IngestHtmlDto): Promise<NewsItem> {
    if (!this.htmlPasteProvider) {
      throw new Error('HTML paste provider is not configured for this crawler');
    }

    this.logger.info(
      { title: dto.title, source: dto.source },
      'Ingesting raw HTML article',
    );

    const rawItem = this.htmlPasteProvider.parseIngestedHtml(dto);
    const { persistedItems } = await this.newsRepository.persistRawNewsItems([
      rawItem,
    ]);

    const item = persistedItems[0];
    if (!item) {
      throw new Error(
        'Failed to ingest HTML article or article with URL already exists',
      );
    }

    const event = createDomainEvent('NewsCollected', {
      newsItemId: item.id,
      provider: 'HTML',
    });
    await this.eventPublisher.publish(event);

    return item;
  }
}
