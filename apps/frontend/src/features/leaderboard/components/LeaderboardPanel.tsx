'use client';

import { ArrowUpRight, RotateCw, Trophy } from 'lucide-react';
import Link from 'next/link';

import { useLeaderboard, type LeaderboardState } from '../hooks/useLeaderboard';

export interface LeaderboardPanelProperties {
  state?: LeaderboardState;
}

export function LeaderboardPanel({ state }: LeaderboardPanelProperties) {
  const internalState = useLeaderboard();
  const leaderboardState = state ?? internalState;
  return (
    <section
      aria-labelledby="leaderboard-title"
      className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.5)] sm:p-5"
      data-testid="leaderboard-panel"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <Trophy aria-hidden="true" className="size-4" />
          </span>
          <div>
            <h2
              className="text-lg font-semibold tracking-tight text-slate-950"
              id="leaderboard-title"
            >
              Leaderboard (Top strategies)
            </h2>
            <p className="text-xs text-slate-500">
              Your completed composite experiments, ranked by overall
              performance.
            </p>
          </div>
        </div>
        {leaderboardState.entries.length > 0 && !leaderboardState.loading ? (
          <span className="text-xs font-medium text-slate-400">
            Top {leaderboardState.k}
          </span>
        ) : null}
      </div>

      {leaderboardState.loading ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">
          Loading leaderboard…
        </p>
      ) : leaderboardState.error !== null ? (
        <div
          className="mt-5 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <span>{leaderboardState.error}</span>
          <button
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 sm:self-auto"
            onClick={() => void leaderboardState.refresh()}
            type="button"
          >
            <RotateCw aria-hidden="true" className="size-3.5" />
            Try again
          </button>
        </div>
      ) : leaderboardState.entries.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
          Completed composite experiments will appear here.
        </p>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-100">
          <div
            className="grid grid-cols-[3rem_minmax(0,1fr)_8rem_6rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:grid-cols-[4rem_minmax(0,1fr)_10rem_7rem]"
            role="row"
          >
            <span role="columnheader">Rank</span>
            <span role="columnheader">Strategy</span>
            <span className="text-right" role="columnheader">
              Profit (USDT)
            </span>
            <span className="text-right" role="columnheader">
              Winrate
            </span>
          </div>
          {leaderboardState.entries.map((entry) => (
            <LeaderboardRow entry={entry} key={entry.experimentId} />
          ))}
        </div>
      )}
    </section>
  );
}

function LeaderboardRow({
  entry,
}: {
  entry: LeaderboardState['entries'][number];
}) {
  return (
    <Link
      className="group grid grid-cols-[3rem_minmax(0,1fr)_8rem_6rem] items-center gap-3 border-b border-slate-100 px-4 py-3 transition last:border-b-0 hover:bg-indigo-50/50 sm:grid-cols-[4rem_minmax(0,1fr)_10rem_7rem]"
      data-testid="leaderboard-entry"
      href={`/backtests/${encodeURIComponent(entry.experimentId)}`}
      role="row"
    >
      <span className="text-sm font-semibold text-slate-700">{entry.rank}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        {(entry.memberStrategies.length > 0
          ? entry.memberStrategies.map(({ label }) => label)
          : [entry.strategyDisplayName]
        ).map((label, index) => (
          <span
            className="inline-flex items-center gap-1"
            key={`${label}-${index}`}
          >
            {index > 0 ? (
              <span aria-hidden="true" className="text-slate-400">
                +
              </span>
            ) : null}
            <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
              {label}
            </span>
          </span>
        ))}
        <ArrowUpRight
          aria-hidden="true"
          className="ml-0.5 size-3.5 text-slate-300 transition group-hover:text-indigo-500"
        />
      </span>
      <span className="text-right text-xs font-semibold text-emerald-700">
        {formatProfit(entry.totalProfit)}
      </span>
      <span className="text-right text-xs font-semibold text-slate-700">
        {formatPercent(entry.winRate)}
      </span>
    </Link>
  );
}

function formatPercent(value: string): string {
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatProfit(value: string): string {
  const amount = Number(value);
  const sign = amount > 0 ? '+' : '';
  return `${sign}${amount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}
