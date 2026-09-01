import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock(
  '../../../../src/features/market-data/hooks/useStrategyCatalog',
  () => ({
    useStrategyCatalog: () => ({ strategyIds: ['ma'], strategies: [] }),
  }),
);

vi.mock('../../../../src/features/strategies', () => ({
  useSavedStrategies: () => ({
    error: null,
    loading: false,
    save: vi.fn(),
    saving: false,
    strategies: [],
  }),
}));

vi.mock('../../../../src/features/backtests/hooks/useBacktestHistory', () => ({
  useBacktestHistory: () => ({
    error: null,
    items: [],
    loading: false,
    refresh: vi.fn(),
  }),
}));

import { BacktestDashboard } from '../../../../src/features/backtests/components/BacktestDashboard';

describe('BacktestDashboard', () => {
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
});
