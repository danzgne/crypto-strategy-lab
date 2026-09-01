import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { LeaderboardState } from '../../../../src/features/leaderboard';

const state: LeaderboardState = {
  entries: [
    {
      endTime: 2,
      experimentId: 'experiment-1',
      maxDrawdown: '0.1',
      memberStrategies: [
        { label: 'MA', strategyId: 'ma' },
        { label: 'RSI', strategyId: 'rsi' },
      ],
      pair: 'BTCUSDT',
      rank: 1,
      return: '0.2',
      score: '0.8',
      startTime: 1,
      strategyDisplayName: 'MA + RSI',
      strategyVersionId: 'version-1',
      timeframe: '1m',
      totalProfit: '2342.18',
      totalTrades: 4,
      winRate: '0.6821',
    },
  ],
  error: null,
  k: 10,
  loading: false,
  refresh: vi.fn().mockResolvedValue(undefined),
  updatedAt: '2026-01-01T00:00:00.000Z',
};

vi.mock('../../../../src/features/leaderboard/hooks/useLeaderboard', () => ({
  useLeaderboard: () => state,
}));

import { LeaderboardPanel } from '../../../../src/features/leaderboard';

describe('LeaderboardPanel', () => {
  it('renders the screenshot columns and links rows to experiment detail', () => {
    render(<LeaderboardPanel />);

    expect(
      screen.getByRole('heading', { name: 'Leaderboard (Top strategies)' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual(['Rank', 'Strategy', 'Profit (USDT)', 'Winrate']);
    expect(screen.getByTestId('leaderboard-entry')).toHaveAttribute(
      'href',
      '/backtests/experiment-1',
    );
    expect(screen.getByTestId('leaderboard-entry')).toHaveTextContent(
      '+2,342.18',
    );
    expect(screen.getByTestId('leaderboard-entry')).toHaveTextContent('68.21%');
    expect(screen.queryByText('Score')).not.toBeInTheDocument();
  });
});
