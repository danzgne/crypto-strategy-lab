'use client';

import type {
  BacktestProvenanceResponse,
  BacktestResultResponse,
} from '@crypto-strategy-lab/shared';
import { ArrowLeft, ChevronLeft, ChevronRight, CircleHelp } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { CandlestickChart } from '../../market-data/components/CandlestickChart';
import type { FinancialChartRenderer } from '../../../shared/charting';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { toBacktestChartData } from '../charting/backtestChartData';
import { useBacktest, type UseBacktestOptions } from '../hooks/useBacktest';

export interface BacktestResultViewProperties {
  experimentId: string;
  client?: UseBacktestOptions['client'];
  pollIntervalMs?: number;
  renderer?: FinancialChartRenderer;
}

export function BacktestResultView({
  client,
  experimentId,
  pollIntervalMs,
  renderer,
}: BacktestResultViewProperties) {
  const state = useBacktest(experimentId, {
    ...(client === undefined ? {} : { client }),
    ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
  });

  if (state.loading && state.result === null) {
    return (
      <ResultShell>
        <LoadingState />
      </ResultShell>
    );
  }
  if (state.error !== null) {
    return (
      <ResultShell>
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"
          role="alert"
        >
          {state.error}
        </div>
      </ResultShell>
    );
  }
  if (state.result === null) {
    return (
      <ResultShell>
        <LoadingState />
      </ResultShell>
    );
  }

  return (
    <ResultShell>
      <BacktestResultContent
        result={state.result}
        {...(renderer === undefined ? {} : { renderer })}
      />
    </ResultShell>
  );
}

function ResultShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1480px]">{children}</div>;
}

function BacktestResultContent({
  result,
  renderer,
}: {
  result: BacktestResultResponse;
  renderer?: FinancialChartRenderer;
}) {
  const [page, setPage] = useState(0);
  const metrics = result.metrics;
  const chartData = useMemo(
    () => toBacktestChartData(result.candles, result.trades),
    [result.candles, result.trades],
  );
  const pageCount = Math.max(1, Math.ceil(result.trades.length / 10));
  const visibleTrades = result.trades.slice(page * 10, (page + 1) * 10);

  if (result.status !== 'completed' || metrics === null) {
    return (
      <>
        <ResultHeader result={result} />
        <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <CircleHelp aria-hidden="true" className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-950">
            {result.status === 'failed'
              ? 'Backtest failed'
              : result.status === 'queued'
                ? 'Backtest queued'
                : 'Backtest is running'}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
            {result.status === 'failed'
              ? (result.failureReason ??
                'The worker could not complete this simulation.')
              : result.status === 'queued'
                ? 'The job is waiting for a Backtest Worker. The page refreshes automatically every second.'
                : 'The page refreshes automatically every second until the worker publishes a terminal result.'}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <ResultHeader result={result} />

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.55)] sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Price action &amp; trade markers
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Selected-range candles are kept separate from the immutable
              warm-up snapshot.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
            <Legend color="bg-emerald-500" label="LONG entry" />
            <Legend color="bg-rose-500" label="SHORT entry" />
            <Legend color="bg-blue-500" label="Exit" />
          </div>
        </div>
        <div className="mt-4">
          <CandlestickChart
            candles={[]}
            chartData={chartData}
            pair={result.pair}
            {...(renderer === undefined ? {} : { renderer })}
            timeframe={result.timeframe}
          />
        </div>
      </section>

      <section
        aria-label="Backtest metrics"
        className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6"
      >
        <MetricCard label="Winrate" value={formatPercent(metrics.winRate)} />
        <MetricCard label="Wins" value={String(metrics.wins)} />
        <MetricCard label="Losses" value={String(metrics.losses)} />
        <MetricCard
          label="Total Profit"
          value={formatCurrency(metrics.totalProfit)}
        />
        <MetricCard
          label="Max Drawdown"
          value={formatPercent(metrics.maxDrawdown)}
          detail={formatCurrency(metrics.maxDrawdownAmount)}
        />
        <MetricCard label="Total Trades" value={String(metrics.totalTrades)} />
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Trade history
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Each row is a closed position, including fees and slippage from
              both fills.
            </p>
          </div>
          <p className="text-xs font-medium text-slate-400">
            {result.trades.length} trades
          </p>
        </div>
        <TradeTable trades={visibleTrades} />
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">
            Page {page + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              aria-label="Previous trade page"
              className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              type="button"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label="Next trade page"
              className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
              disabled={page >= pageCount - 1}
              onClick={() =>
                setPage((current) => Math.min(pageCount - 1, current + 1))
              }
              type="button"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      </section>

      <ProvenanceSection provenance={result.provenance} />
    </>
  );
}

function ResultHeader({ result }: { result: BacktestResultResponse }) {
  const statusTone =
    result.status === 'completed'
      ? 'positive'
      : result.status === 'failed'
        ? 'negative'
        : 'neutral';
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
          href="/backtests"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          New backtest
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
          Backtest Results
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {result.pair} · {result.timeframe} · {formatDate(result.startTime)} —{' '}
          {formatDate(result.endTime)}
        </p>
      </div>
      <StatusBadge tone={statusTone}>{result.status}</StatusBadge>
    </div>
  );
}

