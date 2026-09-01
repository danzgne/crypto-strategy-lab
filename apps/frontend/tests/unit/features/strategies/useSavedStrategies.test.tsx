import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SavedStrategy } from '@crypto-strategy-lab/shared';
import type { StrategyLibraryClient } from '../../../../src/features/strategies';
import { useSavedStrategies } from '../../../../src/features/strategies';

const savedStrategy: SavedStrategy = {
  createdAt: '2026-08-30T00:00:00.000Z',
  description: null,
  id: 'saved-id',
  kind: 'singular',
  name: 'Saved MA',
  params: { fast: 10, slow: 30 },
  strategyId: 'ma',
  versionId: 'version-id',
};

describe('useSavedStrategies', () => {
  it('loads saved strategies and prepends newly saved versions', async () => {
    const secondStrategy = {
      ...savedStrategy,
      id: 'second-id',
      name: 'Saved RSI',
    };
    const client: StrategyLibraryClient = {
      list: vi.fn().mockResolvedValue([savedStrategy]),
      save: vi.fn().mockResolvedValue(secondStrategy),
    };
    const { result } = renderHook(() => useSavedStrategies({ client }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.strategies).toEqual([savedStrategy]);

    await result.current.save({ name: 'Saved RSI', strategyId: 'rsi' });

    await waitFor(() =>
      expect(result.current.strategies).toEqual([
        secondStrategy,
        savedStrategy,
      ]),
    );
    expect(result.current.error).toBeNull();
  });
});
