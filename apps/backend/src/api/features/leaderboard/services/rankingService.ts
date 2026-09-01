import {
  isStrategyEvaluatedPayload,
  type LeaderboardResponse,
} from '@crypto-strategy-lab/shared';

import { LeaderboardProjectionConflictError } from '../types';
import type {
  EligibleLeaderboardEntry,
  LeaderboardEventBus,
  LeaderboardProjectionRepository,
  StrategyEvaluatedEvent,
} from '../types';
import { candidateFromEvaluation } from '../types';
import { rankTopK, snapshotEntriesEqual } from './ranking';

const DEFAULT_TOP_K = 10;

export interface RankingServiceOptions {
  eventBus: LeaderboardEventBus;
  repository: LeaderboardProjectionRepository;
  topK?: number;
}

export class RankingService {
  private readonly topK: number;

  private unsubscribe: (() => void) | undefined;

  private readonly userQueues = new Map<string, Promise<void>>();

  public constructor(private readonly options: RankingServiceOptions) {
    this.topK = Math.max(1, Math.trunc(options.topK ?? DEFAULT_TOP_K));
  }

  public async start(): Promise<void> {
    if (this.unsubscribe !== undefined) return;
    this.unsubscribe = this.options.eventBus.subscribe(
      'StrategyEvaluated',
      (event) => this.handleEvaluation(event),
    );
    await this.reconcile();
  }

  public stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  public async reconcile(): Promise<void> {
    const eligible = await this.options.repository.findEligibleEntries();
    const entriesByUser = new Map<string, typeof eligible>();
    const userIds = await this.options.repository.findLeaderboardUserIds();
    for (const entry of eligible) {
      const entries = entriesByUser.get(entry.userId) ?? [];
      entries.push(entry);
      entriesByUser.set(entry.userId, entries);
    }
    for (const userId of userIds) {
      if (!entriesByUser.has(userId)) entriesByUser.set(userId, []);
    }

    await Promise.all(
      [...entriesByUser.entries()].map(([userId, entries]) =>
        this.enqueue(userId, async () => {
          await this.reconcileUser(userId, entries);
        }),
      ),
    );
  }

  public async get(userId: string): Promise<LeaderboardResponse> {
    const snapshot = await this.options.repository.findSnapshot(userId);
    return {
      entries: snapshot.entries,
      k: snapshot.k,
      updatedAt: snapshot.updatedAt,
    };
  }

  private handleEvaluation(event: StrategyEvaluatedEvent): Promise<void> {
    const payload = event.payload;
    if (!isEligibleCompositeEvaluation(payload)) return Promise.resolve();

    return this.enqueue(payload.ownerId, async () => {
      await this.applyEvaluation(
        payload.ownerId,
        candidateFromEvaluation(payload),
        event.eventId,
      );
    });
  }

  private async reconcileUser(
    userId: string,
    eligible: readonly EligibleLeaderboardEntry[],
  ): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await this.options.repository.findSnapshot(userId);
      const next = rankTopK(eligible, this.topK);
      if (snapshotEntriesEqual(current.entries, next)) return;
      try {
        await this.options.repository.replaceSnapshot(
          userId,
          this.topK,
          next,
          undefined,
          current.updatedAt,
        );
        return;
      } catch (error) {
        if (!(error instanceof LeaderboardProjectionConflictError)) throw error;
      }
    }
    throw new Error('Leaderboard reconciliation conflicted too many times');
  }

  private async applyEvaluation(
    userId: string,
    candidate: Parameters<typeof rankTopK>[0][number],
    eventId: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await this.options.repository.findSnapshot(userId);
      const next = rankTopK([...current.entries, candidate], this.topK);
      if (snapshotEntriesEqual(current.entries, next)) return;
      try {
        await this.options.repository.replaceSnapshot(
          userId,
          this.topK,
          next,
          eventId,
          current.updatedAt,
        );
        return;
      } catch (error) {
        if (!(error instanceof LeaderboardProjectionConflictError)) throw error;
      }
    }
    throw new Error('Leaderboard update conflicted too many times');
  }

  private enqueue(userId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.userQueues.get(userId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.userQueues.set(userId, current);
    return current.finally(() => {
      if (this.userQueues.get(userId) === current) {
        this.userQueues.delete(userId);
      }
    });
  }
}

function isEligibleCompositeEvaluation(
  payload: unknown,
): payload is StrategyEvaluatedEvent['payload'] {
  return (
    isStrategyEvaluatedPayload(payload) &&
    payload.strategyKind === 'composite' &&
    payload.memberStrategies.length >= 2
  );
}

export type LeaderboardServiceInterface = Pick<RankingService, 'get'>;
