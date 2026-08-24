import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CandlestickChart } from '../../../../src/features/market-data/components/CandlestickChart';

describe('CandlestickChart', () => {
  it('renders the forming candle as part of the live chart', () => {
    render(
      <CandlestickChart
        candles={[
          {
            pair: 'BTCUSDT',
            timeframe: '1m',
            openTime: 1_756_000_000_000,
            closeTime: 1_756_000_059_999,
            open: 100,
            high: 101,
            low: 99,
            close: 100.5,
            volume: 10,
            isClosed: true,
          },
          {
            pair: 'BTCUSDT',
            timeframe: '1m',
            openTime: 1_756_000_060_000,
            closeTime: 1_756_000_119_999,
            open: 100.5,
            high: 102,
            low: 100,
            close: 101.5,
            volume: 12,
            isClosed: false,
          },
        ]}
        pair="BTCUSDT"
        timeframe="1m"
      />,
    );

    expect(screen.getByTestId('candlestick-chart')).toHaveAttribute(
      'data-candle-count',
      '2',
    );
    expect(
      screen
        .getByTestId('candlestick-chart')
        .querySelector('[data-forming="true"]'),
    ).not.toBeNull();
    expect(
      screen.getByRole('img', { name: 'BTCUSDT 1m live candlestick chart' }),
    ).toBeInTheDocument();
  });
});
