import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConnectionStatusCard } from '../../../../src/features/market-data/components/ConnectionStatusCard';

describe('ConnectionStatusCard', () => {
  it('renders the verified live state and measured round-trip latency', () => {
    render(
      <ConnectionStatusCard
        connection={{
          phase: 'live',
          dataSource: 'Configured market adapter',
          latencyMs: 18,
          lastDataAt: '2026-08-21T10:00:00.000Z',
          serverTime: '2026-08-21T10:00:00.000Z',
          detail: 'Round trip verified',
        }}
      />,
    );

    expect(screen.getByTestId('connection-indicator')).toHaveTextContent(
      'Connected',
    );
    expect(screen.getByText('Configured market adapter')).toBeInTheDocument();
    expect(screen.getByText('18 ms')).toBeInTheDocument();
    expect(screen.getByText('Stable')).toBeInTheDocument();
  });

  it('renders disconnects as an active reconnection state', () => {
    render(
      <ConnectionStatusCard
        connection={{
          phase: 'reconnecting',
          dataSource: 'Market Data Service',
          latencyMs: null,
          lastDataAt: null,
          serverTime: null,
          detail: 'Realtime transport disconnected; reconnecting',
        }}
      />,
    );

    expect(screen.getByTestId('connection-indicator')).toHaveTextContent(
      'Reconnecting',
    );
  });
});
