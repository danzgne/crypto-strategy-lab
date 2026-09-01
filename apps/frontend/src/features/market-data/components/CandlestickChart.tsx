'use client';

import type {
  Candle,
  StrategySignalUpdate,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import { useEffect, useMemo, useRef } from 'react';

import {
  defaultChartRenderer,
  type FinancialChartData,
  type FinancialChartInstance,
  type FinancialChartRenderer,
} from '../../../shared/charting';
import { toMarketChartData } from '../charting/marketChartData';

const CHART_HEIGHT = 320;

export interface CandlestickChartProperties {
  candles: Candle[];
  chartData?: FinancialChartData;
  onRequestOlderHistory?: () => void;
  pair: string;
  renderer?: FinancialChartRenderer;
  strategySignals?: readonly StrategySignalUpdate[];
  timeframe: Timeframe;
}

export function CandlestickChart({
  candles,
  chartData: suppliedChartData,
  onRequestOlderHistory,
  pair,
  renderer = defaultChartRenderer,
  strategySignals = [],
  timeframe,
}: CandlestickChartProperties) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<FinancialChartInstance | null>(null);
  const latestChartDataRef = useRef<FinancialChartData | null>(null);
  const renderedChartDataRef = useRef<FinancialChartData | null>(null);
  const requestOlderHistoryRef = useRef(onRequestOlderHistory);
  const chartData = useMemo(
    () => suppliedChartData ?? toMarketChartData(candles, strategySignals),
    [candles, strategySignals, suppliedChartData],
  );
  const hasData = chartData.candles.length > 0;

  useEffect(() => {
    latestChartDataRef.current = chartData;
  }, [chartData]);

  useEffect(() => {
    requestOlderHistoryRef.current = onRequestOlderHistory;
  }, [onRequestOlderHistory]);

  useEffect(() => {
    if (!hasData) return;
    const container = chartContainerRef.current;
    if (container === null) return;

    const rendererOptions =
      onRequestOlderHistory === undefined
        ? { height: CHART_HEIGHT }
        : {
            height: CHART_HEIGHT,
            onReachedHistoryBoundary: () => requestOlderHistoryRef.current?.(),
          };
    const chartInstance = renderer.mount(container, rendererOptions);
    chartInstanceRef.current = chartInstance;
    const initialChartData = latestChartDataRef.current;
    if (initialChartData !== null) {
      chartInstance.setData(initialChartData);
      renderedChartDataRef.current = initialChartData;
    }
    chartInstance.resize();

    const handleResize = (): void => chartInstance.resize();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(handleResize);
    resizeObserver?.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      chartInstance.destroy();
      renderedChartDataRef.current = null;
      if (chartInstanceRef.current === chartInstance) {
        chartInstanceRef.current = null;
      }
    };
  }, [hasData, onRequestOlderHistory, pair, renderer, timeframe]);

  useEffect(() => {
    const chartInstance = chartInstanceRef.current;
    if (chartInstance === null || renderedChartDataRef.current === chartData) {
      return;
    }
    chartInstance.setData(chartData);
    renderedChartDataRef.current = chartData;
  }, [chartData]);

  if (chartData.candles.length === 0) {
    return (
      <div
        aria-label={`${pair} ${timeframe} candlestick chart`}
        className="flex h-80 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500"
        data-testid="candlestick-chart-empty"
        role="img"
      >
        Waiting for the first candle snapshot
      </div>
    );
  }

  const lastCandle = chartData.candles.at(-1);
  return (
    <div
      ref={chartContainerRef}
      aria-label={`${pair} ${timeframe} live candlestick chart`}
      className="h-80 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-inner"
      data-candle-count={chartData.candles.length}
      data-forming={lastCandle?.isClosed ? undefined : 'true'}
      data-testid="candlestick-chart"
      role="img"
    />
  );
}
