import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SavedStrategiesState } from '../../../../src/features/strategies';
import type { StrategyCatalog } from '@crypto-strategy-lab/shared';

const catalog: StrategyCatalog = {
  strategyIds: ['ma', 'rsi'],
  strategies: [
    {
      id: 'ma',
      paramsSchema: {
        type: 'object',
        properties: { fast: { type: 'integer', default: 20 } },
      },
    },
    {
      id: 'rsi',
      paramsSchema: {
        type: 'object',
        properties: { period: { type: 'integer', default: 14 } },
      },
    },
  ],
};

vi.mock(
  '../../../../src/features/market-data/hooks/useStrategyCatalog',
  () => ({
    useStrategyCatalog: () => catalog,
  }),
);

const save = vi.fn().mockResolvedValue(null);
vi.mock('../../../../src/features/strategies', () => ({
  useSavedStrategies: (): SavedStrategiesState => ({
    error: null,
    loading: false,
    save,
    saving: false,
    strategies: [],
  }),
}));

vi.mock('../../../../src/features/leaderboard', () => ({
  LeaderboardPanel: () => <div data-testid="leaderboard-panel" />,
}));

import { DiscoveryDashboard } from '../../../../src/features/combinations';

describe('DiscoveryDashboard', () => {
  it('places singular and composite builders in Discovery and exposes saved strategies', () => {
    render(<DiscoveryDashboard />);

    expect(
      screen.getByRole('heading', {
        name: 'Strategy Engine & Loop Discovery',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Singular Strategy' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Composite Strategy' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('saved-strategies-panel')).toHaveTextContent(
      'Saved strategies',
    );

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Add strategy to composite' }),
      { target: { value: 'ma' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Add strategy to composite' }),
      { target: { value: 'rsi' } },
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Composite strategy name' }),
      { target: { value: 'Momentum pair' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save composite strategy' }),
    );

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Momentum pair',
        strategyId: 'composite',
      }),
    );
  });
});
