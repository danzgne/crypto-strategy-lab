import '@crypto-strategy-lab/strategy-engine/strategies';

import { describe, expect, it } from 'vitest';

import {
  StrategyLibraryService,
  StrategyLibraryValidationError,
} from '@/api/features/strategies/services/strategyLibraryService';
import type {
  AddLibraryVersionResult,
  CreateLibraryEntryInput,
  LibraryEntryDetailRow,
  LibraryVersionForOwner,
  ListLibraryEntriesOptions,
  ListLibraryEntriesResult,
  StrategyLibraryRepository,
  UpdateLibraryEntryMetadataInput,
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
  public created: CreateLibraryEntryInput[] = [];

  private entries: LibraryEntryDetailRow[] = [];

  private sequence = 0;

  public async create(
    input: CreateLibraryEntryInput,
  ): Promise<LibraryEntryDetailRow> {
    this.created.push(input);
    this.sequence += 1;
    const version = {
      id: `version-${this.sequence}`,
      params: input.params,
      versionTag: input.versionTag,
      libraryVersion: input.libraryVersion,
      createdAt: new Date(),
    };
    const entry: LibraryEntryDetailRow = {
      id: `entry-${this.sequence}`,
      ownerId: input.ownerId,
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      source: input.source,
      sourceInput: input.sourceInput ?? null,
      tags: [...input.tags],
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      latestVersion: version,
      versions: [version],
    };
    this.entries.push(entry);
    return entry;
  }

  public async listEntries(
    ownerId: string,
    options: ListLibraryEntriesOptions,
  ): Promise<ListLibraryEntriesResult> {
    const owned = this.entries.filter((entry) => entry.ownerId === ownerId);
    const entries = owned.slice(options.offset, options.offset + options.limit);
    return { entries, total: owned.length };
  }

  public async getEntry(
    ownerId: string,
    entryId: string,
  ): Promise<LibraryEntryDetailRow | null> {
    return (
      this.entries.find(
        (entry) => entry.id === entryId && entry.ownerId === ownerId,
      ) ?? null
    );
  }

  public async addVersion(
    ownerId: string,
    entryId: string,
    input: {
      params: unknown;
      versionTag: string;
      libraryVersion: string;
    },
  ): Promise<AddLibraryVersionResult | null> {
    const entry = this.entries.find(
      (candidate) => candidate.id === entryId && candidate.ownerId === ownerId,
    );
    if (entry === undefined) return null;
    if (
      entry.versions.some(
        (version) => version.libraryVersion === input.libraryVersion,
      )
    ) {
      return { outcome: 'DUPLICATE_LIBRARY_VERSION' };
    }
    const version = {
      id: `version-${entry.versions.length + 1}-${entry.id}`,
      params: input.params,
      versionTag: input.versionTag,
      libraryVersion: input.libraryVersion,
      createdAt: new Date(),
    };
    entry.versions.push(version);
    entry.latestVersion = version;
    return { outcome: 'CREATED', entry };
  }

  public async updateMetadata(
    ownerId: string,
    entryId: string,
    input: UpdateLibraryEntryMetadataInput,
  ): Promise<LibraryEntryDetailRow | null> {
    const entry = this.entries.find(
      (candidate) => candidate.id === entryId && candidate.ownerId === ownerId,
    );
    if (entry === undefined) return null;
    if (input.name !== undefined) entry.name = input.name;
    if (input.description !== undefined) entry.description = input.description;
    if (input.tags !== undefined) entry.tags = [...input.tags];
    return entry;
  }

  public async setArchived(
    ownerId: string,
    entryId: string,
    archived: boolean,
  ): Promise<LibraryEntryDetailRow | null> {
    const entry = this.entries.find(
      (candidate) => candidate.id === entryId && candidate.ownerId === ownerId,
    );
    if (entry === undefined) return null;
    entry.archivedAt = archived ? new Date() : null;
    return entry;
  }

  public async findVersionForOwner(): Promise<LibraryVersionForOwner | null> {
    return null;
  }
}

