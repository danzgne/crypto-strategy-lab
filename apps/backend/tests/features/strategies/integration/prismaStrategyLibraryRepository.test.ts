import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient } from '@/database/prismaClient';
import { PrismaAuthRepository, PasswordAuthService } from '@/api/features/auth';
import { PrismaStrategyLibraryRepository } from '@/api/features/strategies/repositories/prismaStrategyLibraryRepository';
import { PrismaClient } from '../../../../../../generated/prisma/client';

describe('PrismaStrategyLibraryRepository', () => {
  let prisma: PrismaClient;
  let repository: PrismaStrategyLibraryRepository;
  let ownerId: string;
  let otherOwnerId: string;

  beforeAll(async () => {
    prisma = createPrismaClient(
      process.env.DATABASE_URL ||
        'postgresql://crypto_lab:crypto_lab@localhost:5434/crypto_strategy_lab?schema=public',
    );
    await prisma.$connect();
    await cleanup(prisma);

    const authService = new PasswordAuthService(
      new PrismaAuthRepository(prisma),
    );
    const owner = await authService.register(
      'strategy-repo-owner@test.com',
      'ownerpass123',
    );
    const otherOwner = await authService.register(
      'strategy-repo-other@test.com',
      'otherpass123',
    );
    ownerId = owner.id;
    otherOwnerId = otherOwner.id;
    repository = new PrismaStrategyLibraryRepository(prisma);
  });

  afterAll(async () => {
    await cleanup(prisma);
    await prisma.$disconnect();
  });

  function uniqueCanonicalIdentity(name: string): string {
    return `ma:${name}:${Date.now()}:${Math.random()}`;
  }

  async function createEntry(
    name = 'MA repo test',
    canonicalIdentity = uniqueCanonicalIdentity(name),
  ) {
    return repository.create({
      ownerId,
      name,
      tags: [],
      type: 'ma',
      source: 'MANUAL',
      params: { fast: 20, slow: 50 },
      canonicalIdentity,
      versionTag: 'tag-1',
      libraryVersion: '1.0.0',
    });
  }

  it('lists entries scoped to the owner, excluding another owner and archived rows', async () => {
    const entry = await createEntry('Listed entry');
    const otherEntry = await repository.create({
      ownerId: otherOwnerId,
      name: 'Other owner entry',
      tags: [],
      type: 'ma',
      source: 'MANUAL',
      params: { fast: 20, slow: 50 },
      canonicalIdentity: `ma:other:${Date.now()}`,
      versionTag: 'tag-1',
      libraryVersion: '1.0.0',
    });

    const result = await repository.listEntries(ownerId, {
      limit: 50,
      offset: 0,
      includeArchived: false,
    });

    expect(result.entries.some((row) => row.id === entry.id)).toBe(true);
    expect(result.entries.some((row) => row.id === otherEntry.id)).toBe(false);

    await repository.setArchived(ownerId, entry.id, true);
    const withoutArchived = await repository.listEntries(ownerId, {
      limit: 50,
      offset: 0,
      includeArchived: false,
    });
    expect(withoutArchived.entries.some((row) => row.id === entry.id)).toBe(
      false,
    );
    const withArchived = await repository.listEntries(ownerId, {
      limit: 50,
      offset: 0,
      includeArchived: true,
    });
    expect(withArchived.entries.some((row) => row.id === entry.id)).toBe(true);
  });

  it('returns null from getEntry, updateMetadata, setArchived, and addVersion for another owner', async () => {
    const entry = await createEntry('Owner-only entry');

    await expect(
      repository.getEntry(otherOwnerId, entry.id),
    ).resolves.toBeNull();
    await expect(
      repository.updateMetadata(otherOwnerId, entry.id, { name: 'Hijacked' }),
    ).resolves.toBeNull();
    await expect(
      repository.setArchived(otherOwnerId, entry.id, true),
    ).resolves.toBeNull();
    await expect(
      repository.addVersion(otherOwnerId, entry.id, {
        params: { fast: 1, slow: 2 },
        versionTag: 'tag-hijack',
        libraryVersion: '9.9.9',
      }),
    ).resolves.toBeNull();

    const stillOriginal = await repository.getEntry(ownerId, entry.id);
    expect(stillOriginal?.name).toBe('Owner-only entry');
  });

  it('creates a new version even when the params are unchanged, without touching the earlier one', async () => {
    const entry = await createEntry('Label-only-change entry');

    const result = await repository.addVersion(ownerId, entry.id, {
      params: entry.latestVersion.params,
      versionTag: entry.latestVersion.versionTag,
      libraryVersion: '1.0.1',
    });

    expect(result?.outcome).toBe('CREATED');
    if (result?.outcome !== 'CREATED') throw new Error('expected CREATED');
    expect(result.entry.versions).toHaveLength(2);
    expect(result.entry.latestVersion.id).not.toBe(entry.latestVersion.id);
    expect(result.entry.latestVersion.libraryVersion).toBe('1.0.1');
    const original = result.entry.versions.find(
      (version) => version.id === entry.latestVersion.id,
    );
    expect(original?.libraryVersion).toBe(entry.latestVersion.libraryVersion);
  });

  it('tracks the most recently saved version as latest, even across saves with matching params', async () => {
    const entry = await createEntry('Chronology entry');

    const second = await repository.addVersion(ownerId, entry.id, {
      params: { fast: 10, slow: 30 },
      versionTag: 'tag-second',
      libraryVersion: '1.1.0',
    });
    if (second?.outcome !== 'CREATED') throw new Error('expected CREATED');

    const third = await repository.addVersion(ownerId, entry.id, {
      params: { fast: 10, slow: 30 },
      versionTag: 'tag-third',
      libraryVersion: '1.2.0',
    });
    if (third?.outcome !== 'CREATED') throw new Error('expected CREATED');

    expect(third.entry.versions).toHaveLength(3);
    expect(third.entry.latestVersion.libraryVersion).toBe('1.2.0');
    expect(third.entry.latestVersion.id).not.toBe(
      second.entry.latestVersion.id,
    );
  });

  it('rejects a Library Version label already used on the entry, even for different params', async () => {
    const entry = await createEntry('Duplicate label entry');
    await repository.addVersion(ownerId, entry.id, {
      params: { fast: 5, slow: 50 },
      versionTag: 'tag-a',
      libraryVersion: '1.1.0',
    });

    const result = await repository.addVersion(ownerId, entry.id, {
      params: { fast: 6, slow: 50 },
      versionTag: 'tag-b',
      libraryVersion: '1.1.0',
    });

    expect(result).toEqual({ outcome: 'DUPLICATE_LIBRARY_VERSION' });
  });

  it('scopes findVersionForOwner to the requesting owner', async () => {
    const entry = await createEntry('Version lookup entry');

    const found = await repository.findVersionForOwner(
      ownerId,
      entry.latestVersion.id,
    );
    expect(found).toMatchObject({
      entryId: entry.id,
      strategyId: 'ma',
    });

    const notFound = await repository.findVersionForOwner(
      otherOwnerId,
      entry.latestVersion.id,
    );
    expect(notFound).toBeNull();
  });
});

async function cleanup(prisma: PrismaClient): Promise<void> {
  const users = await prisma.user.findMany({
    select: { id: true },
    where: {
      email: {
        in: ['strategy-repo-owner@test.com', 'strategy-repo-other@test.com'],
      },
    },
  });
  const ownerIds = users.map(({ id }) => id);
  if (ownerIds.length === 0) return;

  await prisma.experiment.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.strategyVersion.deleteMany({
    where: { ownerId: { in: ownerIds } },
  });
  await prisma.strategyDefinition.deleteMany({
    where: { ownerId: { in: ownerIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
}
