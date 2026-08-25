import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  FinancialChartData,
  FinancialChartInstance,
  FinancialChartRenderer,
  FinancialChartRendererOptions,
} from '../../../../src/shared/charting';
import { CandlestickChart } from '../../../../src/features/market-data/components/CandlestickChart';

describe('CandlestickChart', () => {
  it('renders through the renderer seam and preserves forming-candle state', () => {
    const chart = createTestRenderer();
    const { rerender } = render(
      <CandlestickChart
        candles={[]}
        pair="BTCUSDT"
        renderer={chart.renderer}
        timeframe="1m"
      />,
    );

    expect(screen.getByTestId('candlestick-chart-empty')).toBeInTheDocument();
    rerender(
      <CandlestickChart
        candles={[
          createCandle({
            close: 100.5,
            high: 101,
            low: 99,
            open: 100,
            openTime: 1_756_000_000_000,
          }),
          createCandle({
            close: 101.5,
            high: 102,
            isClosed: false,
            low: 100,
            open: 100.5,
            openTime: 1_756_000_060_000,
          }),
        ]}
        pair="BTCUSDT"
        renderer={chart.renderer}
        timeframe="1m"
      />,
    );

    const chartElement = screen.getByTestId('candlestick-chart');
    expect(chartElement).toHaveAttribute('data-candle-count', '2');
    expect(chartElement).toHaveAttribute('data-forming', 'true');
    expect(
      screen.getByRole('img', { name: 'BTCUSDT 1m live candlestick chart' }),
    ).toBeInTheDocument();
    expect(chart.latestData?.candles.at(-1)?.isClosed).toBe(false);
    expect(chart.mount).toHaveBeenCalledWith(chartElement, { height: 320 });
  });

  it('maps strategy indicators, volume, and BUY/SELL markers to renderer data', () => {
    const chart = createTestRenderer();
    const candle = createCandle({
      close: 101,
      high: 102,
      low: 99,
      open: 100,
      openTime: 1_756_000_000_000,
    });

    render(
      <CandlestickChart
        candles={[candle]}
        pair="BTCUSDT"
        renderer={chart.renderer}
        strategySignals={[
          {
            pair: 'BTCUSDT',
            timeframe: '1m',
            candle,
            indicators: { MA_20: 100.5, MA_50: 100.25 },
            signal: {
              action: 'BUY',
              indicators: { MA_20: 100.5, MA_50: 100.25 },
            },
          },
        ]}
        timeframe="1m"
      />,
    );

    expect(chart.latestData?.lines.map((line) => line.id)).toEqual([
      'MA_20',
      'MA_50',
    ]);
    expect(chart.latestData?.volume).toHaveLength(1);
    expect(chart.latestData?.markers).toEqual([
      {
        color: '#22c55e',
        position: 'belowBar',
        shape: 'arrowUp',
        text: 'BUY',
        time: 1_756_000_000,
      },
    ]);
  });

  it('updates the renderer without coupling chart data changes to a remount', () => {
    const chart = createTestRenderer();
    const initialCandle = createCandle({ openTime: 1_756_000_000_000 });
    const { rerender, unmount } = render(
      <CandlestickChart
        candles={[initialCandle]}
        pair="BTCUSDT"
        renderer={chart.renderer}
        timeframe="1m"
      />,
    );

    rerender(
      <CandlestickChart
        candles={[initialCandle, createCandle({ openTime: 1_756_000_060_000 })]}
        pair="BTCUSDT"
        renderer={chart.renderer}
        timeframe="1m"
      />,
    );

    expect(chart.mount).toHaveBeenCalledTimes(1);
    expect(chart.setData).toHaveBeenCalledTimes(2);
    unmount();
    expect(chart.destroy).toHaveBeenCalledTimes(1);
  });
});

function createTestRenderer(): {
  destroy: ReturnType<typeof vi.fn>;
  latestData: FinancialChartData | null;
  mount: ReturnType<typeof vi.fn>;
  renderer: FinancialChartRenderer;
  setData: ReturnType<typeof vi.fn>;
} {
  let latestData: FinancialChartData | null = null;
  const setData = vi.fn((data: FinancialChartData) => {
    latestData = data;
  });
  const resize = vi.fn();
  const destroy = vi.fn();
  const instance: FinancialChartInstance = { destroy, resize, setData };
  const mount = vi.fn(
    (_container: HTMLElement, _options: FinancialChartRendererOptions) =>
      instance,
  );

  return {
    destroy,
    get latestData() {
      return latestData;
    },
    mount,
    renderer: { mount },
    setData,
  };
}

function createCandle(
  overrides: Partial<{
    close: number;
    high: number;
    isClosed: boolean;
    low: number;
    open: number;
    openTime: number;
  }> = {},
) {
  return {
    pair: 'BTCUSDT' as const,
    timeframe: '1m' as const,
    openTime: 1_756_000_000_000,
    closeTime: 1_756_000_059_999,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 10,
    isClosed: true,
    ...overrides,
  };
}
