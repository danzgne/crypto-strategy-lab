import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { historyRefresh } = vi.hoisted(() => ({
  historyRefresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../../../src/features/strategies', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/features/strategies')
  >('../../../../src/features/strategies');
  return {
    ...actual,
    useStrategyLibrary: () => ({
      builtins: [
        { strategyId: 'ma', paramsSchema: { properties: {}, type: 'object' } },
      ],
      entries: [],
      total: 0,
      loading: false,
      loadingMore: false,
      error: null,
      hasMore: false,
      showArchived: false,
      setShowArchived: vi.fn(),
      loadMore: vi.fn(),
      refresh: vi.fn(),
    }),
  };
});

vi.mock('../../../../src/features/backtests/hooks/useBacktestHistory', () => ({
  useBacktestHistory: () => ({
    error: null,
    items: [],
    loading: false,
    refresh: historyRefresh,
  }),
}));

import { BacktestDashboard } from '../../../../src/features/backtests/components/BacktestDashboard';

describe('BacktestDashboard', () => {
  beforeEach(() => {
    historyRefresh.mockClear();
  });

  it('uses a pair combobox with the supported market choices and shows history', () => {
    render(<BacktestDashboard />);

    const pair = screen.getByRole('combobox', { name: 'Pair' });
    expect(pair).toHaveValue('BTCUSDT');
    expect(
      within(pair)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT']);
    expect(
      screen.getByRole('heading', { name: 'Backtest history' }),
    ).toBeInTheDocument();
  });

  it('refreshes history and stays on the dashboard after queuing a backtest', async () => {
    const client = {
      get: vi.fn(),
      list: vi.fn(),
      submit: vi.fn().mockResolvedValue({
        experimentId: 'experiment-1',
        jobId: 'job-1',
        status: 'queued' as const,
      }),
    };

    render(<BacktestDashboard client={client} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run Backtest' }));

    await waitFor(() => expect(client.submit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(historyRefresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Run Backtest' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Backtest queued');
    expect(screen.getByRole('link', { name: 'View progress' })).toHaveAttribute(
      'href',
      '/backtests/experiment-1',
    );
  });
});
