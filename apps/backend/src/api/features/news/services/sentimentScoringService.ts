import {
  NEWS_EVENT_TYPES,
  SENTIMENT_LABELS,
  createDomainEvent,
  type AnyDomainEvent,
  type NewsItem,
  type NewsSentiment,
} from '@crypto-strategy-lab/shared';
import { z } from 'zod';
import type { DomainEventPublisher } from '@/api/features/marketData/application/interfaces/domainEventPublisher.interface';
import type { LlmJsonProvider } from '@/llm/llmJsonProvider.interface';
import type { AppLogger } from '@/utils/logger';

export interface SentimentBatchUpdate {
  newsItemId: string;
  sentiment: NewsSentiment;
  relatedCoins: string[];
}

export interface SentimentScoringRepository {
  findUnscoredNewsItems(limit: number): Promise<NewsItem[]>;
  persistSentimentBatch(
    updates: readonly SentimentBatchUpdate[],
    events?: readonly AnyDomainEvent[],
  ): Promise<NewsItem[]>;
}

export interface SentimentScoringServiceDependencies {
  repository: SentimentScoringRepository;
  llmProvider: LlmJsonProvider;
  eventPublisher: DomainEventPublisher;
  logger: AppLogger;
  batchSize?: number;
  scheduleDelayMs?: number;
}

export interface SentimentScoringResult {
  scored: number;
  failedBatches: number;
}

const sentimentResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      label: z.enum(SENTIMENT_LABELS),
      score: z.number().min(-1).max(1),
      eventType: z.enum(NEWS_EVENT_TYPES),
      relatedCoins: z.array(z.string()),
    }),
  ),
});

type SentimentResponse = z.infer<typeof sentimentResponseSchema>;

export const SENTIMENT_SCORING_CONSUMER_ID = 'sentiment';
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_SCHEDULE_DELAY_MS = 0;

export class SentimentScoringService {
  private readonly repository: SentimentScoringRepository;
  private readonly llmProvider: LlmJsonProvider;
  private readonly eventPublisher: DomainEventPublisher;
  private readonly logger: AppLogger;
  private readonly batchSize: number;
  private readonly scheduleDelayMs: number;
  private scheduledTimer: ReturnType<typeof setTimeout> | undefined;
  private activePass: Promise<void> | undefined;
  private isRunning = false;
  private rerunRequested = false;
  private isClosed = false;

  public constructor({
    repository,
    llmProvider,
    eventPublisher,
    logger,
    batchSize = DEFAULT_BATCH_SIZE,
    scheduleDelayMs = DEFAULT_SCHEDULE_DELAY_MS,
  }: SentimentScoringServiceDependencies) {
    this.repository = repository;
    this.llmProvider = llmProvider;
    this.eventPublisher = eventPublisher;
    this.logger = logger;
    this.batchSize = Math.max(1, Math.floor(batchSize));
    this.scheduleDelayMs = Math.max(0, scheduleDelayMs);
  }

  public async scoreUnscoredItems(): Promise<SentimentScoringResult> {
    let scored = 0;
    let failedBatches = 0;

    while (true) {
      const items = await this.repository.findUnscoredNewsItems(this.batchSize);
      if (items.length === 0) break;

      const result = await this.scoreBatch(items);
      if (!result) {
        failedBatches += 1;
        break;
      }

      const events = result.map(({ newsItemId, sentiment, relatedCoins }) =>
        createDomainEvent('SentimentAnalyzed', {
          newsItemId,
          sentiment: sentiment.label,
          score: sentiment.score,
          eventType: sentiment.eventType,
          relatedCoins,
        }),
      );
      const persistedItems = await this.repository.persistSentimentBatch(
        result,
        events,
      );
      scored += persistedItems.length;
      await this.publishSentimentEvents(events);
    }

    return { scored, failedBatches };
  }

  public schedulePass(): void {
    if (this.isClosed) return;
    if (this.scheduledTimer !== undefined || this.isRunning) {
      this.rerunRequested = true;
      return;
    }

    this.scheduledTimer = setTimeout(() => {
      this.scheduledTimer = undefined;
      const pass = this.runScheduledPass();
      this.activePass = pass;
      void pass.finally(() => {
        if (this.activePass === pass) this.activePass = undefined;
      });
    }, this.scheduleDelayMs);
  }

  public async close(): Promise<void> {
    this.isClosed = true;
    if (this.scheduledTimer !== undefined) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = undefined;
    }
    await this.activePass;
  }

  private async runScheduledPass(): Promise<void> {
    if (this.isRunning) {
      this.rerunRequested = true;
      return;
    }

    this.isRunning = true;
    try {
      const result = await this.scoreUnscoredItems();
      this.logger.info(
        { scored: result.scored, failedBatches: result.failedBatches },
        'Sentiment scoring pass completed',
      );
    } catch (error) {
      this.logger.error({ err: error }, 'Sentiment scoring pass failed');
    } finally {
      this.isRunning = false;
      if (this.rerunRequested) {
        this.rerunRequested = false;
        this.schedulePass();
      }
    }
  }

  private async scoreBatch(
    items: readonly NewsItem[],
  ): Promise<SentimentBatchUpdate[] | null> {
    const result = await this.llmProvider.generate<SentimentResponse>({
      consumerId: SENTIMENT_SCORING_CONSUMER_ID,
      prompt: buildPrompt(items),
      schema: sentimentResponseSchema,
    });

    if (result.outcome !== 'SUCCESS') {
      this.logger.warn(
        { outcome: result.outcome, itemCount: items.length },
        'Sentiment scoring batch was not scored',
      );
      return null;
    }

    const expectedIds = new Set(items.map((item) => item.id));
    const responseItems = result.value.items;
    const responseIds = new Set(responseItems.map((item) => item.id));
    if (
      responseItems.length !== items.length ||
      responseIds.size !== responseItems.length ||
      responseIds.size !== expectedIds.size ||
      responseItems.some((item) => !expectedIds.has(item.id))
    ) {
      this.logger.warn(
        { itemCount: items.length, responseCount: responseItems.length },
        'Sentiment scoring batch returned mismatched items',
      );
      return null;
    }

    return responseItems.map((item) => ({
      newsItemId: item.id,
      sentiment: {
        label: item.label,
        score: item.score,
        eventType: item.eventType,
      },
      relatedCoins: normalizeRelatedCoins(item.relatedCoins),
    }));
  }

  private async publishSentimentEvents(
    events: readonly AnyDomainEvent[],
  ): Promise<void> {
    await Promise.all(
      events.map((event) => this.eventPublisher.publish(event)),
    );
  }
}

function normalizeRelatedCoins(coins: readonly string[]): string[] {
  return Array.from(
    new Set(
      coins
        .map((coin) => coin.trim().toUpperCase())
        .map((coin) => coin.replace(/USDT$/, ''))
        .filter((coin) => coin.length > 0),
    ),
  );
}

function buildPrompt(items: readonly NewsItem[]): string {
  return [
    'Analyze each crypto news item and return an object with an items array containing exactly one JSON result per item.',
    'Use POSITIVE, NEUTRAL, or NEGATIVE; score sentiment direction from -1 to 1.',
    'Use one event type: ETF_FUND_FLOW, PROTOCOL_UPGRADE, REGULATION, PARTNERSHIP, MARKET_TREND, or OTHER.',
    'Return relatedCoins as uppercase base assets without quote suffixes.',
    ...items.map(
      (item) =>
        `ID: ${item.id}\nTitle: ${item.title}\nContent: ${item.content}`,
    ),
  ].join('\n\n');
}
