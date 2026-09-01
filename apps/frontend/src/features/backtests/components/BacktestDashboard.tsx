'use client';

import type {
  BacktestSubmissionRequest,
  SavedStrategy,
  StrategyCatalogEntry,
} from '@crypto-strategy-lab/shared';
import { formatStrategyType } from '@crypto-strategy-lab/shared/strategy';
import { ArrowRight, BarChart3, ShieldCheck } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  catalogEntries,
  createDefaultParameterValues,
  resolveParameters,
} from '../../combinations/strategyForm';
import { StrategyParameterFields } from '../../combinations/components/StrategyParameterFields';
import { useStrategyCatalog } from '../../market-data/hooks/useStrategyCatalog';
import { useSavedStrategies } from '../../strategies';
import { backtestClient, type BacktestClient } from '../api/backtestClient';

export interface BacktestDashboardProperties {
  client?: BacktestClient;
}

export function BacktestDashboard({
  client = backtestClient,
}: BacktestDashboardProperties) {
  const router = useRouter();
  const catalog = useStrategyCatalog();
  const saved = useSavedStrategies();
  const entries = useMemo(() => catalogEntries(catalog), [catalog]);
  const clientRef = useRef(client);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [pair, setPair] = useState('BTCUSDT');
  const [timeframe, setTimeframe] =
    useState<BacktestSubmissionRequest['timeframe']>('5m');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-06-01');
  const [initialInvestment, setInitialInvestment] = useState('10000');
  const [transactionCostPercent, setTransactionCostPercent] = useState('0.08');
  const [slippage, setSlippage] = useState('5');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveStrategyId =
    selectedStrategyId === '' ? (entries[0]?.id ?? '') : selectedStrategyId;
  const selectedEntry =
    selectedVersionId === undefined
      ? (entries.find((entry) => entry.id === effectiveStrategyId) ??
        entries[0])
      : undefined;
  const selectedSavedStrategy = useMemo(
    () =>
      selectedVersionId === undefined
        ? undefined
        : saved.strategies.find(
            (strategy) => strategy.versionId === selectedVersionId,
          ),
    [saved.strategies, selectedVersionId],
  );
  const selectedTargetValue =
    selectedVersionId === undefined
      ? effectiveStrategyId.length === 0
        ? ''
        : `strategy:${effectiveStrategyId}`
      : `version:${selectedVersionId}`;
  const formParameters = useMemo(
    () =>
      selectedEntry === undefined
        ? parameters
        : {
            ...createDefaultParameterValues(selectedEntry),
            ...parameters,
          },
    [parameters, selectedEntry],
  );
  const resolvedParameters = useMemo(
    () => resolveParameters(formParameters, selectedEntry),
    [formParameters, selectedEntry],
  );

  const selectStrategy = (entry: StrategyCatalogEntry): void => {
    setSelectedVersionId(undefined);
    setSelectedStrategyId(entry.id);
    setParameters(createDefaultParameterValues(entry));
  };

  const selectTarget = (value: string): void => {
    if (value.startsWith('version:')) {
      setSelectedVersionId(value.slice('version:'.length));
      setSelectedStrategyId('');
      setParameters({});
      return;
    }
    const strategyId = value.slice('strategy:'.length);
    const entry = entries.find(({ id }) => id === strategyId);
    if (entry !== undefined) selectStrategy(entry);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      selectedSavedStrategy === undefined &&
      (selectedEntry === undefined || resolvedParameters === null)
    ) {
      setError('Chọn một chiến lược và kiểm tra lại tham số.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const target =
        selectedSavedStrategy === undefined
          ? {
              params: resolvedParameters ?? {},
              strategyId: selectedEntry!.id,
            }
          : { strategyVersionId: selectedSavedStrategy.versionId };
      const request: BacktestSubmissionRequest = {
        endTime: dateAtUtc(endDate),
        initialInvestment,
        pair,
        slippage,
        startTime: dateAtUtc(startDate),
        ...target,
        timeframe,
        transactionCost: String(Number(transactionCostPercent) / 100),
      };
      const created = await clientRef.current.submit(request);
      router.push(`/backtests/${created.experimentId}`);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Không thể tạo backtest',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-500">
            Research workspace
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
            Backtest &amp; Results
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Mô phỏng một phiên bản chiến lược trên dữ liệu nến lịch sử đã được
            chụp cố định, sau đó xem giao dịch và các chỉ số đánh giá.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Closed candles only
        </div>
      </div>

      {error !== null && (
        <div
          className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          {error}
        </div>
      )}

      <form
        className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.55)] sm:p-7"
        onSubmit={submit}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
            <BarChart3 aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Manual backtest
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Chọn cặp, khoảng thời gian, chi phí và đúng strategy version cần
              mô phỏng.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <Field label="Pair" htmlFor="backtest-pair">
            <input
              className={inputClass}
              id="backtest-pair"
              onChange={(event) => setPair(event.target.value.toUpperCase())}
              spellCheck={false}
              value={pair}
            />
          </Field>
          <Field label="Timeframe" htmlFor="backtest-timeframe">
            <select
              className={inputClass}
              id="backtest-timeframe"
              onChange={(event) =>
                setTimeframe(
                  event.target.value as BacktestSubmissionRequest['timeframe'],
                )
              }
              value={timeframe}
            >
              {['1m', '5m', '15m', '1h', '4h', '1d'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Strategy" htmlFor="backtest-strategy">
            <select
              className={inputClass}
              disabled={entries.length === 0 && saved.strategies.length === 0}
              id="backtest-strategy"
              onChange={(event) => selectTarget(event.target.value)}
              value={selectedTargetValue}
            >
              {entries.length === 0 && saved.strategies.length === 0 ? (
                <option value="">Loading strategies…</option>
              ) : (
                <>
                  {entries.length > 0 && (
                    <optgroup label="Inline strategies">
                      {entries.map((entry) => (
                        <option key={entry.id} value={`strategy:${entry.id}`}>
                          {formatStrategyType(entry.id)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {saved.strategies.length > 0 && (
                    <optgroup label="Saved Strategy Versions">
                      {saved.strategies.map((strategy) => (
                        <option
                          key={strategy.versionId}
                          value={`version:${strategy.versionId}`}
                        >
                          {strategy.name} · {savedStrategyType(strategy)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              )}
            </select>
          </Field>
          <Field label="Start date (UTC)" htmlFor="backtest-start-date">
            <input
              className={inputClass}
              id="backtest-start-date"
              onChange={(event) => setStartDate(event.target.value)}
              type="date"
              value={startDate}
            />
          </Field>
          <Field label="End date (UTC, exclusive)" htmlFor="backtest-end-date">
            <input
              className={inputClass}
              id="backtest-end-date"
              onChange={(event) => setEndDate(event.target.value)}
              type="date"
              value={endDate}
            />
          </Field>
          <Field
            label="Initial investment (USDT)"
            htmlFor="backtest-investment"
          >
            <input
              className={inputClass}
              id="backtest-investment"
              min="0"
              onChange={(event) => setInitialInvestment(event.target.value)}
              step="0.01"
              type="number"
              value={initialInvestment}
            />
          </Field>
          <Field
            label="Transaction cost (%)"
            htmlFor="backtest-transaction-cost"
          >
            <input
              className={inputClass}
              id="backtest-transaction-cost"
              min="0"
              onChange={(event) =>
                setTransactionCostPercent(event.target.value)
              }
              step="0.01"
              type="number"
              value={transactionCostPercent}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              0.08% = ratio 0.0008
            </p>
          </Field>
          <Field label="Slippage (bps)" htmlFor="backtest-slippage">
            <input
              className={inputClass}
              id="backtest-slippage"
              min="0"
              onChange={(event) => setSlippage(event.target.value)}
              step="1"
              type="number"
              value={slippage}
            />
          </Field>
        </div>

        {selectedSavedStrategy !== undefined ? (
          <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-800">
            Using saved immutable {savedStrategyType(selectedSavedStrategy)}{' '}
            <span className="font-semibold">{selectedSavedStrategy.name}</span>{' '}
            (version {selectedSavedStrategy.versionId.slice(0, 8)}).
          </div>
        ) : selectedEntry !== undefined ? (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {formatStrategyType(selectedEntry.id)} parameters
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <StrategyParameterFields
                definitions={selectedEntry.paramsSchema.properties}
                idPrefix="backtest-parameter"
                labelPrefix={formatStrategyType(selectedEntry.id)}
                onChange={(name, value) =>
                  setParameters((current) => ({ ...current, [name]: value }))
                }
                values={formParameters}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-7 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-5 text-slate-500">
            Backend sẽ tải dữ liệu qua Market Data Service, kiểm tra nến
            đóng/liền mạch và đưa công việc vào hàng đợi cho Backtest Worker.
          </p>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              submitting ||
              (selectedSavedStrategy === undefined &&
                (selectedEntry === undefined || resolvedParameters === null))
            }
            type="submit"
          >
            {submitting ? 'Submitting…' : 'Run Backtest'}
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </form>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <InfoTile
          title="Signal timing"
          text="Signal at candle close, fill at the next candle open."
        />
        <InfoTile
          title="Position model"
          text="One full-equity LONG or SHORT position at a time."
        />
        <InfoTile
          title="Data boundary"
          text="The selected range uses UTC start-inclusive, end-exclusive timestamps."
        />
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100';

function Field({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}

function InfoTile({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function savedStrategyType(strategy: SavedStrategy): string {
  return strategy.kind === 'composite'
    ? 'Composite Strategy'
    : formatStrategyType(strategy.strategyId);
}

function dateAtUtc(value: string): number {
  return new Date(`${value}T00:00:00.000Z`).getTime();
}
