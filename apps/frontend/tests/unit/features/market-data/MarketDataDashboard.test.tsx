import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  MarketSubscriptionResult,
  UseMarketSubscriptionOptions,
} from '../../../../src/features/market-data/hooks/useMarketSubscription';
import type { RealtimeConnectionState } from '../../../../src/features/market-data/hooks/useRealtimeConnection';
import type { RecentTicksState } from '../../../../src/features/market-data/hooks/useRecentTicks';

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

vi.mock(
  '../../../../src/features/market-data/hooks/useStrategyCatalog',
  () => ({
    useStrategyCatalog: () => ({ strategyIds: ['ma'] }),
  }),
);

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
      screen.getByRole('option', { name: 'None (No overlay)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'MA' })).toBeInTheDocument();

    fireEvent.change(strategySelector, { target: { value: 'ma' } });
    expect(strategySelector).toHaveValue('ma');
    expect(timeframeSelectors).toHaveLength(4);
    expect(screen.getByText('4 live panels')).toBeInTheDocument();
    expect(screen.getByTestId('recent-ticks-card')).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: '1d' }),
    ).not.toBeInTheDocument();

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
