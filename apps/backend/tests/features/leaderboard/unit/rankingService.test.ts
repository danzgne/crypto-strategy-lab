import {
  createDomainEvent,
  type LeaderboardSnapshot,
} from '@crypto-strategy-lab/shared';
import { describe, expect, it } from 'vitest';

import { RankingService } from '@/api/features/leaderboard/services/rankingService';
import { rankTopK } from '@/api/features/leaderboard/services/ranking';
import { candidateFromEvaluation } from '@/api/features/leaderboard/types';
import type {
  EligibleLeaderboardEntry,
  LeaderboardEventBus,
  LeaderboardProjectionRepository,
  StrategyEvaluatedEvent,
} from '@/api/features/leaderboard/types';

describe('RankingService', () => {
  it('ranks synthetic composite evaluations by score and keeps only Top-K', async () => {
    const bus = new FakeEventBus();
    const repository = new FakeRepository(2);
    const service = new RankingService({ eventBus: bus, repository, topK: 2 });
    await service.start();

    await bus.publish(evaluation('experiment-b', '0.50'));
    await bus.publish(evaluation('experiment-a', '0.90'));
    await bus.publish(evaluation('experiment-c', '0.40'));

    expect(
      repository.snapshot.entries.map(({ experimentId, rank }) => ({
        experimentId,
        rank,
      })),
    ).toEqual([
      { experimentId: 'experiment-a', rank: 1 },
      { experimentId: 'experiment-b', rank: 2 },
    ]);
    expect(repository.replacements).toHaveLength(2);
    service.stop();
  });

  it('ignores singular evaluations and does not publish unchanged updates', async () => {
    const bus = new FakeEventBus();
    const repository = new FakeRepository(10);
    const service = new RankingService({ eventBus: bus, repository });
    await service.start();

    await bus.publish(evaluation('experiment-a', '0.90', 'singular'));
    expect(repository.replacements).toHaveLength(0);

    const malformed = evaluation('experiment-malformed', '0.95');
    await bus.publish({
      ...malformed,
      payload: { ...malformed.payload, memberStrategies: [] },
    });
    await bus.publish({
      ...malformed,
      eventId: 'malformed-pair',
      payload: { ...malformed.payload, pair: 'BTC/USDT' },
    } as StrategyEvaluatedEvent);
    await bus.publish({
      ...malformed,
      eventId: 'malformed-score',
      payload: { ...malformed.payload, score: 'not-a-decimal' },
    } as StrategyEvaluatedEvent);
    expect(repository.replacements).toHaveLength(0);

    await bus.publish(evaluation('experiment-a', '0.90'));
    await bus.publish(evaluation('experiment-a', '0.90'));
    expect(repository.replacements).toHaveLength(1);
    service.stop();
  });

  it('compares decimal scores without losing precision', () => {
    const ranked = rankTopK(
      [
        candidateFromEvaluation(
          evaluation('experiment-low', '0.100000000000000000').payload,
        ),
        candidateFromEvaluation(
          evaluation('experiment-high', '0.100000000000000001').payload,
        ),
      ],
      2,
    );

    expect(ranked.map(({ experimentId }) => experimentId)).toEqual([
      'experiment-high',
      'experiment-low',
    ]);
  });
});

class FakeEventBus implements LeaderboardEventBus {
  private handler:
    ((event: StrategyEvaluatedEvent) => void | Promise<void>) | undefined;

  public subscribe(
    _name: 'StrategyEvaluated',
    handler: (event: StrategyEvaluatedEvent) => void | Promise<void>,
  ): () => void {
    this.handler = handler;
    return () => {
      this.handler = undefined;
    };
  }

  public async publish(event: StrategyEvaluatedEvent): Promise<void> {
    await this.handler?.(event);
  }
}

class FakeRepository implements LeaderboardProjectionRepository {
  public snapshot: LeaderboardSnapshot;

  public readonly replacements: LeaderboardSnapshot[] = [];

  public constructor(private readonly k: number) {
    this.snapshot = {
      entries: [],
      k,
      updatedAt: '2026-01-01T00:00:00.000Z',
      userId: 'user-1',
    };
  }

  public findSnapshot(): Promise<LeaderboardSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  public replaceSnapshot(
    userId: string,
    k: number,
    entries: LeaderboardSnapshot['entries'],
  ): Promise<LeaderboardSnapshot> {
    this.snapshot = {
      entries,
      k,
      updatedAt: '2026-01-01T00:00:01.000Z',
      userId,
    };
    this.replacements.push(this.snapshot);
    return Promise.resolve(this.snapshot);
  }

  public findEligibleEntries(): Promise<EligibleLeaderboardEntry[]> {
    return Promise.resolve([]);
  }

  public findLeaderboardUserIds(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

function evaluation(
  experimentId: string,
  score: string,
  strategyKind: 'singular' | 'composite' = 'composite',
): StrategyEvaluatedEvent {
  return createDomainEvent('StrategyEvaluated', {
    endTime: 2,
    experimentId,
    maxDrawdown: '0.1',
    memberStrategies: [
      { label: 'MA', strategyId: 'ma' },
      { label: 'RSI', strategyId: 'rsi' },
    ],
    ownerId: 'user-1',
    pair: 'BTCUSDT',
    return: '0.2',
    score,
    startTime: 1,
    strategyDisplayName: 'MA + RSI',
    strategyKind,
    strategyVersionId: 'version-1',
    timeframe: '1m',
    totalProfit: '100',
    totalTrades: 4,
    winRate: '0.75',
  });
}
