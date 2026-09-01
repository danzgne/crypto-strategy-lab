import { renderHook, waitFor } from '@testing-library/react';
import type { BacktestHistoryResponse } from '@crypto-strategy-lab/shared';
import { describe, expect, it, vi } from 'vitest';

import type { BacktestClient } from '../../../../src/features/backtests';
import { useBacktestHistory } from '../../../../src/features/backtests';

describe('useBacktestHistory', () => {
  it('loads history and can refresh it', async () => {
    const firstResponse: BacktestHistoryResponse = [];
    const secondResponse: BacktestHistoryResponse = [
      {
        createdAt: 1_000,
        endTime: 500,
        experimentId: 'experiment-1',
        failureReason: null,
        jobId: 'job-1',
        metrics: null,
        pair: 'BTCUSDT',
        startTime: 0,
        status: 'queued',
        strategyId: 'ma',
        strategyName: 'Moving Average',
        strategyVersionId: 'version-1',
        timeframe: '1m',
      },
    ];
    const list = vi
      .fn<BacktestClient['list']>()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);
    const client: BacktestClient = {
      get: vi.fn(),
      list,
      submit: vi.fn(),
    };

    const { result } = renderHook(() => useBacktestHistory({ client }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);

    await result.current.refresh();

    await waitFor(() => expect(result.current.items).toEqual(secondResponse));
    expect(list).toHaveBeenCalledTimes(2);
  });
});
