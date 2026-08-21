import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConnectionStatusCard } from '../../../../src/features/realtime/components/ConnectionStatusCard';

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
});
