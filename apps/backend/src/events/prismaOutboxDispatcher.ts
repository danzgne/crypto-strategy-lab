import type {
  AnyDomainEvent,
  DomainEventName,
} from '@crypto-strategy-lab/shared';
import { DOMAIN_EVENT_VERSIONS } from '@crypto-strategy-lab/shared';

import type { AppPrismaClient } from '@/database/prismaClient';
import type { AppLogger } from '@/utils/logger';

export interface DomainEventBus {
  publish(event: AnyDomainEvent): void;
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
        const event = toDomainEvent(stored);
        if (event === null) {
          this.logger.error(
            { outboxEventId: stored.id, eventName: stored.name },
            'Outbox event has an unsupported shape',
          );
          continue;
        }
        try {
          this.eventBus.publish(event);
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

function toDomainEvent(stored: {
  eventId: string;
  name: string;
  version: number;
  occurredAt: Date;
  payload: unknown;
}): AnyDomainEvent | null {
  if (!isDomainEventName(stored.name)) return null;
  if (stored.version !== DOMAIN_EVENT_VERSIONS[stored.name]) return null;
  if (!isRecord(stored.payload)) return null;
  return {
    eventId: stored.eventId,
    name: stored.name,
    payload: stored.payload as never,
    version: stored.version,
    occurredAt: stored.occurredAt.toISOString(),
  } as AnyDomainEvent;
}

function isDomainEventName(value: string): value is DomainEventName {
  return value in DOMAIN_EVENT_VERSIONS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