function createService(repository = new FakeStrategyLibraryRepository()) {
  return { repository, service: new StrategyLibraryService({ repository }) };
}

describe('StrategyLibraryService', () => {
  it('creates a singular entry and computes its version tag from resolved params', async () => {
    const { repository, service } = createService();

    const entry = await service.create('user-1', {
      name: 'RSI_LONG',
      tags: ['rsi'],
      source: 'USER_PROMPT',
      sourceInput: 'Long when RSI under 30',
      strategyId: 'rule',
      params: VALID_PARAMS,
    });

    expect(repository.created).toHaveLength(1);
    expect(entry.type).toBe('rule');
    expect(entry.latestVersion.versionTag).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.latestVersion.libraryVersion).toBe('1.0.0');
  });

  it('uses a client-supplied libraryVersion when given', async () => {
    const { repository, service } = createService();

    await service.create('user-1', {
      name: 'RSI_LONG',
      source: 'USER_PROMPT',
      sourceInput: 'Long when RSI under 30',
      strategyId: 'rule',
      params: VALID_PARAMS,
      libraryVersion: '2.3.1',
    });

    expect(repository.created[0]!.libraryVersion).toBe('2.3.1');
  });

  it('rejects a libraryVersion that is not semver-shaped', async () => {
    const { service } = createService();

    await expect(
      service.create('user-1', {
        name: 'RSI_LONG',
        source: 'USER_PROMPT',
        sourceInput: 'x',
        strategyId: 'rule',
        params: VALID_PARAMS,
        libraryVersion: 'not-a-version',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_LIBRARY_VERSION' });
  });

  it('rejects params the RuleStrategy constructor rejects', async () => {
    const { repository, service } = createService();

    await expect(
      service.create('user-1', {
        name: 'BROKEN',
        source: 'USER_PROMPT',
        sourceInput: 'anything',
        strategyId: 'rule',
        params: { indicators: [], conditions: { long: [], short: [] } },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STRATEGY' });
    expect(repository.created).toHaveLength(0);
  });

  it('rejects USER_PROMPT/WEB_IMPORT provenance without sourceInput', async () => {
    const { service } = createService();

    await expect(
      service.create('user-1', {
        name: 'RSI_LONG',
        source: 'USER_PROMPT',
        strategyId: 'rule',
        params: VALID_PARAMS,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PROVENANCE' });
  });

  it('drops sourceInput for MANUAL provenance', async () => {
    const { repository, service } = createService();

    await service.create('user-1', {
      name: 'Forked MA',
      source: 'MANUAL',
      sourceInput: 'ignored',
      strategyId: 'ma',
      params: { fast: 10 },
    });

    expect(repository.created[0]!.sourceInput).toBeUndefined();
  });

  it('computes the same version tag for two structurally-equal params', async () => {
    const { repository, service } = createService();

    await service.create('user-1', {
      name: 'A',
      source: 'USER_PROMPT',
      sourceInput: 'x',
      strategyId: 'rule',
      params: {
        timeframe: '1h',
        indicators: [{ name: 'RSI', period: 14 }],
        conditions: {
          long: [{ indicator: 'RSI', operator: '<', value: 30 }],
          short: [],
        },
      },
    });
    await service.create('user-1', {
      name: 'B',
      source: 'USER_PROMPT',
      sourceInput: 'y',
      strategyId: 'rule',
      params: VALID_PARAMS,
    });

    expect(repository.created[0]!.versionTag).toBe(
      repository.created[1]!.versionTag,
    );
  });

  it('assembles and persists normalized composite members', async () => {
    const { repository, service } = createService();

    const entry = await service.create('user-1', {
      name: 'Momentum pair',
      source: 'MANUAL',
      strategyId: 'composite',
      composite: {
        members: [
          { params: { fast: 10 }, strategyId: 'ma', weight: 2 },
          { params: { period: 14 }, strategyId: 'rsi', weight: 1 },
        ],
        mode: 'weighted',
        threshold: 0.3,
      },
    });

    expect(entry.type).toBe('composite');
    expect(repository.created[0]!.params).toEqual({
      members: [
        { strategyId: 'ma', params: { fast: 10, slow: 50 }, weight: 2 / 3 },
        {
          strategyId: 'rsi',
          params: { overbought: 70, oversold: 30, period: 14 },
          weight: 1 / 3,
        },
      ],
      mode: 'weighted',
      threshold: 0.3,
    });
  });

  it('rejects invalid names before writing a definition', async () => {
    const { repository, service } = createService();

    await expect(
      service.create('user-1', {
        name: '   ',
        source: 'MANUAL',
        strategyId: 'ma',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_NAME' });
    expect(repository.created).toHaveLength(0);
  });

  it('validates without persisting anything', () => {
    const { repository, service } = createService();

    const result = service.validate(VALID_PARAMS);

    expect(result).toEqual({ valid: true });
    expect(repository.created).toHaveLength(0);
  });

  it('reports the constructor rejection message on invalid params', () => {
    const { service } = createService();

    const result = service.validate({
      indicators: [],
      conditions: { long: [], short: [] },
    });

    expect(result.valid).toBe(false);
    if (result.valid) throw new Error('expected invalid');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('lists entries scoped to the given owner, plus registry builtins', async () => {
    const { service } = createService();
    await service.create('user-1', {
      name: 'A',
      source: 'USER_PROMPT',
      sourceInput: 'x',
      strategyId: 'ma',
      params: { fast: 10 },
    });
    await service.create('user-2', {
      name: 'B',
      source: 'WEB_IMPORT',
      sourceInput: 'https://example.com',
      strategyId: 'ma',
      params: { fast: 10 },
    });

    const result = await service.list('user-1');

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.name).toBe('A');
    expect(result.builtins.some((builtin) => builtin.strategyId === 'ma')).toBe(
      true,
    );
    expect(
      result.builtins.some((builtin) => builtin.strategyId === 'rule'),
    ).toBe(false);
  });

  it('appends a version on addVersion and mints a new immutable Strategy Version', async () => {
    const { service } = createService();
    const created = await service.create('user-1', {
      name: 'MA',
      source: 'MANUAL',
      strategyId: 'ma',
      params: { fast: 10, slow: 50 },
    });

    const result = await service.addVersion('user-1', created.id, {
      libraryVersion: '1.1.0',
      params: { fast: 5, slow: 50 },
    });

    expect(result).not.toBeNull();
    if (result === null || result.outcome !== 'CREATED') {
      throw new Error('expected CREATED');
    }
    expect(result.entry.versions).toHaveLength(2);
    expect(result.entry.latestVersion.libraryVersion).toBe('1.1.0');
  });

  it('rejects a duplicate Library Version within the same entry', async () => {
    const { service } = createService();
    const created = await service.create('user-1', {
      name: 'MA',
      source: 'MANUAL',
      strategyId: 'ma',
      params: { fast: 10, slow: 50 },
      libraryVersion: '1.0.0',
    });

    const result = await service.addVersion('user-1', created.id, {
      libraryVersion: '1.0.0',
      params: { fast: 5, slow: 50 },
    });

    expect(result).toEqual({ outcome: 'DUPLICATE_LIBRARY_VERSION' });
  });

  it('returns null from addVersion for another owner entry', async () => {
    const { service } = createService();
    const created = await service.create('user-1', {
      name: 'MA',
      source: 'MANUAL',
      strategyId: 'ma',
      params: { fast: 10 },
    });

    const result = await service.addVersion('user-2', created.id, {
      libraryVersion: '1.1.0',
      params: { fast: 5 },
    });

    expect(result).toBeNull();
  });

  it('surfaces StrategyLibraryValidationError as a real Error subclass', async () => {
    const { service } = createService();

    try {
      await service.create('user-1', {
        name: '',
        source: 'MANUAL',
        strategyId: 'ma',
      });
      throw new Error('expected create to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StrategyLibraryValidationError);
    }
  });
});
