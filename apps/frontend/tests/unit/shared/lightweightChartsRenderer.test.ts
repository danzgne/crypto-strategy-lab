import { beforeEach, describe, expect, it, vi } from 'vitest';

const lightweightChartMocks = vi.hoisted(() => {
  const timeScale = {
    fitContent: vi.fn(),
    subscribeVisibleLogicalRangeChange: vi.fn(),
    unsubscribeVisibleLogicalRangeChange: vi.fn(),
  };
  const chart = {
    addSeries: vi.fn(() => ({
      priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
      setData: vi.fn(),
    })),
    applyOptions: vi.fn(),
    panes: vi.fn(() => [{}, { setHeight: vi.fn() }, { setHeight: vi.fn() }]),
    remove: vi.fn(),
    removeSeries: vi.fn(),
    timeScale: vi.fn(() => timeScale),
  };

  return { chart, timeScale };
});

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: 'candlestick',
  ColorType: { Solid: 'solid' },
  HistogramSeries: 'histogram',
  LineSeries: 'line',
  createChart: vi.fn(() => lightweightChartMocks.chart),
  createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn() })),
}));

import { lightweightChartsRenderer } from '../../../src/shared/charting/lightweightChartsRenderer';

describe('lightweightChartsRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the left history boundary after the initial fit and unsubscribes on destroy', () => {
    const onReachedHistoryBoundary = vi.fn();
    const instance = lightweightChartsRenderer.mount(
      document.createElement('div'),
      {
        height: 320,
        onReachedHistoryBoundary,
      },
    );

    instance.setData({
      candles: [
        {
          close: 101,
          high: 102,
          low: 99,
          open: 100,
          time: 1_756_000_000,
        },
      ],
      lines: [],
      markers: [],
      volume: [],
    });

    expect(lightweightChartMocks.timeScale.fitContent).toHaveBeenCalledOnce();
    expect(
      lightweightChartMocks.timeScale.subscribeVisibleLogicalRangeChange,
    ).toHaveBeenCalledOnce();
    expect(onReachedHistoryBoundary).not.toHaveBeenCalled();

    const handler = lightweightChartMocks.timeScale
      .subscribeVisibleLogicalRangeChange.mock.calls[0]?.[0] as
      ((range: { from: number; to: number } | null) => void) | undefined;
    handler?.({ from: 5, to: 50 });
    handler?.({ from: 20, to: 65 });

    expect(onReachedHistoryBoundary).toHaveBeenCalledOnce();

    instance.destroy();
    expect(
      lightweightChartMocks.timeScale.unsubscribeVisibleLogicalRangeChange,
    ).toHaveBeenCalledWith(handler);
  });

  it('renders RSI lines in their own oscillator pane', () => {
    const instance = lightweightChartsRenderer.mount(
      document.createElement('div'),
      { height: 320 },
    );

    instance.setData({
      candles: [],
      lines: [
        {
          color: '#818cf8',
          id: 'RSI',
          pane: 2,
          points: [{ time: 1_756_000_000, value: 42 }],
        },
      ],
      markers: [],
      volume: [],
    });

    expect(lightweightChartMocks.chart.addSeries).toHaveBeenCalledWith(
      'line',
      expect.objectContaining({ title: 'RSI' }),
      2,
    );
    expect(lightweightChartMocks.chart.panes).toHaveBeenCalled();

    instance.destroy();
  });
});
