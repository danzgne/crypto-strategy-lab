import '@crypto-strategy-lab/strategy-engine/strategies';

import type { SavedStrategy } from '@crypto-strategy-lab/shared';
import { describe, expect, it, vi } from 'vitest';

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

  it('validates without persisting anything', () => {
    const repository = new FakeStrategyLibraryRepository();
    const service = new StrategyLibraryService({ repository });

    const result = service.validate(VALID_PARAMS);

    expect(result).toEqual({ valid: true });
    expect(repository.created).toHaveLength(0);
  });

  it('reports the constructor rejection message on invalid params', () => {
    const repository = new FakeStrategyLibraryRepository();
    const service = new StrategyLibraryService({ repository });

    const result = service.validate({
      indicators: [],
      conditions: { long: [], short: [] },
    });

    expect(result.valid).toBe(false);
    if (result.valid) throw new Error('expected invalid');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('uses the same validator for save and for validate', async () => {
    const repository = new FakeStrategyLibraryRepository();
    const service = new StrategyLibraryService({ repository });
    const brokenParams = {
      indicators: [],
      conditions: { long: [], short: [] },
    };

    const validated = service.validate(brokenParams);
    const saved = await service.save({
      ownerId: 'user-1',
      name: 'BROKEN',
      source: 'USER_PROMPT',
      sourceInput: 'anything',
      params: brokenParams,
    });

    expect(validated.valid).toBe(false);
    expect(saved.outcome).toBe('GENERATION_INVALID');
    if (validated.valid || saved.outcome !== 'GENERATION_INVALID') {
      throw new Error('expected both to fail identically');
    }
    expect(validated.message).toBe(saved.message);
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

const savedStrategy: SavedStrategy = {
  createdAt: '2026-08-30T00:00:00.000Z',
  description: null,
  id: 'definition-id',
  kind: 'singular',
  name: 'Saved strategy',
  params: { fast: 10, slow: 50 },
  strategyId: 'ma',
  versionId: 'version-id',
};

describe('StrategyLibraryService', () => {
  it('persists effective parameters for a named singular version', async () => {
    const repository = createRepository();
    const service = new StrategyLibraryService(repository);

    await service.save('owner-id', {
      name: '  Fast trend  ',
      params: { fast: 10 },
      strategyId: 'ma',
    });

    expect(repository.create).toHaveBeenCalledWith('owner-id', {
      name: 'Fast trend',
      params: { fast: 10, slow: 50 },
      strategyId: 'ma',
    });
  });

  it('assembles and persists normalized composite members', async () => {
    const repository = createRepository();
    const service = new StrategyLibraryService(repository);

    await service.save('owner-id', {
      composite: {
        members: [
          { params: { fast: 10 }, strategyId: 'ma', weight: 2 },
          { params: { period: 14 }, strategyId: 'rsi', weight: 1 },
        ],
        mode: 'weighted',
        threshold: 0.3,
      },
      name: 'Momentum pair',
      strategyId: 'composite',
    });

    expect(repository.create).toHaveBeenCalledWith('owner-id', {
      composite: {
        members: [
          {
            params: { fast: 10, slow: 50 },
            strategyId: 'ma',
            weight: 2 / 3,
          },
          {
            params: { overbought: 70, oversold: 30, period: 14 },
            strategyId: 'rsi',
            weight: 1 / 3,
          },
        ],
        mode: 'weighted',
        threshold: 0.3,
      },
      name: 'Momentum pair',
      strategyId: 'composite',
    });
  });

  it('rejects invalid names before writing a definition', async () => {
    const repository = createRepository();
    const service = new StrategyLibraryService(repository);

    await expect(
      service.save('owner-id', { name: '   ', strategyId: 'ma' }),
    ).rejects.toMatchObject({
      code: 'INVALID_NAME',
    });
    expect(repository.create).not.toHaveBeenCalled();
  });
});

function createRepository(): StrategyLibraryRepository {
  return {
    create: vi.fn().mockResolvedValue(savedStrategy),
    listByOwner: vi.fn().mockResolvedValue([savedStrategy]),
  };
}