function ProvenanceSection({
  provenance,
}: {
  provenance: BacktestProvenanceResponse;
}) {
  return (
    <section
      aria-label="Provenance"
      className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">
          Provenance
        </h2>
        <StatusBadge tone={provenance.reproducible ? 'positive' : 'neutral'}>
          {provenance.reproducible ? 'Reproducible' : 'Legacy (partial)'}
        </StatusBadge>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        The exact Strategy Version, data, and code that produced this result.
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ProvenanceField
          label="Strategy Version"
          value={provenance.strategyVersionId}
        />
        <ProvenanceField
          label="Strategy implementation"
          value={provenance.strategyImplementationVersion}
        />
        <ProvenanceField
          label="Dataset Snapshot"
          value={provenance.datasetSnapshotFingerprint}
        />
        <ProvenanceField
          label="Simulation Rules"
          value={provenance.simulationRulesVersion}
        />
        <ProvenanceField
          label="Evaluator"
          value={provenance.evaluatorVersion}
        />
        <ProvenanceField
          label="Application build"
          value={provenance.buildRevision}
        />
      </dl>
      {provenance.generator ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            Search provenance
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ProvenanceField
              label="Algorithm"
              value={provenance.generator.algorithm}
            />
            <ProvenanceField
              label="Generator version"
              value={provenance.generator.version}
            />
            <ProvenanceField
              label="Seed"
              value={String(provenance.generator.seed)}
            />
            <ProvenanceField
              label="Generation ordinal"
              value={String(provenance.generator.generationOrdinal)}
            />
          </dl>
        </div>
      ) : (
        <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
          Manual backtest: no search generator produced this candidate.
        </p>
      )}
    </section>
  );
}

function ProvenanceField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-xs text-slate-700">
        {value ?? '—'}
      </dd>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-h-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
      {detail !== undefined && (
        <p className="mt-1 text-[11px] text-slate-400">{detail}</p>
      )}
    </div>
  );
}

function TradeTable({ trades }: { trades: BacktestResultResponse['trades'] }) {
  if (trades.length === 0) {
    return (
      <p className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        No closed trades in this range.
      </p>
    );
  }
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="border-b border-slate-100 text-[11px] uppercase tracking-[0.08em] text-slate-400">
          <tr>
            <th className="px-3 py-3 font-semibold">Direction</th>
            <th className="px-3 py-3 font-semibold">Entry</th>
            <th className="px-3 py-3 font-semibold">Exit</th>
            <th className="px-3 py-3 font-semibold">Investment</th>
            <th className="px-3 py-3 font-semibold">Stop loss</th>
            <th className="px-3 py-3 font-semibold">Take profit</th>
            <th className="px-3 py-3 font-semibold">Cost</th>
            <th className="px-3 py-3 font-semibold">Slippage</th>
            <th className="px-3 py-3 font-semibold">Profit</th>
            <th className="px-3 py-3 font-semibold">Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {trades.map((trade) => (
            <tr key={trade.id}>
              <td
                className={`px-3 py-3 font-semibold ${trade.direction === 'LONG' ? 'text-emerald-600' : 'text-rose-600'}`}
              >
                {trade.direction}
              </td>
              <td className="px-3 py-3">
                <span className="block font-medium">
                  {formatPrice(trade.entryPrice)}
                </span>
                <span className="text-[11px] text-slate-400">
                  {formatDateTime(trade.entryTime)}
                </span>
              </td>
              <td className="px-3 py-3">
                <span className="block font-medium">
                  {formatPrice(trade.exitPrice)}
                </span>
                <span className="text-[11px] text-slate-400">
                  {formatDateTime(trade.exitTime)}
                </span>
              </td>
              <td className="px-3 py-3">{formatCurrency(trade.investment)}</td>
              <td className="px-3 py-3">
                {trade.stopLoss === null ? '—' : formatPrice(trade.stopLoss)}
              </td>
              <td className="px-3 py-3">
                {trade.takeProfit === null
                  ? '—'
                  : formatPrice(trade.takeProfit)}
              </td>
              <td className="px-3 py-3">
                {formatCurrency(trade.transactionCost)}
              </td>
              <td className="px-3 py-3">{formatCurrency(trade.slippage)}</td>
              <td
                className={`px-3 py-3 font-semibold ${Number(trade.profit) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
              >
                {formatCurrency(trade.profit)}
              </td>
              <td className="px-3 py-3 text-slate-500">{trade.exitReason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
      Loading backtest result…
    </div>
  );
}

function formatPercent(value: string): string {
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatCurrency(value: string): string {
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} USDT`;
}

function formatPrice(value: string): string {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function formatDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function formatDateTime(time: number): string {
  return new Date(time).toISOString().replace('T', ' ').slice(0, 16);
}
