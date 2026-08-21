import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConnectionStatusCard } from '../../../../src/features/market-data/components/ConnectionStatusCard';

describe('ConnectionStatusCard', () => {
  it('renders the verified live state and measured round-trip latency', () => {
    render(
      <ConnectionStatusCard
        connection={{
          phase: 'live',
          latencyMs: 18,
          serverTime: '2026-08-21T10:00:00.000Z',
          detail: 'Round trip verified',
        }}
      />,
    );

    expect(screen.getByTestId('connection-indicator')).toHaveTextContent(
      'Transport live',
    );
    expect(screen.getByText('18 ms')).toBeInTheDocument();
    expect(screen.getByText('Socket.IO')).toBeInTheDocument();
  });

  it('renders disconnects as an active reconnection state', () => {
    render(
      <ConnectionStatusCard
        connection={{
          phase: 'reconnecting',
          latencyMs: null,
          serverTime: null,
          detail: 'Realtime transport disconnected; reconnecting',
        }}
      />,
    );

    expect(screen.getByTestId('connection-indicator')).toHaveTextContent(
      'Transport reconnecting',
    );
  });
});
