import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';

import { FINANCIAL_CHART_COLORS } from './chartRenderer';
import type {
  FinancialChartData,
  FinancialChartLine,
  FinancialChartRenderer,
} from './chartRenderer';

const DEFAULT_HEIGHT = 320;

type ChartLineSeries = ISeriesApi<'Line'>;

interface ChartLineSeriesState {
  pane: number;
  series: ChartLineSeries;
}

export const lightweightChartsRenderer: FinancialChartRenderer = {
  mount(container, options) {
    const chart = createChart(container, {
      width: Math.max(container.clientWidth, 1),
      height: options.height || DEFAULT_HEIGHT,
      layout: {
        attributionLogo: true,
        background: { color: '#ffffff', type: ColorType.Solid },
        textColor: '#334155',
      },
      grid: {
        horzLines: { color: 'rgba(148, 163, 184, 0.32)' },
        vertLines: { color: 'rgba(148, 163, 184, 0.2)' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        secondsVisible: false,
        timeVisible: true,
      },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      borderVisible: false,
      downColor: FINANCIAL_CHART_COLORS.down,
      upColor: FINANCIAL_CHART_COLORS.up,
      wickDownColor: FINANCIAL_CHART_COLORS.wickDown,
      wickUpColor: FINANCIAL_CHART_COLORS.wickUp,
    });
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      {
        lastValueVisible: false,
        priceFormat: { type: 'volume' },
        priceLineVisible: false,
      },
      1,
    );
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { bottom: 0, top: 0.1 },
    });
    chart.panes()[1]?.setHeight(72);

    const markers = createSeriesMarkers(candleSeries, []);
    const lineSeriesById = new Map<string, ChartLineSeriesState>();
    let hasFittedContent = false;

    const setData = (data: FinancialChartData): void => {
      candleSeries.setData(
        data.candles.map((candle) => {
          const baseCandle = {
            close: candle.close,
            high: candle.high,
            low: candle.low,
            open: candle.open,
            time: toUtcTimestamp(candle.time),
          };
          return candle.isClosed === false
            ? {
                ...baseCandle,
                borderColor: FINANCIAL_CHART_COLORS.forming,
                color: FINANCIAL_CHART_COLORS.forming,
                wickColor: FINANCIAL_CHART_COLORS.forming,
              }
            : baseCandle;
        }),
      );
      volumeSeries.setData(
        data.volume.map((bar) => ({
          color: bar.color,
          time: toUtcTimestamp(bar.time),
          value: bar.value,
        })),
      );

      const activeLineIds = new Set(data.lines.map((line) => line.id));
      for (const [lineId, state] of lineSeriesById) {
        if (!activeLineIds.has(lineId)) {
          chart.removeSeries(state.series);
          lineSeriesById.delete(lineId);
        }
      }
      for (const line of data.lines) {
        const series = getOrCreateLineSeries(chart, lineSeriesById, line);
        series.setData(
          line.points.map((point) => ({
            time: toUtcTimestamp(point.time),
            value: point.value,
          })),
        );
      }

      markers.setMarkers(data.markers.map(toSeriesMarker));

      if (!hasFittedContent && data.candles.length > 0) {
        chart.timeScale().fitContent();
        hasFittedContent = true;
      }
    };

    const resize = (): void => {
      chart.applyOptions({ width: Math.max(container.clientWidth, 1) });
    };

    const destroy = (): void => {
      lineSeriesById.clear();
      chart.remove();
    };

    return { destroy, resize, setData };
  },
};

function getOrCreateLineSeries(
  chart: IChartApi,
  lineSeriesById: Map<string, ChartLineSeriesState>,
  line: FinancialChartLine,
): ChartLineSeries {
  const pane = line.pane ?? 0;
  const existing = lineSeriesById.get(line.id);
  if (existing !== undefined && existing.pane === pane) {
    existing.series.applyOptions({ color: line.color });
    return existing.series;
  }
  if (existing !== undefined) {
    chart.removeSeries(existing.series);
  }

  const created = chart.addSeries(
    LineSeries,
    {
      color: line.color,
      lineWidth: 2,
      priceLineVisible: false,
      title: line.id,
    },
    pane,
  );
  lineSeriesById.set(line.id, { pane, series: created });
  return created;
}

function toSeriesMarker(marker: FinancialChartData['markers'][number]) {
  const baseMarker = {
    color: marker.color,
    position: marker.position,
    shape: marker.shape,
    time: toUtcTimestamp(marker.time),
  };
  return marker.text === undefined
    ? baseMarker
    : { ...baseMarker, text: marker.text };
}

function toUtcTimestamp(time: number): UTCTimestamp {
  return Math.floor(time) as UTCTimestamp;
}
