'use client';

import { CandlestickChart as CandlestickIcon } from 'lucide-react';
import type { Timeframe } from '@crypto-strategy-lab/shared';

import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { useMarketSubscription } from '../hooks/useMarketSubscription';
import { CandlestickChart } from './CandlestickChart';

const PHASE_COPY = {
  connecting: { label: 'Loading history', tone: 'pending' },
  live: { label: 'LIVE', tone: 'positive' },
  reconnecting: { label: 'RECONNECTING', tone: 'pending' },
  stale: { label: 'STALE', tone: 'negative' },
} as const;

export function MarketPanel({ timeframe }: { timeframe: Timeframe }) {
  const market = useMarketSubscription({
    pair: 'BTCUSDT',
    timeframe,
    limit: 500,
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
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">
              BTCUSDT
            </span>
            <span className="text-xs font-medium text-slate-400">
              · {timeframe}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Binance market stream</p>
        </div>
        <StatusBadge pulse={market.phase === 'live'} tone={phase.tone}>
          {phase.label}
        </StatusBadge>
      </div>

      <div className="mt-5">
        <CandlestickChart
          candles={market.candles}
          pair="BTCUSDT"
          timeframe={timeframe}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <CandlestickIcon
            aria-hidden="true"
            className="size-4 text-indigo-500"
          />
          <span>{market.detail}</span>
        </div>
        <div className="text-left sm:text-right">
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
