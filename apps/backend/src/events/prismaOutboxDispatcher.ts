import type {
  AnyDomainEvent,
  DomainEventName,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import {
  createDomainEvent,
  DOMAIN_EVENT_VERSIONS,
  formatCompositeStrategyDisplay,
  isStrategyEvaluatedPayload,
} from '@crypto-strategy-lab/shared';

import type { AppPrismaClient } from '@/database/prismaClient';
import type { AppLogger } from '@/utils/logger';

export interface DomainEventBus {
  publish(event: AnyDomainEvent): void | Promise<void>;
}

export interface OutboxDispatcherOptions {
  pollIntervalMs?: number;
  batchSize?: number;
}

export class PrismaOutboxDispatcher {
  private readonly pollIntervalMs: number;

  private readonly batchSize: number;

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
      const events = await this.prisma.outboxEvent.findMany({
        orderBy: { createdAt: 'asc' },
        take: this.batchSize,
        where: { publishedAt: null },
      });
      for (const stored of events) {
        let event: AnyDomainEvent | null;
        try {
          event = await toDomainEvent(this.prisma, stored);
        } catch (error) {
          this.logger.error(
            { err: error, eventId: stored.eventId, eventName: stored.name },
            'Outbox event decoding failed; it will be retried',
          );
          break;
        }
        if (event === null) {
          this.logger.error(
            { outboxEventId: stored.id, eventName: stored.name },
            'Outbox event has an unsupported shape',
          );
          try {
            await this.prisma.outboxEvent.updateMany({
              data: { publishedAt: new Date() },
              where: { id: stored.id, publishedAt: null },
            });
          } catch (error) {
            this.logger.error(
              { err: error, outboxEventId: stored.id },
              'Unsupported outbox event could not be acknowledged; it will be retried',
            );
            break;
          }
          continue;
        }
        try {
          await this.eventBus.publish(event);
          await this.prisma.outboxEvent.updateMany({
            data: { publishedAt: new Date() },
            where: { id: stored.id, publishedAt: null },
          });
        } catch (error) {
          this.logger.error(
            { err: error, eventId: stored.eventId, eventName: stored.name },
            'Outbox event publish failed; it will be retried',
          );
          break;
        }
      }
    } finally {
      this.dispatching = false;
    }
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
  if (!isRecord(stored.payload)) return null;
  if (
    stored.name === 'StrategyEvaluated' &&
    !isStrategyEvaluatedPayload(stored.payload)
  ) {
    return null;
  }
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

  const display = formatCompositeStrategyDisplay(
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
      strategyKind:
        experiment.strategyVersion.strategyDefinition.type === 'composite'
          ? 'composite'
          : 'singular',
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

function decimalString(value: unknown): string {
  return value === null || value === undefined ? '0' : String(value);
}
