import { Activity, ArrowDown, ArrowUp, Clock3, Database } from 'lucide-react';

import type { Tick } from '@crypto-strategy-lab/shared';

import { Panel } from '../../../shared/ui/Panel';

export interface RecentTicksCardProperties {
  pair: string;
  ticks: readonly Tick[];
  loading: boolean;
}

export function RecentTicksCard({
  pair,
  ticks,
  loading,
}: RecentTicksCardProperties) {
  return (
    <Panel
      aria-label={`Recent ticks for ${pair}`}
      className="overflow-hidden"
      data-testid="recent-ticks-card"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-5">
        <div>
          <div className="flex items-center gap-2">
            <Activity aria-hidden="true" className="size-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              Recent Ticks
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">{pair} · newest first</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          {loading ? 'Syncing' : `${ticks.length} shown`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            <tr>
              <th className="px-5 py-3" scope="col">
                Time
              </th>
              <th className="px-3 py-3" scope="col">
                Price
              </th>
              <th className="px-3 py-3" scope="col">
                Volume
              </th>
              <th className="px-5 py-3 text-right" scope="col">
                Type
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ticks.length === 0 ? (
              <tr>
                <td
                  className="px-5 py-8 text-center text-slate-500"
                  colSpan={4}
                >
                  {loading
                    ? 'Waiting for recent trade events'
                    : 'No recent ticks received'}
                </td>
              </tr>
            ) : (
              ticks.map((tick) => <TickRow key={tick.tradeId} tick={tick} />)
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">
        <Database aria-hidden="true" className="size-3.5 text-slate-400" />
        <span>Bounded in-memory window · live exchange trades</span>
      </div>
    </Panel>
  );
}

function TickRow({ tick }: { tick: Tick }) {
  const isBuy = tick.side === 'BUY';
  return (
    <tr>
      <td className="whitespace-nowrap px-5 py-3 font-mono text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 aria-hidden="true" className="size-3 text-slate-400" />
          {formatTickTime(tick.time)}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">
        {formatNumber(tick.price, 8)}
      </td>
      <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-slate-500">
        {formatNumber(tick.quantity, 6)}
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-right">
        <span
          className={
            isBuy
              ? 'inline-flex items-center gap-1 font-semibold text-emerald-600'
              : 'inline-flex items-center gap-1 font-semibold text-rose-600'
          }
        >
          {isBuy ? (
            <ArrowUp aria-hidden="true" className="size-3" />
          ) : (
            <ArrowDown aria-hidden="true" className="size-3" />
          )}
          {isBuy ? 'Buy' : 'Sell'}
        </span>
      </td>
    </tr>
  );
}

function formatTickTime(time: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(new Date(time));
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(value);
}
