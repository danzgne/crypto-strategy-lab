import { randomUUID } from 'node:crypto';

import { config as loadEnvironment } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createPrismaClient,
  type AppPrismaClient,
} from '@/database/prismaClient';
import {
  PrismaLeaderboardRepository,
  RankingService,
} from '@/api/features/leaderboard';
import { InMemoryDomainEventBus } from '@/events/inMemoryDomainEventBus';

loadEnvironment({
  path: new URL('../../../../../../.env', import.meta.url),
  quiet: true,
});

describe('leaderboard persistence', () => {
  let prisma: AppPrismaClient;
  let ownerId: string;
  let experimentId: string;
  let strategyVersionId: string;
  let strategyDefinitionId: string;

  beforeAll(async () => {
    prisma = createPrismaClient(process.env.DATABASE_URL!);
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        email: `issue38-leaderboard-${Date.now()}@example.com`,
        passwordHash: 'integration-test',
      },
    });
    ownerId = user.id;

    const definition = await prisma.strategyDefinition.create({
      data: {
        name: 'Composite experiment fixture',
        ownerId,
        source: 'USER_PROMPT',
        sourceInput: 'Issue 38 leaderboard fixture',
        tags: [],
        type: 'composite',
      },
    });
    strategyDefinitionId = definition.id;

    const version = await prisma.strategyVersion.create({
      data: {
        libraryVersion: '1.0.0',
        ownerId,
        params: {
          members: [
            { params: { fast: 2, slow: 3 }, strategyId: 'ma' },
            { params: { period: 14 }, strategyId: 'rsi' },
          ],
          mode: 'majority',
        },
        strategyDefinitionId,
        versionTag: 'issue38-leaderboard-fixture',
      },
    });
    strategyVersionId = version.id;

    const experiment = await prisma.experiment.create({
      data: {
        endTime: 2,
        evaluatorVersion: 'default-v1',
        initialInvestment: '1000',
        maxDrawdown: '0.1',
        ownerId,
        pair: 'BTCUSDT',
        return: '0.2',
        score: '0.8',
        slippage: '0',
        startTime: 1,
        strategyVersionId,
        timeframe: '1m',
        totalProfit: '0',
        totalTrades: 0,
        transactionCost: '0',
        winRate: '0',
      },
    });
    experimentId = experiment.id;
    await prisma.backtestJob.create({
      data: {
        experimentId,
        ownerId,
        status: 'COMPLETED',
      },
    });
  });

  afterAll(async () => {
    const leaderboardEvents = await prisma.outboxEvent.findMany({
      where: { name: 'LeaderboardUpdated' },
    });
    const eventIds = leaderboardEvents
      .filter((event) => {
        const payload = event.payload as { userId?: unknown };
        return payload.userId === ownerId;
      })
      .map((event) => event.id);
    if (eventIds.length > 0) {
      await prisma.outboxEvent.deleteMany({ where: { id: { in: eventIds } } });
    }
    await prisma.leaderboard.deleteMany({ where: { ownerId } });
    await prisma.backtestJob.deleteMany({ where: { experimentId } });
    await prisma.experiment.deleteMany({ where: { id: experimentId } });
    await prisma.strategyVersion.delete({ where: { id: strategyVersionId } });
    await prisma.strategyDefinition.delete({
      where: { id: strategyDefinitionId },
    });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('reconciles completed composites into one owner-scoped projection and outbox snapshot', async () => {
    const eventBus = new InMemoryDomainEventBus();
    const service = new RankingService({
      eventBus,
      repository: new PrismaLeaderboardRepository(prisma, 10),
      topK: 10,
    });

    await service.start();
    const board = await prisma.leaderboard.findUniqueOrThrow({
      include: { entries: true },
      where: { ownerId },
    });
    const entry = board.entries[0];
    expect(entry?.experimentId).toBe(experimentId);
    expect(entry?.maxDrawdown.toString()).toBe('0.1');
    expect(entry?.rank).toBe(1);
    expect(entry?.score.toString()).toBe('0.8');
    expect(entry?.strategyDisplayName).toBe('MA + RSI');
    expect(entry?.totalTrades).toBe(0);
    expect(entry?.memberStrategies).toEqual([
      { label: 'MA', strategyId: 'ma' },
      { label: 'RSI', strategyId: 'rsi' },
    ]);

    const events = await prisma.outboxEvent.findMany({
      where: { name: 'LeaderboardUpdated' },
    });
    expect(events.some((event) => event.version === 2)).toBe(true);

    const repository = new PrismaLeaderboardRepository(prisma, 10);
    const current = await repository.findSnapshot(ownerId);
    const sourceEventId = randomUUID();
    const eventCount = events.length;
    await repository.replaceSnapshot(
      ownerId,
      10,
      current.entries,
      sourceEventId,
      current.updatedAt,
    );
    await repository.replaceSnapshot(
      ownerId,
      10,
      current.entries,
      sourceEventId,
      current.updatedAt,
    );
    const replayedEvents = await prisma.outboxEvent.count({
      where: { name: 'LeaderboardUpdated' },
    });
    expect(replayedEvents).toBe(eventCount);
    expect(
      await prisma.leaderboardEventReceipt.count({
        where: { eventId: sourceEventId },
      }),
    ).toBe(1);
    service.stop();
  });
});
