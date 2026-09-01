'use client';

import { CandlestickChart as CandlestickIcon } from 'lucide-react';
import type { CompositeStrategyRequest } from '@crypto-strategy-lab/shared';
import { MAX_CANDLE_LIMIT } from '@crypto-strategy-lab/shared/market-data';

import { StatusBadge } from '../../../shared/ui/StatusBadge';
import type { FinancialChartRenderer } from '../../../shared/charting';
import { useMarketSubscription } from '../hooks/useMarketSubscription';
import { useStrategySignal } from '../hooks/useStrategySignal';
import { CandlestickChart } from './CandlestickChart';

const PHASE_COPY = {
  connecting: { label: 'Loading history', tone: 'pending' },
  live: { label: 'LIVE', tone: 'positive' },
  reconnecting: { label: 'RECONNECTING', tone: 'pending' },
  stale: { label: 'STALE', tone: 'negative' },
} as const;

export const CHART_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type ChartTimeframe = (typeof CHART_TIMEFRAMES)[number];

interface MarketPanelProperties {
  chartRenderer?: FinancialChartRenderer;
  pair: string;
  timeframe: ChartTimeframe;
  panelNumber: number;
  onTimeframeChange: (timeframe: ChartTimeframe) => void;
  strategyId: string | null;
  strategyParams?: unknown;
  params?: unknown;
  composite?: CompositeStrategyRequest | null;
}

export function MarketPanel({
  chartRenderer,
  pair,
  timeframe,
  panelNumber,
  onTimeframeChange,
  params,
  strategyId,
  strategyParams,
  composite = null,
}: MarketPanelProperties) {
  const chartId = `market-panel-${panelNumber}`;
  const market = useMarketSubscription({
    pair,
    timeframe,
    limit: 500,
    chartId,
  });
  const effectiveParams = params ?? strategyParams;
  const strategy = useStrategySignal({
    chartId,
    ...(composite === null ? {} : { composite }),
    enabled: composite !== null || strategyId !== null,
    limit: MAX_CANDLE_LIMIT,
    pair,
    ...(effectiveParams === undefined ? {} : { params: effectiveParams }),
    strategyId: composite === null ? (strategyId ?? '') : 'composite',
    timeframe,
  });
  const phase = PHASE_COPY[market.phase];
  const latestCandle = market.candles.at(-1);
  const latestClose = latestCandle
    ? new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 4,
      }).format(latestCandle.close)
    : 'Waiting';

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.5)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {pair} · {timeframe}
          </p>
          <p className="mt-1 text-xs text-slate-500">Market data stream</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`timeframe-panel-${panelNumber}`}>
            Timeframe for panel {panelNumber}
          </label>
          <select
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            id={`timeframe-panel-${panelNumber}`}
            onChange={(event) =>
              onTimeframeChange(event.target.value as ChartTimeframe)
            }
            value={timeframe}
          >
            {CHART_TIMEFRAMES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <StatusBadge pulse={market.phase === 'live'} tone={phase.tone}>
            {phase.label}
          </StatusBadge>
        </div>
      </div>

      {strategy.error !== null && (
        <p
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
          role="alert"
        >
          {strategy.error}
        </p>
      )}

      <div className="mt-5">
        <CandlestickChart
          candles={market.candles}
          onRequestOlderHistory={market.requestOlderHistory}
          pair={pair}
          {...(chartRenderer === undefined ? {} : { renderer: chartRenderer })}
          strategySignals={strategy.history}
          timeframe={timeframe}
        />
      </div>

      {strategy.error !== null && (
        <div
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800"
          role="alert"
        >
          <p className="font-semibold">Strategy evaluation failed</p>
          <p className="mt-1">{strategy.error}</p>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <CandlestickIcon
            aria-hidden="true"
            className="size-4 text-indigo-500"
          />
          <span>{market.detail}</span>
        </div>
        <div className="text-left sm:text-right">
          {strategy.latest !== null && (
            <div
              className="mb-2 flex items-baseline justify-start gap-2 sm:justify-end"
              data-testid={`strategy-signal-${panelNumber}`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Signal
              </span>
              <span className="text-sm font-bold text-slate-900">
                {strategy.latest.signal.action}
              </span>
              <span className="text-xs text-slate-500">
                {formatStrength(strategy.latest.signal.strength)}
              </span>
            </div>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Latest close
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
            {latestClose}
          </p>
        </div>
      </div>
    </article>
  );
}

function formatStrength(strength: number | undefined): string {
  return strength === undefined
    ? '—'
    : `${Math.round(strength * 100)}% strength`;
}
