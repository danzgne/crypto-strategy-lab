import { describe, expect, it } from 'vitest';

import { StrategyLibraryService } from '@/api/features/strategies/services/strategyLibraryService';
import type {
  CreateStrategyLibraryEntryInput,
  StrategyLibraryEntry,
  StrategyLibraryRepository,
} from '@/api/features/strategies/repositories/interfaces/strategyLibraryRepository.interface';

const VALID_PARAMS = {
  indicators: [{ name: 'RSI', period: 14 }],
  conditions: {
    long: [{ indicator: 'RSI', operator: '<', value: 30 }],
    short: [],
  },
  timeframe: '1h',
};

class FakeStrategyLibraryRepository implements StrategyLibraryRepository {
  public created: CreateStrategyLibraryEntryInput[] = [];

  public entries: StrategyLibraryEntry[] = [];

  public async createWithFirstVersion(
    input: CreateStrategyLibraryEntryInput,
  ): Promise<StrategyLibraryEntry> {
    this.created.push(input);
    const entry: StrategyLibraryEntry = {
      id: `entry-${this.created.length}`,
      ownerId: input.ownerId,
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      source: input.source,
      sourceInput: input.sourceInput,
      tags: [...input.tags],
      createdAt: new Date(),
      updatedAt: new Date(),
      latestVersion: {
        id: `version-${this.created.length}`,
        params: input.params,
        versionTag: input.versionTag,
        libraryVersion: input.libraryVersion,
        createdAt: new Date(),
      },
    };
    this.entries.push(entry);
    return entry;
  }

  public async listRecentByOwner(
    ownerId: string,
    limit: number,
  ): Promise<StrategyLibraryEntry[]> {
    return this.entries
      .filter((entry) => entry.ownerId === ownerId)
      .slice(0, limit);
  }
}

describe('StrategyLibraryService', () => {
  it('saves a valid strategy and computes its version tag from resolved params', async () => {
    const repository = new FakeStrategyLibraryRepository();
    const service = new StrategyLibraryService({ repository });

    const result = await service.save({
      ownerId: 'user-1',
      name: 'RSI_LONG',
      tags: ['rsi'],
      source: 'USER_PROMPT',
      sourceInput: 'Long when RSI under 30',
      params: VALID_PARAMS,
    });

    expect(result.outcome).toBe('SUCCESS');
    expect(repository.created).toHaveLength(1);
    const created = repository.created[0]!;
    expect(created.type).toBe('rule');
    expect(created.versionTag).toMatch(/^[0-9a-f]{64}$/);
    expect(created.libraryVersion).toBe('1.0.0');
  });

  it('stores the authored params exactly as submitted, not the resolved defaults', async () => {
    const repository = new FakeStrategyLibraryRepository();
    const service = new StrategyLibraryService({ repository });

    await service.save({
      ownerId: 'user-1',
      name: 'RSI_LONG',
      source: 'USER_PROMPT',
      sourceInput: 'Long when RSI under 30',
      params: VALID_PARAMS,
    });

    expect(repository.created[0]!.params).toEqual(VALID_PARAMS);
  });

  it('uses a client-supplied libraryVersion when given', async () => {
    const repository = new FakeStrategyLibraryRepository();
    const service = new StrategyLibraryService({ repository });

    await service.save({
      ownerId: 'user-1',
      name: 'RSI_LONG',
      source: 'USER_PROMPT',
      sourceInput: 'Long when RSI under 30',
      params: VALID_PARAMS,
      libraryVersion: '2.3.1',
    });

    expect(repository.created[0]!.libraryVersion).toBe('2.3.1');
  });

  it('returns GENERATION_INVALID and does not persist when params fail validation', async () => {
    const repository = new FakeStrategyLibraryRepository();
    const service = new StrategyLibraryService({ repository });

    const result = await service.save({
      ownerId: 'user-1',
      name: 'BROKEN',
      source: 'USER_PROMPT',
      sourceInput: 'anything',
      params: { indicators: [], conditions: { long: [], short: [] } },
    });

    expect(result.outcome).toBe('GENERATION_INVALID');
    expect(repository.created).toHaveLength(0);
  });

  it('computes the same version tag for two structurally-equal params (whitespace/order should not matter)', async () => {
    const repository = new FakeStrategyLibraryRepository();
    const service = new StrategyLibraryService({ repository });

    await service.save({
      ownerId: 'user-1',
      name: 'A',
      source: 'USER_PROMPT',
      sourceInput: 'x',
      params: {
        timeframe: '1h',
        indicators: [{ name: 'RSI', period: 14 }],
        conditions: {
          long: [{ indicator: 'RSI', operator: '<', value: 30 }],
          short: [],
        },
      },
    });
    await service.save({
      ownerId: 'user-1',
      name: 'B',
      source: 'USER_PROMPT',
      sourceInput: 'y',
      params: VALID_PARAMS,
    });

    expect(repository.created[0]!.versionTag).toBe(
      repository.created[1]!.versionTag,
    );
  });

  it('lists recent entries scoped to the given owner', async () => {
    const repository = new FakeStrategyLibraryRepository();
    const service = new StrategyLibraryService({ repository });
    await service.save({
      ownerId: 'user-1',
      name: 'A',
      source: 'USER_PROMPT',
      sourceInput: 'x',
      params: VALID_PARAMS,
    });
    await service.save({
      ownerId: 'user-2',
      name: 'B',
      source: 'WEB_IMPORT',
      sourceInput: 'https://example.com',
      params: VALID_PARAMS,
    });

    const result = await service.listRecent('user-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('A');
  });
});
