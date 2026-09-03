import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { BacktestClient } from '../../../../src/features/backtests';
import { useBacktest } from '../../../../src/features/backtests';
import type { BacktestResultResponse } from '@crypto-strategy-lab/shared';

const queuedResult: BacktestResultResponse = {
  candles: [],
  datasetFingerprint: null,
  endTime: 120_000,
  evaluatorVersion: 'default-v1',
  experimentId: 'experiment-1',
  failureReason: null,
  initialInvestment: '1000',
  jobId: 'job-1',
  metrics: null,
  pair: 'BTCUSDT',
  provenance: {
    buildRevision: 'dev',
    datasetSnapshotFingerprint: null,
    evaluatorVersion: 'default-v1',
    generator: null,
    reproducible: true,
    simulationRulesVersion: 'historical-v1',
    strategyImplementationVersion: 'ma-v1',
    strategyParams: {},
    strategyVersionId: 'version-1',
  },
  simulationRulesVersion: 'historical-v1',
  slippage: '5',
  startTime: 0,
  status: 'queued',
  strategyId: 'ma',
  strategyParams: {},
  strategyVersionId: 'version-1',
  timeframe: '1m',
  trades: [],
  transactionCost: '0.0008',
};

const completedResult: BacktestResultResponse = {
  ...queuedResult,
  metrics: {
    losses: 0,
    maxDrawdown: '0',
    maxDrawdownAmount: '0',
    profitFactor: null,
    profitFactorInfinite: true,
    return: '0.1',
    score: '0.4',
    sharpeRatio: '0',
    totalProfit: '100',
    totalTrades: 1,
    winRate: '1',
    wins: 1,
  },
  status: 'completed',
};

describe('useBacktest', () => {
  it('polls every second until a terminal result and then stops', async () => {
    const get = vi
      .fn<BacktestClient['get']>()
      .mockResolvedValueOnce(queuedResult)
      .mockResolvedValueOnce(completedResult);
    const client: BacktestClient = { get, list: vi.fn(), submit: vi.fn() };
    const { result, unmount } = renderHook(() =>
      useBacktest('experiment-1', { client, pollIntervalMs: 10 }),
    );

    await waitFor(() =>
      expect(result.current.result?.status).toBe('completed'),
    );
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(get).toHaveBeenCalledTimes(2);
  });
});
