import { RadioTower } from 'lucide-react';

import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { MarketPanel } from './MarketPanel';
import { RealtimeConnectionPanel } from './RealtimeConnectionPanel';

export function MarketDataDashboard() {
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
            Watch the current BTCUSDT candle move in real time. The browser
            receives normalized candles from the Market Data Service; Binance
            remains behind the backend exchange adapter.
          </p>
        </div>
        <StatusBadge tone="neutral">
          <RadioTower aria-hidden="true" className="size-3.5" />
          Market-data boundary
        </StatusBadge>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,0.6fr)]">
        <section aria-labelledby="workspace-title">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2
                id="workspace-title"
                className="text-base font-semibold text-slate-900"
              >
                Live market workspace
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                The first live slice starts with one 1-minute chart. Additional
                independently switchable panels follow in the next market-data
                slice.
              </p>
            </div>
            <span className="hidden text-xs font-medium text-slate-400 sm:block">
              1 live panel
            </span>
          </div>
          <MarketPanel timeframe="1m" />
        </section>

        <aside
          aria-label="Realtime connection details"
          className="xl:pt-[3.25rem]"
        >
          <RealtimeConnectionPanel />
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
            <p className="text-sm font-semibold text-blue-950">
              Scope boundary
            </p>
            <p className="mt-2 text-xs leading-5 text-blue-900/70">
              The browser never connects to Binance. The live flow is Frontend →
              Market Data Service → Exchange Adapter → Binance.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
