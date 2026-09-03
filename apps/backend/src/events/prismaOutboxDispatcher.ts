import { randomUUID } from 'node:crypto';

import type {
  AnyDomainEvent,
  DomainEventName,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import {
  createDomainEvent,
  DOMAIN_EVENT_VERSIONS,
  formatStrategyDisplay,
  isTimeframe,
  isStrategyEvaluatedPayload,
  NEWS_EVENT_TYPES,
  SENTIMENT_LABELS,
} from '@crypto-strategy-lab/shared';

import type { AppPrismaClient } from '@/database/prismaClient';
import { Prisma } from '@/database/prismaClient';
import type { AppLogger } from '@/utils/logger';

export interface DomainEventBus {
  publish(event: AnyDomainEvent): void | Promise<void>;
}

export interface OutboxDispatcherOptions {
  pollIntervalMs?: number;
  batchSize?: number;
  claimLeaseMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  backoffJitterRatio?: number;
}

const MAX_DELIVERY_ATTEMPTS = 8;
const DEFAULT_CLAIM_LEASE_MS = 30_000;
const DEFAULT_BACKOFF_BASE_MS = 1_000;
const DEFAULT_BACKOFF_MAX_MS = 60_000;
const DEFAULT_BACKOFF_JITTER_RATIO = 0.2;
const MAX_ERROR_LENGTH = 4_000;

interface ClaimedOutboxEvent {
  id: string;
  eventId: string;
  name: string;
  version: number;
  occurredAt: Date;
  payload: unknown;
  attemptCount: number;
  claimToken: string;
}

interface FailureRecordingResult {
  recorded: boolean;
  deadLettered: boolean;
}

type DeliveryOutcome =
  | 'published'
  | 'failed'
  | 'dead-lettered'
  | 'claim-lost'
  | 'failure-recording-failed';

export class PrismaOutboxDispatcher {
  private readonly pollIntervalMs: number;

  private readonly batchSize: number;

  private readonly claimLeaseMs: number;

  private readonly backoffBaseMs: number;

  private readonly backoffMaxMs: number;

  private readonly backoffJitterRatio: number;

  private timer: ReturnType<typeof setInterval> | undefined;

  private dispatching = false;

  public constructor(
    private readonly prisma: AppPrismaClient,
    private readonly eventBus: DomainEventBus,
    private readonly logger: AppLogger,
    options: OutboxDispatcherOptions = {},
  ) {
    this.pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 1_000);
    this.batchSize = Math.max(1, options.batchSize ?? 100);
    this.claimLeaseMs = Math.max(
      1,
      options.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS,
    );
    this.backoffBaseMs = Math.max(
      0,
      options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS,
    );
    this.backoffMaxMs = Math.max(
      this.backoffBaseMs,
      options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS,
    );
    this.backoffJitterRatio = Math.min(
      1,
      Math.max(0, options.backoffJitterRatio ?? DEFAULT_BACKOFF_JITTER_RATIO),
    );
  }

  public start(): void {
    if (this.timer !== undefined) return;
    void this.dispatchOnce();
    this.timer = setInterval(
      () => void this.dispatchOnce(),
      this.pollIntervalMs,
    );
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  public async dispatchOnce(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      const events = await this.claimEligibleEvents();
      await Promise.allSettled(events.map((event) => this.dispatch(event)));
    } catch (error) {
      this.logger.error({ err: error }, 'Outbox dispatch cycle failed');
    } finally {
      this.dispatching = false;
    }
  }

  private async claimEligibleEvents(): Promise<ClaimedOutboxEvent[]> {
    const claimToken = randomUUID();

    return this.prisma.$queryRaw<ClaimedOutboxEvent[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "event_outbox"
        WHERE "publishedAt" IS NULL
          AND "deadLetteredAt" IS NULL
          AND (
            "attemptCount" < ${MAX_DELIVERY_ATTEMPTS}
            OR (
              "attemptCount" = ${MAX_DELIVERY_ATTEMPTS}
              AND "claimToken" IS NOT NULL
            )
          )
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= CURRENT_TIMESTAMP)
          AND ("claimExpiresAt" IS NULL OR "claimExpiresAt" <= CURRENT_TIMESTAMP)
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.batchSize}
      )
      UPDATE "event_outbox" AS event
      SET "claimToken" = ${claimToken},
          "claimExpiresAt" = CURRENT_TIMESTAMP + (${this.claimLeaseMs} * INTERVAL '1 millisecond'),
          "attemptCount" = LEAST(event."attemptCount" + 1, ${MAX_DELIVERY_ATTEMPTS})
      FROM candidates
      WHERE event."id" = candidates."id"
      RETURNING
        event."id" AS "id",
        event."eventId" AS "eventId",
        event."name" AS "name",
        event."version" AS "version",
        event."occurredAt" AS "occurredAt",
        event."payload" AS "payload",
        event."attemptCount" AS "attemptCount",
        event."claimToken" AS "claimToken"
    `);
  }

  private async dispatch(stored: ClaimedOutboxEvent): Promise<void> {
    const startedAt = Date.now();
    try {
      const event = await toDomainEvent(this.prisma, stored);
      if (event === null) {
        throw new Error(
          `Unsupported outbox event shape: ${stored.name}@${stored.version}`,
        );
      }

      await this.eventBus.publish(event);
      const acknowledged = await this.prisma.outboxEvent.updateMany({
        data: {
          claimExpiresAt: null,
          claimToken: null,
          lastError: null,
          nextAttemptAt: null,
          publishedAt: new Date(),
        },
        where: {
          claimToken: stored.claimToken,
          id: stored.id,
          publishedAt: null,
        },
      });
      if (acknowledged.count === 0) {
        this.logDelivery(stored, 'claim-lost', startedAt, false);
        return;
      }

      this.logDelivery(stored, 'published', startedAt, false);
    } catch (error) {
      let outcome: DeliveryOutcome = 'failure-recording-failed';
      let deadLettered = false;
      try {
        const failure = await this.recordFailure(stored, error);
        deadLettered = failure.deadLettered;
        outcome = !failure.recorded
          ? 'claim-lost'
          : deadLettered
            ? 'dead-lettered'
            : 'failed';
      } catch (recordingError) {
        this.logger.error(
          {
            attempt: stored.attemptCount,
            deadLettered: false,
            durationMs: Date.now() - startedAt,
            err: recordingError,
            eventId: stored.eventId,
            eventName: stored.name,
            outcome,
          },
          'Outbox delivery failure could not be persisted',
        );
      }
      this.logDelivery(stored, outcome, startedAt, deadLettered, error);
    }
  }

  private async recordFailure(
    stored: ClaimedOutboxEvent,
    error: unknown,
  ): Promise<FailureRecordingResult> {
    const deadLettered = stored.attemptCount >= MAX_DELIVERY_ATTEMPTS;
    const failedAt = new Date();
    const nextAttemptAt = deadLettered
      ? null
      : new Date(failedAt.getTime() + this.retryDelayMs(stored.attemptCount));
    const updated = await this.prisma.outboxEvent.updateMany({
      data: {
        claimExpiresAt: null,
        claimToken: null,
        deadLetteredAt: deadLettered ? failedAt : null,
        lastError: errorMessage(error),
        nextAttemptAt,
      },
      where: {
        claimToken: stored.claimToken,
        id: stored.id,
        publishedAt: null,
      },
    });
    return {
      deadLettered: updated.count > 0 && deadLettered,
      recorded: updated.count > 0,
    };
  }

  private retryDelayMs(attempt: number): number {
    const exponentialDelay = Math.min(
      this.backoffMaxMs,
      this.backoffBaseMs * 2 ** Math.max(0, attempt - 1),
    );
    const jitter = exponentialDelay * this.backoffJitterRatio * Math.random();
    return Math.min(this.backoffMaxMs, Math.ceil(exponentialDelay + jitter));
  }

  private logDelivery(
    stored: ClaimedOutboxEvent,
    outcome: DeliveryOutcome,
    startedAt: number,
    deadLettered: boolean,
    error?: unknown,
  ): void {
    const context = {
      attempt: stored.attemptCount,
      deadLettered,
      durationMs: Date.now() - startedAt,
      eventId: stored.eventId,
      eventName: stored.name,
      outcome,
    };
    if (error !== undefined) {
      this.logger.error(
        { ...context, err: error },
        'Outbox event delivery failed',
      );
      return;
    }
    this.logger.info(context, 'Outbox event delivery completed');
  }
}

async function toDomainEvent(
  prisma: AppPrismaClient,
  stored: {
    eventId: string;
    name: string;
    version: number;
    occurredAt: Date;
    payload: unknown;
  },
): Promise<AnyDomainEvent | null> {
  if (!isDomainEventName(stored.name)) return null;
  if (stored.name === 'StrategyEvaluated' && stored.version === 1) {
    return upcastStrategyEvaluated(prisma, stored);
  }
  if (stored.version !== DOMAIN_EVENT_VERSIONS[stored.name]) return null;
  if (!isValidDomainEventPayload(stored.name, stored.payload)) return null;
  return {
    eventId: stored.eventId,
    name: stored.name,
    payload: stored.payload as never,
    version: stored.version,
    occurredAt: stored.occurredAt.toISOString(),
  } as AnyDomainEvent;
}

async function upcastStrategyEvaluated(
  prisma: AppPrismaClient,
  stored: {
    eventId: string;
    occurredAt: Date;
    payload: unknown;
  },
): Promise<AnyDomainEvent | null> {
  if (!isRecord(stored.payload)) return null;
  const experimentId = stored.payload['experimentId'];
  const strategyVersionId = stored.payload['strategyVersionId'];
  const score = stored.payload['score'];
  if (
    typeof experimentId !== 'string' ||
    typeof strategyVersionId !== 'string' ||
    (typeof score !== 'number' && typeof score !== 'string') ||
    (typeof score === 'number' && !Number.isFinite(score))
  ) {
    return null;
  }

  const experiment = await prisma.experiment.findUnique({
    include: {
      strategyVersion: { include: { strategyDefinition: true } },
    },
    where: { id: experimentId },
  });
  if (experiment === null) return null;
  if (experiment.strategyVersionId !== strategyVersionId) return null;

  const strategyKind =
    experiment.strategyVersion.strategyDefinition.type === 'composite'
      ? 'composite'
      : 'singular';
  const display = formatStrategyDisplay(
    strategyKind,
    experiment.strategyVersion.params,
    experiment.strategyVersion.strategyDefinition.name,
  );
  const event = createDomainEvent(
    'StrategyEvaluated',
    {
      endTime: Number(experiment.endTime),
      experimentId,
      maxDrawdown: decimalString(experiment.maxDrawdown),
      memberStrategies: display.members,
      ownerId: experiment.ownerId,
      pair: experiment.pair,
      return: decimalString(experiment.return),
      score: String(score),
      startTime: Number(experiment.startTime),
      strategyDisplayName: display.name,
      strategyKind,
      strategyVersionId,
      timeframe: experiment.timeframe as Timeframe,
      totalProfit: decimalString(experiment.totalProfit),
      totalTrades: experiment.totalTrades ?? 0,
      winRate: decimalString(experiment.winRate),
    },
    {
      eventId: stored.eventId,
      occurredAt: stored.occurredAt.toISOString(),
    },
  );
  return isStrategyEvaluatedPayload(event.payload) ? event : null;
}

function isDomainEventName(value: string): value is DomainEventName {
  return value in DOMAIN_EVENT_VERSIONS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDomainEventPayload(
  name: DomainEventName,
  payload: unknown,
): boolean {
  if (!isRecord(payload)) return false;
  switch (name) {
    case 'MarketPriceUpdated':
      return (
        isNonEmptyString(payload['pair']) &&
        isTimeframe(payload['timeframe']) &&
        isSafeTimestamp(payload['openTime']) &&
        isNonEmptyString(payload['price']) &&
        isSafeTimestamp(payload['exchangeEventTime'])
      );
    case 'CandleClosed':
      return (
        isNonEmptyString(payload['pair']) &&
        isTimeframe(payload['timeframe']) &&
        isSafeTimestamp(payload['openTime']) &&
        isSafeTimestamp(payload['closeTime'])
      );
    case 'StrategyGenerated':
      return (
        isNonEmptyString(payload['candidateId']) &&
        isNonEmptyString(payload['searchRunId'])
      );
    case 'BacktestStarted':
      return (
        isNonEmptyString(payload['experimentId']) &&
        isNonEmptyString(payload['jobId']) &&
        isNonEmptyString(payload['workerId'])
      );
    case 'BacktestCompleted':
      return (
        isNonEmptyString(payload['experimentId']) &&
        isNonEmptyString(payload['jobId'])
      );
    case 'StrategyEvaluated':
      return isStrategyEvaluatedPayload(payload);
    case 'LeaderboardUpdated':
      return (
        isNonEmptyString(payload['userId']) &&
        isNonNegativeSafeInteger(payload['k']) &&
        isNonEmptyString(payload['updatedAt']) &&
        Array.isArray(payload['entries']) &&
        payload['entries'].every(isLeaderboardEntry)
      );
    case 'NewsCollected':
      return (
        isNonEmptyString(payload['newsItemId']) &&
        isNonEmptyString(payload['provider'])
      );
    case 'SentimentAnalyzed':
      return (
        isNonEmptyString(payload['newsItemId']) &&
        isSentimentLabel(payload['sentiment']) &&
        isFiniteNumber(payload['score']) &&
        isNewsEventType(payload['eventType']) &&
        Array.isArray(payload['relatedCoins']) &&
        payload['relatedCoins'].every(isNonEmptyString)
      );
    case 'ExtractionValidated':
      return (
        isNonEmptyString(payload['newsSourceId']) &&
        isNonEmptyString(payload['templateVersionId'])
      );
  }
}

function isSafeTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return isSafeTimestamp(value);
}

function isLeaderboardEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['experimentId']) &&
    isNonEmptyString(value['strategyVersionId']) &&
    isNonEmptyString(value['strategyDisplayName']) &&
    isNonEmptyString(value['pair']) &&
    isTimeframe(value['timeframe']) &&
    isSafeTimestamp(value['startTime']) &&
    isSafeTimestamp(value['endTime']) &&
    isNonEmptyString(value['score']) &&
    isNonEmptyString(value['return']) &&
    isNonEmptyString(value['winRate']) &&
    isNonEmptyString(value['maxDrawdown']) &&
    isNonEmptyString(value['totalProfit']) &&
    isNonNegativeSafeInteger(value['totalTrades']) &&
    isPositiveSafeInteger(value['rank']) &&
    Array.isArray(value['memberStrategies']) &&
    value['memberStrategies'].every(isLeaderboardMember)
  );
}

function isLeaderboardMember(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value['strategyId']) &&
    isNonEmptyString(value['label'])
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSentimentLabel(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    SENTIMENT_LABELS.includes(value as (typeof SENTIMENT_LABELS)[number])
  );
}

function isNewsEventType(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    NEWS_EVENT_TYPES.includes(value as (typeof NEWS_EVENT_TYPES)[number])
  );
}

function decimalString(value: unknown): string {
  return value === null || value === undefined ? '0' : String(value);
}

function errorMessage(error: unknown): string {
  let message: string;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    try {
      message = JSON.stringify(error) || String(error);
    } catch {
      message = String(error);
    }
  }
  return message.slice(0, MAX_ERROR_LENGTH);
}
