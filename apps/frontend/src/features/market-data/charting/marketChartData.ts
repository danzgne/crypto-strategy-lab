import type {
  Candle,
  SignalAction,
  StrategySignalUpdate,
} from '@crypto-strategy-lab/shared';
import { paneForIndicatorReference } from '@crypto-strategy-lab/shared/strategy';
import { MAX_CANDLE_LIMIT } from '@crypto-strategy-lab/shared/market-data';

import {
  FINANCIAL_CHART_COLORS,
  type FinancialChartData,
  type FinancialChartLine,
  type FinancialChartPoint,
} from '../../../shared/charting';

const INDICATOR_COLORS = [
  '#818cf8',
  '#fbbf24',
  '#38bdf8',
  '#f472b6',
  '#a3e635',
  '#fb923c',
] as const;

export function toMarketChartData(
  candles: readonly Candle[],
  strategySignals: readonly StrategySignalUpdate[],
): FinancialChartData {
  const visibleCandles = candles
    .slice()
    .sort((left, right) => left.openTime - right.openTime)
    .slice(-MAX_CANDLE_LIMIT);
  const visibleOpenTimes = new Set(
    visibleCandles.map((candle) => candle.openTime),
  );
  const visibleSignals = strategySignals
    .filter((update) => visibleOpenTimes.has(update.candle.openTime))
    .sort((left, right) => left.candle.openTime - right.candle.openTime);

  const linePointsByIndicator = new Map<string, FinancialChartPoint[]>();
  for (const update of visibleSignals) {
    const time = toChartTime(update.candle.openTime);
    for (const [indicatorName, value] of Object.entries(update.indicators)) {
      if (!Number.isFinite(value)) continue;
      const points = linePointsByIndicator.get(indicatorName) ?? [];
      points.push({ time, value });
      linePointsByIndicator.set(indicatorName, points);
    }
  }

  const lines: FinancialChartLine[] = [...linePointsByIndicator.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, points], index) => ({
      color: INDICATOR_COLORS[index % INDICATOR_COLORS.length] ?? '#818cf8',
      id,
      pane: paneForIndicatorReference(id),
      points,
    }));

  return {
    candles: visibleCandles.map((candle) => ({
      close: candle.close,
      high: candle.high,
      isClosed: candle.isClosed,
      low: candle.low,
      open: candle.open,
      time: toChartTime(candle.openTime),
    })),
    lines,
    markers: visibleSignals.flatMap((update) =>
      markerForAction(update.candle.openTime, update.signal.action),
    ),
    volume: visibleCandles.map((candle) => ({
      color:
        candle.close >= candle.open
          ? FINANCIAL_CHART_COLORS.up
          : FINANCIAL_CHART_COLORS.down,
      time: toChartTime(candle.openTime),
      value: candle.volume,
    })),
  };
}

function markerForAction(
  openTime: number,
  action: SignalAction,
): FinancialChartData['markers'] {
  if (action === 'HOLD') return [];
  const isBuy = action === 'BUY';
  return [
    {
      color: isBuy ? '#22c55e' : '#f43f5e',
      position: isBuy ? 'belowBar' : 'aboveBar',
      shape: isBuy ? 'arrowUp' : 'arrowDown',
      text: action,
      time: toChartTime(openTime),
    },
  ];
}

function toChartTime(openTimeMs: number): number {
  return Math.floor(openTimeMs / 1_000);
}
