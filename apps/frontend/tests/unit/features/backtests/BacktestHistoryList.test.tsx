import { render, screen } from '@testing-library/react';
import type { BacktestHistoryItem } from '@crypto-strategy-lab/shared';
import { describe, expect, it } from 'vitest';

import { BacktestHistoryList } from '../../../../src/features/backtests/components/BacktestHistoryList';

describe('BacktestHistoryList', () => {
  it('shows completed runs and links each row to its result', () => {
    render(
      <BacktestHistoryList
        error={null}
        items={[completedRun]}
        loading={false}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Backtest history' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Moving Average')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(
      screen.getByText('BTCUSDT · 1m · 2024-01-01 — 2024-06-01'),
    ).toBeInTheDocument();
    expect(screen.getByText('10.00%')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/backtests/experiment-1',
    );
  });

  it('shows a useful empty state when no run exists', () => {
    render(<BacktestHistoryList error={null} items={[]} loading={false} />);

    expect(
      screen.getByText(
        'Chưa có backtest nào. Chạy phiên đầu tiên bằng form ở trên.',
      ),
    ).toBeInTheDocument();
  });
});

const completedRun: BacktestHistoryItem = {
  createdAt: Date.parse('2024-06-02T00:00:00.000Z'),
  endTime: Date.parse('2024-06-01T00:00:00.000Z'),
  experimentId: 'experiment-1',
  failureReason: null,
  jobId: 'job-1',
  metrics: {
    return: '0.1',
    totalProfit: '100',
    totalTrades: 4,
    winRate: '0.5',
  },
  pair: 'BTCUSDT',
  startTime: Date.parse('2024-01-01T00:00:00.000Z'),
  status: 'completed',
  strategyId: 'ma',
  strategyName: 'Moving Average',
  strategyVersionId: 'version-12345678',
  timeframe: '1m',
};
