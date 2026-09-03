import type { AnyDomainEvent } from '@crypto-strategy-lab/shared';
import { createDomainEvent } from '@crypto-strategy-lab/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createPrismaClient,
  Prisma,
  type AppPrismaClient,
} from '@/database/prismaClient';
import { InMemoryDomainEventBus } from '@/events/inMemoryDomainEventBus';
import { PrismaOutboxDispatcher } from '@/events/prismaOutboxDispatcher';
import { createAppLogger } from '@/utils/logger';
import { getTestDatabaseUrl } from '../../../helpers/testDatabaseUrl';

describe('PrismaOutboxDispatcher integration', () => {
  let prisma: AppPrismaClient;
  const eventIds: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient(getTestDatabaseUrl());
    await prisma.$connect();
  });

  afterAll(async () => {
    if (eventIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { eventId: { in: eventIds } },
      });
    }
    await prisma.$disconnect();
  });

  it('claims different events when two dispatchers run concurrently', async () => {
    const first = createMarketPriceEvent('BTCUSDT');
    const second = createMarketPriceEvent('ETHUSDT');
    await createOutboxEvent(first);
    await createOutboxEvent(second);

    let publishCalls = 0;
    let releaseFirstCalls: (() => void) | undefined;
    const firstTwoPublishes = new Promise<void>((resolve) => {
      releaseFirstCalls = resolve;
    });
    const attempts = new Map<string, number>();
    const eventBus = {
      publish: async (event: AnyDomainEvent): Promise<void> => {
        publishCalls += 1;
        attempts.set(event.eventId, (attempts.get(event.eventId) ?? 0) + 1);
        if (publishCalls <= 2) {
          if (publishCalls === 2) releaseFirstCalls?.();
          await firstTwoPublishes;
        }
      },
    };
    const options = {
      backoffBaseMs: 0,
      batchSize: 1,
      claimLeaseMs: 1_000,
    };
    const firstDispatcher = new PrismaOutboxDispatcher(
      prisma,
      eventBus,
      createAppLogger({ enabled: false, service: 'outbox-test' }),
      options,
    );
    const secondDispatcher = new PrismaOutboxDispatcher(
      prisma,
      eventBus,
      createAppLogger({ enabled: false, service: 'outbox-test' }),
      options,
    );

    await Promise.all([
      firstDispatcher.dispatchOnce(),
      secondDispatcher.dispatchOnce(),
    ]);

    expect(attempts).toEqual(
      new Map([
        [first.eventId, 1],
        [second.eventId, 1],
      ]),
    );
    const stored = await prisma.outboxEvent.findMany({
      orderBy: { eventId: 'asc' },
      where: { eventId: { in: [first.eventId, second.eventId] } },
    });
    expect(stored).toHaveLength(2);
    expect(stored.every((event) => event.publishedAt !== null)).toBe(true);
  });

  it('recovers an event after its claim expires', async () => {
    const event = createMarketPriceEvent('SOLUSDT');
    await createOutboxEvent(event);

    let firstPublishStarted: (() => void) | undefined;
    const firstPublish = new Promise<void>((resolve) => {
      firstPublishStarted = resolve;
    });
    let releaseFirstPublish: (() => void) | undefined;
    const firstPublishMayFinish = new Promise<void>((resolve) => {
      releaseFirstPublish = resolve;
    });
    let attempts = 0;
    const firstDispatcher = new PrismaOutboxDispatcher(
      prisma,
      {
        publish: async () => {
          attempts += 1;
          if (attempts === 1) {
            firstPublishStarted?.();
            await firstPublishMayFinish;
          }
        },
      },
      createAppLogger({ enabled: false, service: 'outbox-test' }),
      { claimLeaseMs: 10_000, backoffBaseMs: 0 },
    );
    const firstDispatch = firstDispatcher.dispatchOnce();
    await firstPublish;

    await prisma.outboxEvent.update({
      data: { claimExpiresAt: new Date(Date.now() - 1) },
      where: { eventId: event.eventId },
    });

    const secondDispatcher = new PrismaOutboxDispatcher(
      prisma,
      {
        publish: async () => {
          attempts += 1;
        },
      },
      createAppLogger({ enabled: false, service: 'outbox-test' }),
      { claimLeaseMs: 10_000, backoffBaseMs: 0 },
    );
    await secondDispatcher.dispatchOnce();
    releaseFirstPublish?.();
    await firstDispatch;

    const stored = await prisma.outboxEvent.findUniqueOrThrow({
      where: { eventId: event.eventId },
    });
    expect(attempts).toBe(2);
    expect(stored.attemptCount).toBe(2);
    expect(stored.publishedAt).not.toBeNull();
    expect(stored.claimToken).toBeNull();
    expect(stored.claimExpiresAt).toBeNull();
  });

  it('recovers an expired eighth claim without exceeding the attempt limit', async () => {
    const event = createMarketPriceEvent('AVAXUSDT');
    await createOutboxEvent(event);
    await prisma.outboxEvent.update({
      data: { attemptCount: 7 },
      where: { eventId: event.eventId },
    });

    let firstPublishStarted: (() => void) | undefined;
    const firstPublish = new Promise<void>((resolve) => {
      firstPublishStarted = resolve;
    });
    let releaseFirstPublish: (() => void) | undefined;
    const firstPublishMayFinish = new Promise<void>((resolve) => {
      releaseFirstPublish = resolve;
    });
    let attempts = 0;
    const firstDispatcher = new PrismaOutboxDispatcher(
      prisma,
      {
        publish: async () => {
          attempts += 1;
          firstPublishStarted?.();
          await firstPublishMayFinish;
        },
      },
      createAppLogger({ enabled: false, service: 'outbox-test' }),
      { claimLeaseMs: 10_000, backoffBaseMs: 0 },
    );
    const firstDispatch = firstDispatcher.dispatchOnce();
    await firstPublish;

    await prisma.outboxEvent.update({
      data: { claimExpiresAt: new Date(Date.now() - 1) },
      where: { eventId: event.eventId },
    });

    const secondDispatcher = new PrismaOutboxDispatcher(
      prisma,
      {
        publish: () => {
          attempts += 1;
          throw new Error('eighth-attempt poison consumer');
        },
      },
      createAppLogger({ enabled: false, service: 'outbox-test' }),
      { claimLeaseMs: 10_000, backoffBaseMs: 0 },
    );
    await secondDispatcher.dispatchOnce();
    releaseFirstPublish?.();
    await firstDispatch;

    const stored = await prisma.outboxEvent.findUniqueOrThrow({
      where: { eventId: event.eventId },
    });
    expect(attempts).toBe(2);
    expect(stored.attemptCount).toBe(8);
    expect(stored.publishedAt).toBeNull();
    expect(stored.deadLetteredAt).not.toBeNull();
  });

  it('isolates a poison event and records its retry state', async () => {
    const poisonEvent = createMarketPriceEvent('ADAUSDT');
    const malformedEvent = createMarketPriceEvent('LTCUSDT');
    const validEvent = createMarketPriceEvent('XRPUSDT');
    await createOutboxEvent(poisonEvent, {
      name: 'UnsupportedEvent',
      payload: { unsupported: true },
    });
    await createOutboxEvent(malformedEvent, {
      name: 'MarketPriceUpdated',
      payload: { pair: 'LTCUSDT' },
    });
    await createOutboxEvent(validEvent);

    const published: string[] = [];
    const dispatcher = new PrismaOutboxDispatcher(
      prisma,
      {
        publish: (event) => {
          published.push(event.eventId);
        },
      },
      createAppLogger({ enabled: false, service: 'outbox-test' }),
      {
        backoffBaseMs: 60_000,
        backoffJitterRatio: 0,
        batchSize: 3,
      },
    );

    await dispatcher.dispatchOnce();

    const poison = await prisma.outboxEvent.findUniqueOrThrow({
      where: { eventId: poisonEvent.eventId },
    });
    const malformed = await prisma.outboxEvent.findUniqueOrThrow({
      where: { eventId: malformedEvent.eventId },
    });
    const valid = await prisma.outboxEvent.findUniqueOrThrow({
      where: { eventId: validEvent.eventId },
    });
    expect(published).toEqual([validEvent.eventId]);
    expect(poison.publishedAt).toBeNull();
    expect(poison.attemptCount).toBe(1);
    expect(poison.lastError).toMatch(/unsupported/i);
    expect(poison.nextAttemptAt).not.toBeNull();
    expect(poison.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(malformed.publishedAt).toBeNull();
    expect(malformed.attemptCount).toBe(1);
    expect(malformed.lastError).toMatch(/unsupported/i);
    expect(malformed.nextAttemptAt).not.toBeNull();
    expect(valid.publishedAt).not.toBeNull();
  });

  it('dead-letters a repeatedly failing event after eight attempts', async () => {
    const event = createMarketPriceEvent('DOGEUSDT');
    await createOutboxEvent(event);

    const dispatcher = new PrismaOutboxDispatcher(
      prisma,
      {
        publish: () => {
          throw new Error('poison consumer');
        },
      },
      createAppLogger({ enabled: false, service: 'outbox-test' }),
      {
        backoffBaseMs: 0,
        backoffJitterRatio: 0,
      },
    );

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await dispatcher.dispatchOnce();
    }

    const stored = await prisma.outboxEvent.findUniqueOrThrow({
      where: { eventId: event.eventId },
    });
    expect(stored.attemptCount).toBe(8);
    expect(stored.publishedAt).toBeNull();
    expect(stored.deadLetteredAt).not.toBeNull();
    expect(stored.lastError).toContain('poison consumer');
    expect(stored.nextAttemptAt).toBeNull();

    await dispatcher.dispatchOnce();
    const stillDeadLettered = await prisma.outboxEvent.findUniqueOrThrow({
      where: { eventId: event.eventId },
    });
    expect(stillDeadLettered.attemptCount).toBe(8);
  });

  it('retries after delivery-before-ack and each consumer handles the event once', async () => {
    const event = createMarketPriceEvent('BNBUSDT');
    await createOutboxEvent(event);

    const consumerBus = new InMemoryDomainEventBus();
    const consumed: AnyDomainEvent[] = [];
    const unsubscribe = consumerBus.subscribeAll((received) => {
      if (received.eventId === event.eventId) consumed.push(received);
    });
    let publishAttempts = 0;
    const dispatcher = new PrismaOutboxDispatcher(
      prisma,
      {
        publish: (received) => {
          consumerBus.publish(received);
          publishAttempts += 1;
          if (publishAttempts === 1) {
            throw new Error('simulated acknowledgement failure');
          }
        },
      },
      createAppLogger({ enabled: false, service: 'outbox-test' }),
      { backoffBaseMs: 0 },
    );

    await dispatcher.dispatchOnce();
    const unacknowledged = await prisma.outboxEvent.findUniqueOrThrow({
      where: { eventId: event.eventId },
    });
    expect(unacknowledged.publishedAt).toBeNull();
    expect(unacknowledged.attemptCount).toBe(1);
    expect(publishAttempts).toBe(1);
    expect(consumed).toHaveLength(1);

    await dispatcher.dispatchOnce();
    const acknowledged = await prisma.outboxEvent.findUniqueOrThrow({
      where: { eventId: event.eventId },
    });
    expect(acknowledged.publishedAt).not.toBeNull();
    expect(acknowledged.attemptCount).toBe(2);
    expect(publishAttempts).toBe(2);
    expect(consumed).toHaveLength(1);
    unsubscribe();
  });

  async function createOutboxEvent(
    event: AnyDomainEvent,
    overrides: OutboxEventOverrides = {},
  ): Promise<void> {
    eventIds.push(event.eventId);
    await prisma.outboxEvent.create({
      data: {
        eventId: event.eventId,
        name: overrides.name ?? event.name,
        occurredAt: new Date(event.occurredAt),
        payload: (overrides.payload ??
          event.payload) as unknown as Prisma.InputJsonValue,
        version: overrides.version ?? event.version,
      },
    });
  }
});

function createMarketPriceEvent(
  pair:
    | 'ADAUSDT'
    | 'AVAXUSDT'
    | 'BNBUSDT'
    | 'BTCUSDT'
    | 'DOGEUSDT'
    | 'ETHUSDT'
    | 'LTCUSDT'
    | 'SOLUSDT'
    | 'XRPUSDT',
): AnyDomainEvent {
  return createDomainEvent('MarketPriceUpdated', {
    exchangeEventTime: 1_000,
    openTime: 0,
    pair,
    price: '100',
    timeframe: '1m',
  });
}

interface OutboxEventOverrides {
  name?: string;
  version?: number;
  payload?: unknown;
}
