import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppPrismaClient } from '@/database/prismaClient';
import { TradeRetentionService } from '@/api/features/search/services/tradeRetentionService';

describe('TradeRetentionService', () => {
  let fakePrisma: {
    experiment: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    leaderboardEntry: {
      findMany: ReturnType<typeof vi.fn>;
    };
    trade: {
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    fakePrisma = {
      experiment: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      leaderboardEntry: {
        findMany: vi.fn(),
      },
      trade: {
        deleteMany: vi.fn(),
      },
    };
  });

  it('prunes trades only for unpinned, non-leaderboard experiments older than retention window', async () => {
    const service = new TradeRetentionService(
      fakePrisma as unknown as AppPrismaClient,
      7 * 24 * 60 * 60 * 1000,
    );

    // Leaderboard has experiment "exp-on-lb"
    fakePrisma.leaderboardEntry.findMany.mockResolvedValue([
      { experimentId: 'exp-on-lb' },
    ]);

    // Experiments older than 7 days that are unpinned:
    fakePrisma.experiment.findMany.mockResolvedValue([
      { id: 'exp-old-1' },
      { id: 'exp-on-lb' }, // should be filtered out
      { id: 'exp-old-2' },
    ]);

    fakePrisma.trade.deleteMany.mockResolvedValue({ count: 42 });

    const result = await service.pruneTrades({
      now: 1700000000000,
      retentionWindowMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(result.eligibleExperimentsCount).toBe(2);
    expect(result.prunedTradesCount).toBe(42);
    expect(fakePrisma.trade.deleteMany).toHaveBeenCalledWith({
      where: {
        experimentId: { in: ['exp-old-1', 'exp-old-2'] },
      },
    });
  });

  it('does nothing when no eligible experiments match cutoff', async () => {
    const service = new TradeRetentionService(
      fakePrisma as unknown as AppPrismaClient,
    );

    fakePrisma.leaderboardEntry.findMany.mockResolvedValue([]);
    fakePrisma.experiment.findMany.mockResolvedValue([]);

    const result = await service.pruneTrades();

    expect(result.eligibleExperimentsCount).toBe(0);
    expect(result.prunedTradesCount).toBe(0);
    expect(fakePrisma.trade.deleteMany).not.toHaveBeenCalled();
  });

  it('pins and unpins an experiment by owner', async () => {
    const service = new TradeRetentionService(
      fakePrisma as unknown as AppPrismaClient,
    );

    fakePrisma.experiment.findFirst.mockResolvedValue({ id: 'exp-123' });
    fakePrisma.experiment.update.mockResolvedValue({
      id: 'exp-123',
      isPinned: true,
    });

    const success = await service.setExperimentPinned(
      'exp-123',
      'owner-1',
      true,
    );
    expect(success).toBe(true);
    expect(fakePrisma.experiment.update).toHaveBeenCalledWith({
      data: { isPinned: true },
      where: { id: 'exp-123' },
    });

    fakePrisma.experiment.findFirst.mockResolvedValue(null);
    const fail = await service.setExperimentPinned(
      'exp-unknown',
      'owner-1',
      true,
    );
    expect(fail).toBe(false);
  });
});
