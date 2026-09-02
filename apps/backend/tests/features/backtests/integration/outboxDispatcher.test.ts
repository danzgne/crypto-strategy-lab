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

  it('retries after delivery-before-ack and each consumer handles the event once', async () => {
    const event = createDomainEvent('StrategyEvaluated', {
      endTime: 2,
      experimentId: `issue37-outbox-${Date.now()}`,
      maxDrawdown: '0.1',
      memberStrategies: [
        { label: 'MA', strategyId: 'ma' },
        { label: 'RSI', strategyId: 'rsi' },
      ],
      ownerId: 'owner-1',
      pair: 'BTCUSDT',
      return: '0.2',
      score: '0.4',
      startTime: 1,
      strategyDisplayName: 'MA + RSI',
      strategyKind: 'composite',
      strategyVersionId: 'strategy-version-1',
      timeframe: '1m',
      totalProfit: '100',
      totalTrades: 4,
      winRate: '0.75',
    });
    eventIds.push(event.eventId);
    await prisma.outboxEvent.create({
      data: {
        eventId: event.eventId,
        name: event.name,
        occurredAt: new Date(event.occurredAt),
        payload: event.payload as unknown as Prisma.InputJsonValue,
        version: event.version,
      },
    });

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
          if (received.eventId !== event.eventId) return;
          publishAttempts += 1;
          if (publishAttempts === 1) {
            throw new Error('simulated acknowledgement failure');
          }
        },
      },
      createAppLogger({ enabled: false, service: 'outbox-test' }),
    );

    await dispatcher.dispatchOnce();
    const unacknowledged = await prisma.outboxEvent.findUniqueOrThrow({
      where: { eventId: event.eventId },
    });
    expect(unacknowledged.publishedAt).toBeNull();
    expect(publishAttempts).toBe(1);
    expect(consumed).toHaveLength(1);

    await dispatcher.dispatchOnce();
    const acknowledged = await prisma.outboxEvent.findUniqueOrThrow({
      where: { eventId: event.eventId },
    });
    expect(acknowledged.publishedAt).not.toBeNull();
    expect(publishAttempts).toBe(2);
    expect(consumed).toHaveLength(1);
    unsubscribe();
  });
});
