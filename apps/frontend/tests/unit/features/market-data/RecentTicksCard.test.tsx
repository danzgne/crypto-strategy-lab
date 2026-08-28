import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RecentTicksCard } from '../../../../src/features/market-data/components/RecentTicksCard';

describe('RecentTicksCard', () => {
  it('renders newest trade prices, quantities, and taker sides', () => {
    render(
      <RecentTicksCard
        loading={false}
        pair="BTCUSDT"
        ticks={[
          {
            pair: 'BTCUSDT',
            tradeId: '2',
            time: Date.UTC(2026, 7, 28, 10, 45, 38, 123),
            price: 81_049.99,
            quantity: 0.012,
            side: 'BUY',
          },
          {
            pair: 'BTCUSDT',
            tradeId: '1',
            time: Date.UTC(2026, 7, 28, 10, 45, 38, 100),
            price: 81_049.97,
            quantity: 0.005,
            side: 'SELL',
          },
        ]}
      />,
    );

    expect(screen.getByTestId('recent-ticks-card')).toHaveAccessibleName(
      'Recent ticks for BTCUSDT',
    );
    expect(screen.getByText('81,049.99')).toBeInTheDocument();
    expect(screen.getByText('0.012')).toBeInTheDocument();
    expect(screen.getByText('Buy')).toBeInTheDocument();
    expect(screen.getByText('Sell')).toBeInTheDocument();
    expect(screen.getByText('2 shown')).toBeInTheDocument();
  });

  it('explains when the bounded tick window has no data yet', () => {
    render(<RecentTicksCard loading pair="ETHUSDT" ticks={[]} />);

    expect(
      screen.getByText('Waiting for recent trade events'),
    ).toBeInTheDocument();
    expect(screen.getByText('Syncing')).toBeInTheDocument();
  });
});
