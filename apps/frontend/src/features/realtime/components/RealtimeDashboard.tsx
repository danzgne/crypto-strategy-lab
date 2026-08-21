'use client';

import { RadioTower } from 'lucide-react';

import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { useRealtimeConnection } from '../hooks/useRealtimeConnection';
import { ConnectionStatusCard } from './ConnectionStatusCard';
import { MarketPanel } from './MarketPanel';
import { SystemStatusGrid } from './SystemStatusGrid';

const TIMEFRAMES = ['1m', '5m', '15m', '1h'] as const;

export function RealtimeDashboard() {
  const connection = useRealtimeConnection();

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Operations dashboard
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
            Realtime foundation
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            The production skeleton is online. This milestone proves browser,
            backend, worker, and database wiring before market logic is added.
          </p>
        </div>
        <StatusBadge
          pulse={connection.phase === 'live'}
          tone={connection.phase === 'live' ? 'positive' : 'pending'}
        >
          <RadioTower aria-hidden="true" className="size-3.5" />
          Market-data boundary
        </StatusBadge>
      </div>

      <div className="mt-7">
        <SystemStatusGrid />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,0.6fr)]">
        <section aria-labelledby="workspace-title">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2
                id="workspace-title"
                className="text-base font-semibold text-slate-900"
              >
                Multi-timeframe workspace
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Layout follows the instructor mockup; feeds are intentionally
                deferred.
              </p>
            </div>
            <span className="hidden text-xs font-medium text-slate-400 sm:block">
              4 panels reserved
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {TIMEFRAMES.map((timeframe) => (
              <MarketPanel key={timeframe} timeframe={timeframe} />
            ))}
          </div>
        </section>

        <aside
          aria-label="Realtime connection details"
          className="xl:pt-[3.25rem]"
        >
          <ConnectionStatusCard connection={connection} />
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
            <p className="text-sm font-semibold text-blue-950">
              Scope boundary
            </p>
            <p className="mt-2 text-xs leading-5 text-blue-900/70">
              No browser connection to Binance exists here. The future flow
              remains Frontend → Market Data Service → Exchange Adapter →
              Binance.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
