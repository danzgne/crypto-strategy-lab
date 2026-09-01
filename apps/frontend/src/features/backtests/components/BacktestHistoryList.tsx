'use client';

import type { BacktestHistoryItem } from '@crypto-strategy-lab/shared';
import { ArrowUpRight, History, RotateCw } from 'lucide-react';
import Link from 'next/link';

import { StatusBadge } from '../../../shared/ui/StatusBadge';

export interface BacktestHistoryListProperties {
  items: BacktestHistoryItem[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}

export function BacktestHistoryList({
  error,
  items,
  loading,
  onRetry,
}: BacktestHistoryListProperties) {
  return (
    <section
      aria-labelledby="backtest-history-title"
      className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.55)] sm:p-7"
      data-testid="backtest-history"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <History aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2
              className="text-lg font-semibold tracking-tight text-slate-950"
              id="backtest-history-title"
            >
              Backtest history
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Runs for this account, newest first.
            </p>
          </div>
        </div>
        {items.length > 0 && !loading ? (
          <span className="text-xs font-medium text-slate-400">
            {items.length} {items.length === 1 ? 'run' : 'runs'}
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">
          Loading backtest history…
        </p>
      ) : error !== null ? (
        <div
          className="mt-6 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <span>{error}</span>
          {onRetry !== undefined ? (
            <button
              className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 sm:self-auto"
              onClick={() => void onRetry()}
              type="button"
            >
              <RotateCw aria-hidden="true" className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">
          No backtests yet. Run your first one using the form above.
        </p>
      ) : (
        <div className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {items.map((item) => (
            <HistoryLink item={item} key={item.experimentId} />
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryLink({ item }: { item: BacktestHistoryItem }) {
  const metrics = item.metrics;
  return (
    <Link
      className="group flex flex-col gap-4 px-4 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
      data-testid="backtest-history-item"
      href={`/backtests/${encodeURIComponent(item.experimentId)}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-900">
            {item.strategyName}
          </h3>
          <StatusBadge tone={statusTone(item.status)}>
            {statusLabel(item.status)}
          </StatusBadge>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {item.pair} · {item.timeframe} · {formatDate(item.startTime)} —{' '}
          {formatDate(item.endTime)}
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          Created {formatDateTime(item.createdAt)} · Version{' '}
          {item.strategyVersionId.slice(0, 8)}
        </p>
        {item.failureReason !== null ? (
          <p className="mt-2 line-clamp-2 text-xs text-rose-700">
            {item.failureReason}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-5 sm:justify-end">
        {metrics === null ? (
          <span className="text-xs text-slate-400">Metrics pending</span>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-right">
            <HistoryMetric
              label="Return"
              value={formatPercent(metrics.return)}
            />
            <HistoryMetric
              label="Profit"
              value={formatCurrency(metrics.totalProfit)}
            />
            <HistoryMetric label="Trades" value={String(metrics.totalTrades)} />
          </div>
        )}
        <ArrowUpRight
          aria-hidden="true"
          className="size-4 shrink-0 text-slate-300 transition group-hover:text-indigo-500"
        />
      </div>
    </Link>
  );
}

function HistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xs font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function statusTone(
  status: BacktestHistoryItem['status'],
): 'neutral' | 'pending' | 'positive' | 'negative' {
  if (status === 'completed') return 'positive';
  if (status === 'failed') return 'negative';
  return 'pending';
}

function statusLabel(status: BacktestHistoryItem['status']): string {
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  if (status === 'running') return 'Running';
  return 'Queued';
}

function formatPercent(value: string): string {
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatCurrency(value: string): string {
  return `${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} USDT`;
}

function formatDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function formatDateTime(time: number): string {
  return new Date(time).toISOString().replace('T', ' ').slice(0, 16);
}
