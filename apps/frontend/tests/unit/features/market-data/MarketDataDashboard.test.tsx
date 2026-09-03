import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  MarketSubscriptionResult,
  UseMarketSubscriptionOptions,
} from '../../../../src/features/market-data/hooks/useMarketSubscription';
import type { StrategyLibraryState } from '../../../../src/features/strategies';
import type { RealtimeConnectionState } from '../../../../src/features/market-data/hooks/useRealtimeConnection';
import type { RecentTicksState } from '../../../../src/features/market-data/hooks/useRecentTicks';
import type { StrategySignalState } from '../../../../src/features/market-data/hooks/useStrategySignal';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock(
  '../../../../src/features/market-data/hooks/useMarketSubscription',
  () => ({
    useMarketSubscription: ({
      pair,
      timeframe,
    }: UseMarketSubscriptionOptions): MarketSubscriptionResult => ({
      candles: [],
      phase: 'connecting',
      detail: `Loading ${pair} ${timeframe}`,
      historyLoading: false,
      hasMoreHistory: true,
      requestOlderHistory: vi.fn(),
    }),
  }),
);

vi.mock(
  '../../../../src/features/market-data/hooks/useRealtimeConnection',
  () => ({
    useRealtimeConnection: (): RealtimeConnectionState => ({
      phase: 'live',
      dataSource: 'Configured market adapter',
      latencyMs: 12,
      lastDataAt: '2026-08-24T00:00:00.000Z',
      serverTime: '2026-08-24T00:00:00.000Z',
      detail: 'Round trip verified',
    }),
  }),
);

vi.mock('../../../../src/features/market-data/hooks/useRecentTicks', () => ({
  useRecentTicks: (): RecentTicksState => ({
    ticks: [],
    loading: false,
    detail: 'Recent trade events updating live',
  }),
}));

vi.mock('../../../../src/features/market-data/hooks/useStrategySignal', () => ({
  useStrategySignal: (): StrategySignalState => ({
    latest: null,
    history: [],
    error: null,
  }),
}));

const library: StrategyLibraryState = {
  builtins: [
    { strategyId: 'ma', paramsSchema: { type: 'object', properties: {} } },
  ],
  entries: [
    {
      id: 'saved-ma-id',
      name: 'My trend strategy',
      description: null,
      tags: [],
      kind: 'singular',
      strategyId: 'ma',
      source: 'MANUAL',
      sourceInput: null,
      createdAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:00.000Z',
      archivedAt: null,
      latestVersion: {
        id: 'saved-ma-version',
        versionTag: 'tag',
        libraryVersion: '1.0.0',
        createdAt: '2026-08-30T00:00:00.000Z',
        params: { fast: 10, slow: 30 },
      },
    },
  ],
  total: 1,
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  showArchived: false,
  setShowArchived: vi.fn(),
  loadMore: vi.fn(),
  refresh: vi.fn(),
};

vi.mock('../../../../src/features/strategies', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/features/strategies')
  >('../../../../src/features/strategies');
  return {
    ...actual,
    useStrategyLibrary: (): StrategyLibraryState => library,
  };
});

import { MarketDataDashboard } from '../../../../src/features/market-data/components/MarketDataDashboard';

describe('MarketDataDashboard', () => {
  it('renders four independently switchable timeframe panels behind one global pair selector', () => {
    render(<MarketDataDashboard />);

    const pairSelector = screen.getByRole('combobox', { name: 'Market pair' });
    const timeframeSelectors = screen.getAllByRole('combobox', {
      name: /Timeframe for panel/,
    });
    const strategySelector = screen.getByRole('combobox', {
      name: 'Strategy overlay',
    });

    expect(pairSelector).toHaveValue('BTCUSDT');
    expect(strategySelector).toHaveValue('');
    expect(
      within(strategySelector).getByRole('option', {
        name: 'None (No overlay)',
      }),
    ).toBeInTheDocument();
    expect(
      within(strategySelector).getByRole('option', { name: 'MA' }),
    ).toBeInTheDocument();
    expect(
      within(strategySelector).getByRole('option', {
        name: 'Saved · My trend strategy',
      }),
    ).toBeInTheDocument();
    fireEvent.change(strategySelector, { target: { value: 'builtin:ma' } });
    expect(strategySelector).toHaveValue('builtin:ma');
    expect(timeframeSelectors).toHaveLength(4);
    expect(
      screen.getByRole('region', { name: 'Live market workspace' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('workspace-controls')).toHaveClass(
      'grid',
      'md:grid-cols-2',
    );
    expect(screen.getByTestId('recent-ticks-card')).toBeInTheDocument();
    expect(screen.getByText('Configured market adapter')).toBeInTheDocument();
    expect(screen.queryByText(/API \+ WebSocket/)).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('option', { name: '1d' }).length,
    ).toBeGreaterThan(0);

    const firstTimeframeSelector = timeframeSelectors.at(0);
    if (firstTimeframeSelector === undefined) {
      throw new Error('Expected the first timeframe selector');
    }
    fireEvent.change(firstTimeframeSelector, { target: { value: '4h' } });
    expect(screen.getByText('BTCUSDT · 4h')).toBeInTheDocument();

    fireEvent.change(pairSelector, { target: { value: 'ETHUSDT' } });
    expect(screen.getByText('ETHUSDT · 4h')).toBeInTheDocument();
    expect(screen.getAllByText('ETHUSDT · 5m')).toHaveLength(1);
  });
});
