import type { Pair, Timeframe } from '@crypto-strategy-lab/shared';
import { describe, expect, it } from 'vitest';

import { buildSearchSpace } from '@/api/features/search/services/searchSpaceBuilder';

const options = {
  endTime: 1_756_000_000_000,
  pair: 'BTCUSDT' as Pair,
  startTime: 1_755_000_000_000,
  timeframe: '1h' as Timeframe,
};

describe('search space builder', () => {
  it('excludes live-only strategies from the default historical search space', () => {
    const searchSpace = buildSearchSpace(options);

    expect(searchSpace.enabledStrategies.map(({ id }) => id)).not.toContain(
      'news-sentiment',
    );
  });

  it('rejects an explicitly configured live-only strategy before a run can start', () => {
    expect(() =>
      buildSearchSpace({
        ...options,
        enabledStrategyIds: ['news-sentiment'],
      }),
    ).toThrow(/live-only strategies cannot be used/i);
  });
});
