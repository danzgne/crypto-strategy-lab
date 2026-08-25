'use client';

import type { Candle, Timeframe } from '@crypto-strategy-lab/shared';

interface CandlestickChartProperties {
  candles: Candle[];
  pair: string;
  timeframe: Timeframe;
}

const WIDTH = 800;
const HEIGHT = 320;
const PADDING = { top: 18, right: 16, bottom: 22, left: 16 };
const MAX_VISIBLE_CANDLES = 72;

export function CandlestickChart({
  candles,
  pair,
  timeframe,
}: CandlestickChartProperties) {
  const visibleCandles = candles.slice(-MAX_VISIBLE_CANDLES);
  if (visibleCandles.length === 0) {
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

  const high = Math.max(...visibleCandles.map((candle) => candle.high));
  const low = Math.min(...visibleCandles.map((candle) => candle.low));
  const range = Math.max(high - low, Number.EPSILON);
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const slotWidth = plotWidth / visibleCandles.length;
  const candleWidth = Math.max(3, slotWidth * 0.64);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 p-2 shadow-inner">
      <svg
        aria-label={`${pair} ${timeframe} live candlestick chart`}
        className="h-80 w-full"
        data-candle-count={visibleCandles.length}
        data-testid="candlestick-chart"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <defs>
          <linearGradient id="chart-background" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#172554" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <rect
          fill="url(#chart-background)"
          height={HEIGHT}
          rx="12"
          width={WIDTH}
        />
        {[0, 1, 2, 3, 4].map((step) => {
          const y = PADDING.top + (plotHeight / 4) * step;
          return (
            <line
              key={`horizontal-grid-${step}`}
              stroke="#334155"
              strokeDasharray="4 8"
              strokeOpacity="0.65"
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y}
              y2={y}
            />
          );
        })}
        {visibleCandles.map((candle, index) => {
          const x = PADDING.left + slotWidth * index + slotWidth / 2;
          const openY = priceToY(candle.open, low, range, plotHeight);
          const closeY = priceToY(candle.close, low, range, plotHeight);
          const highY = priceToY(candle.high, low, range, plotHeight);
          const lowY = priceToY(candle.low, low, range, plotHeight);
          const rising = candle.close >= candle.open;
          const color = rising ? '#34d399' : '#fb7185';
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(2, Math.abs(closeY - openY));

          return (
            <g
              data-forming={candle.isClosed ? undefined : 'true'}
              data-open-time={candle.openTime}
              key={`${candle.openTime}-${candle.closeTime}`}
            >
              <title>
                {`${new Date(candle.openTime).toISOString()} close ${candle.close}`}
              </title>
              <line
                stroke={color}
                strokeLinecap="round"
                strokeWidth="2"
                x1={x}
                x2={x}
                y1={highY}
                y2={lowY}
              />
              <rect
                fill={rising ? '#10b981' : '#f43f5e'}
                height={bodyHeight}
                rx="1.5"
                stroke={color}
                strokeWidth="1"
                width={candleWidth}
                x={x - candleWidth / 2}
                y={bodyTop}
              />
            </g>
          );
        })}
        <text
          fill="#94a3b8"
          fontSize="12"
          fontWeight="600"
          x={PADDING.left}
          y={HEIGHT - 7}
        >
          {pair} · {timeframe}
        </text>
        <text
          fill="#64748b"
          fontSize="11"
          textAnchor="end"
          x={WIDTH - PADDING.right}
          y={HEIGHT - 7}
        >
          {visibleCandles.at(-1)?.isClosed ? 'closed' : 'forming'}
        </text>
      </svg>
    </div>
  );
}

function priceToY(
  price: number,
  low: number,
  range: number,
  plotHeight: number,
): number {
  return PADDING.top + (1 - (Math.max(low, price) - low) / range) * plotHeight;
}
