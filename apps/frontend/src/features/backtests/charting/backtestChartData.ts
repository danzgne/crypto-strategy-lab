import type {
  BacktestCandleResponse,
  BacktestTradeResponse,
} from '@crypto-strategy-lab/shared';

import type {
  FinancialChartData,
  FinancialChartLine,
} from '../../../shared/charting';

export function toBacktestChartData(
  candles: readonly BacktestCandleResponse[],
  trades: readonly BacktestTradeResponse[],
): FinancialChartData {
  const sortedCandles = candles
    .slice()
    .sort((left, right) => left.openTime - right.openTime);
  return {
    candles: sortedCandles.map((candle) => ({
      close: Number(candle.close),
      high: Number(candle.high),
      isClosed: candle.isClosed,
      low: Number(candle.low),
      open: Number(candle.open),
      time: toChartTime(candle.openTime),
    })),
    lines: trades.flatMap((trade) => riskLines(trade)),
    markers: trades.flatMap((trade) => [
      {
        color: trade.direction === 'LONG' ? '#16a34a' : '#e11d48',
        position: trade.direction === 'LONG' ? 'belowBar' : 'aboveBar',
        shape: trade.direction === 'LONG' ? 'arrowUp' : 'arrowDown',
        text: trade.direction,
        time: toChartTime(trade.entryTime),
      },
      {
        color: '#2563eb',
        position: trade.direction === 'LONG' ? 'aboveBar' : 'belowBar',
        shape: 'circle',
        text: trade.exitReason,
        time: toChartTime(trade.exitTime),
      },
    ]),
    volume: sortedCandles.map((candle) => ({
      color:
        Number(candle.close) >= Number(candle.open) ? '#10b981' : '#f43f5e',
      time: toChartTime(candle.openTime),
      value: Number(candle.volume),
    })),
  };
}

function riskLines(trade: BacktestTradeResponse): FinancialChartLine[] {
  const points = [
    { time: toChartTime(trade.entryTime), value: Number(trade.entryPrice) },
    { time: toChartTime(trade.exitTime), value: Number(trade.exitPrice) },
  ];
  const linePoints =
    points[0]!.time === points[1]!.time ? [points[0]!] : points;
  const lines: FinancialChartLine[] = [];
  if (trade.stopLoss !== null) {
    lines.push({
      color: '#f97316',
      id: `stop-loss-${trade.id}`,
      points: linePoints.map(({ time }) => ({
        time,
        value: Number(trade.stopLoss),
      })),
    });
  }
  if (trade.takeProfit !== null) {
    lines.push({
      color: '#8b5cf6',
      id: `take-profit-${trade.id}`,
      points: linePoints.map(({ time }) => ({
        time,
        value: Number(trade.takeProfit),
      })),
    });
  }
  return lines;
}

function toChartTime(timeMs: number): number {
  return Math.floor(timeMs / 1_000);
}
