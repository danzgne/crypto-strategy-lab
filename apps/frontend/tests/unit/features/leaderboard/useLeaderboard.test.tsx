import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  LeaderboardResponse,
  LeaderboardSnapshot,
} from '@crypto-strategy-lab/shared';
import type { AppSocket } from '../../../../src/shared/realtime/socketClient';
import {
  useLeaderboard,
  type LeaderboardClient,
} from '../../../../src/features/leaderboard';

describe('useLeaderboard', () => {
  it('loads the private board and applies a realtime full snapshot', async () => {
    const listeners = new Map<string, (...arguments_: unknown[]) => void>();
    const socket = {
      connected: false,
      connect: vi.fn(() => socket),
      off: vi.fn((event: string) => {
        listeners.delete(event);
        return socket;
      }),
      on: vi.fn(
        (event: string, listener: (...arguments_: unknown[]) => void) => {
          listeners.set(event, listener);
          return socket;
        },
      ),
    } as unknown as AppSocket;
    const initial: LeaderboardResponse = {
      entries: [],
      k: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const client: LeaderboardClient = {
      get: vi.fn().mockResolvedValue(initial),
    };
    const { result } = renderHook(() =>
      useLeaderboard({ client, socketFactory: () => socket }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.get).toHaveBeenCalledOnce();

    const update = snapshot();
    act(() => listeners.get('leaderboard:updated')?.(update));
    await waitFor(() =>
      expect(result.current.entries[0]?.experimentId).toBe('experiment-1'),
    );
    expect(result.current.updatedAt).toBe(update.updatedAt);
  });
});

function snapshot(): LeaderboardSnapshot {
  return {
    entries: [
      {
        endTime: 2,
        experimentId: 'experiment-1',
        maxDrawdown: '0.1',
        memberStrategies: [{ label: 'MA', strategyId: 'ma' }],
        pair: 'BTCUSDT',
        rank: 1,
        return: '0.2',
        score: '0.8',
        startTime: 1,
        strategyDisplayName: 'MA',
        strategyVersionId: 'version-1',
        timeframe: '1m',
        totalProfit: '100',
        totalTrades: 1,
        winRate: '1',
      },
    ],
    k: 10,
    updatedAt: '2026-01-01T00:00:01.000Z',
    userId: 'user-1',
  };
}
