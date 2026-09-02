import { describe, expect, it, vi } from 'vitest';

import { PrismaNewsRepository } from '@/api/features/news/repositories/prismaNewsRepository';
import type { AppPrismaClient } from '@/database/prismaClient';

describe('PrismaNewsRepository', () => {
  it('selects the newest unscored items first', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaNewsRepository({
      newsItem: { findMany },
    } as unknown as AppPrismaClient);

    await repository.findUnscoredNewsItems(10);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        sentimentLabel: null,
        sentimentScore: null,
        eventType: null,
      },
      orderBy: { publishedAt: 'desc' },
      take: 10,
    });
  });
});
