import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { StrategyLibraryState } from '../../../../src/features/strategies';

const library: StrategyLibraryState = {
  builtins: [
    {
      strategyId: 'ma',
      paramsSchema: {
        type: 'object',
        properties: { fast: { type: 'integer', default: 20 } },
      },
    },
    {
      strategyId: 'rsi',
      paramsSchema: {
        type: 'object',
        properties: { period: { type: 'integer', default: 14 } },
      },
    },
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
};

const { create } = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: 'entry-1' }),
}));

vi.mock('../../../../src/features/strategies', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/features/strategies')
  >('../../../../src/features/strategies');
  return {
    ...actual,
    useStrategyLibrary: (): StrategyLibraryState => library,
    strategyLibraryClient: { ...actual.strategyLibraryClient, create },
  };
});

vi.mock('../../../../src/features/leaderboard', () => ({
  LeaderboardPanel: () => <div data-testid="leaderboard-panel" />,
}));

vi.mock('../../../../src/features/search', () => ({
  DiscoveryProgressCard: () => <div data-testid="discovery-progress-card" />,
  DiscoveryRunHistoryTable: () => (
    <div data-testid="discovery-run-history-table" />
  ),
  DiscoverySessionControl: () => (
    <div data-testid="discovery-session-control" />
  ),
  useDiscoverySession: () => ({
    error: null,
    history: [],
    loading: false,
    pauseSession: vi.fn(),
    pinExperiment: vi.fn(),
    progress: null,
    refreshHistory: vi.fn(),
    resumeSession: vi.fn(),
    session: null,
    startSession: vi.fn(),
    stopSession: vi.fn(),
  }),
}));

import { DiscoveryDashboard } from '../../../../src/features/combinations';

describe('DiscoveryDashboard', () => {
  it('defaults to the Auto Discovery tab', () => {
    render(<DiscoveryDashboard />);

    expect(
      screen.getByRole('heading', { name: 'Strategy Workbench' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('discovery-session-control')).toBeInTheDocument();
    expect(screen.getByTestId('discovery-progress-card')).toBeInTheDocument();
  });

  it('lists built-ins read-only under the Library tab', () => {
    render(<DiscoveryDashboard />);

    fireEvent.click(screen.getByRole('tab', { name: 'Library' }));

    expect(
      screen.getByRole('heading', { name: 'Built-in strategies' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('saved-strategies-panel')).toHaveTextContent(
      'My strategies',
    );
    expect(screen.getByRole('link', { name: /New strategy/ })).toHaveAttribute(
      'href',
      '/strategies/new',
    );
  });

  it('lets a composite be assembled and saved under the Manual Build tab', () => {
    render(<DiscoveryDashboard />);

    fireEvent.click(screen.getByRole('tab', { name: 'Manual Build' }));

    expect(
      screen.getByRole('heading', { name: 'Composite Strategy' }),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Add strategy to composite' }),
      { target: { value: 'builtin:ma' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Add strategy to composite' }),
      { target: { value: 'builtin:rsi' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save composite strategy' }),
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Momentum pair' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Momentum pair',
        strategyId: 'composite',
      }),
    );
  });
});
