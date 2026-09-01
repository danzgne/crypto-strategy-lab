import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  MarketSubscriptionResult,
  UseMarketSubscriptionOptions,
} from '../../../../src/features/market-data/hooks/useMarketSubscription';
import type { SavedStrategiesState } from '../../../../src/features/strategies';
import type { RealtimeConnectionState } from '../../../../src/features/market-data/hooks/useRealtimeConnection';
import type { RecentTicksState } from '../../../../src/features/market-data/hooks/useRecentTicks';
import type { StrategySignalState } from '../../../../src/features/market-data/hooks/useStrategySignal';

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
      dataSource: 'Binance API + WebSocket',
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

vi.mock(
  '../../../../src/features/market-data/hooks/useStrategyCatalog',
  () => ({
    useStrategyCatalog: () => ({
      strategyIds: ['ma', 'rule'],
      strategies: [
        {
          id: 'ma',
          requiresParams: false,
          paramsSchema: { type: 'object', properties: {} },
        },
        {
          id: 'rule',
          requiresParams: true,
          paramsSchema: { type: 'object', properties: {} },
        },
      ],
    }),
  }),
);

vi.mock('../../../../src/features/strategies', () => ({
  useSavedStrategies: (): SavedStrategiesState => ({
    error: null,
    loading: false,
    save: vi.fn(),
    saving: false,
    strategies: [
      {
        createdAt: '2026-08-30T00:00:00.000Z',
        description: null,
        id: 'saved-ma-id',
        kind: 'singular',
        name: 'My trend strategy',
        params: { fast: 10, slow: 30 },
        strategyId: 'ma',
        versionId: 'saved-ma-version',
      },
    ],
  }),
}));

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
    expect(
      screen.queryByRole('checkbox', { name: /Enable .* strategy/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(strategySelector, { target: { value: 'builtin:ma' } });
    expect(strategySelector).toHaveValue('builtin:ma');
    expect(timeframeSelectors).toHaveLength(4);
    expect(screen.queryByText('4 live panels')).not.toBeInTheDocument();
    const workspace = screen.getByRole('region', {
      name: 'Live market workspace',
    });
    expect(within(workspace).getByTestId('workspace-controls')).toHaveClass(
      'grid',
      'sm:grid-cols-2',
    );
    expect(screen.getByTestId('recent-ticks-card')).toBeInTheDocument();
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

  it('offers only strategies that need no authored params, without naming any strategy id', () => {
    render(<MarketDataDashboard />);

    const strategySelector = screen.getByRole('combobox', {
      name: 'Strategy overlay',
    });
    expect(
      within(strategySelector).getByRole('option', { name: 'MA' }),
    ).toBeInTheDocument();
    expect(
      within(strategySelector).queryByRole('option', { name: 'RULE' }),
    ).not.toBeInTheDocument();
  });
});
