import type {
  BacktestCandleResponse,
  BacktestTradeResponse,
} from '@crypto-strategy-lab/shared';
import { describe, expect, it } from 'vitest';

import { toBacktestChartData } from '../../../../src/features/backtests/charting/backtestChartData';

describe('toBacktestChartData', () => {
  it('maps selected candles, risk lines, and two markers for every trade', () => {
    const candles: BacktestCandleResponse[] = [
      makeCandle(120_000, '101', '100'),
      makeCandle(60_000, '100', '99'),
    ];
    const trade: BacktestTradeResponse = {
      direction: 'LONG',
      entryPrice: '100',
      entryTime: 60_000,
      exitPrice: '110',
      exitReason: 'TAKE_PROFIT',
      exitTime: 120_000,
      id: 'trade-1',
      investment: '1000',
      pair: 'BTCUSDT',
      profit: '100',
      slippage: '0',
      stopLoss: '95',
      takeProfit: '110',
      transactionCost: '1.6',
    };

    const data = toBacktestChartData(candles, [trade]);

    expect(data.candles.map(({ time }) => time)).toEqual([60, 120]);
    expect(data.volume).toHaveLength(2);
    expect(data.lines).toEqual([
      {
        color: '#f97316',
        id: 'stop-loss-trade-1',
        points: [
          { time: 60, value: 95 },
          { time: 120, value: 95 },
        ],
      },
      {
        color: '#8b5cf6',
        id: 'take-profit-trade-1',
        points: [
          { time: 60, value: 110 },
          { time: 120, value: 110 },
        ],
      },
    ]);
    expect(data.markers).toEqual([
      {
        color: '#16a34a',
        position: 'belowBar',
        shape: 'arrowUp',
        text: 'LONG',
        time: 60,
      },
      {
        color: '#2563eb',
        position: 'aboveBar',
        shape: 'circle',
        text: 'TAKE_PROFIT',
        time: 120,
      },
    ]);
  });
});

function makeCandle(
  openTime: number,
  close: string,
  open: string,
): BacktestCandleResponse {
  return {
    close,
    closeTime: openTime + 59_999,
    high: String(Number(close) + 1),
    isClosed: true,
    low: String(Number(open) - 1),
    open,
    openTime,
    pair: 'BTCUSDT',
    timeframe: '1m',
    volume: '10',
  };
}
