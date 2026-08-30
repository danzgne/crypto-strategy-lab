'use client';

import type {
  SaveStrategyRequest,
  StrategyCatalog,
  StrategyCatalogEntry,
} from '@crypto-strategy-lab/shared';
import { formatStrategyType } from '@crypto-strategy-lab/shared/strategy';
import { ArrowRight, BarChart3, Gauge, LineChart, Waves } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  catalogEntries,
  createDefaultParameterValues,
  resolveParameters,
} from '../strategyForm';
import { StrategyParameterFields } from './StrategyParameterFields';

export interface SingularStrategyBuilderProperties {
  catalog: StrategyCatalog;
  onSave: (request: SaveStrategyRequest) => Promise<unknown> | void;
  isSaving?: boolean;
}

const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  bb: 'Detect volatility bands and price reversion.',
  ma: 'Follow trend direction with moving averages.',
  rsi: 'Measure momentum and overbought or oversold zones.',
  smc: 'Read market structure and liquidity behavior.',
  sr: 'Identify important support and resistance levels.',
  wyckoff: 'Recognize accumulation and distribution phases.',
};

const STRATEGY_ICONS = [LineChart, Waves, BarChart3, Gauge] as const;

export function SingularStrategyBuilder({
  catalog,
  isSaving = false,
  onSave,
}: SingularStrategyBuilderProperties) {
  const entries = useMemo(() => catalogEntries(catalog), [catalog]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const selectedEntry =
    entries.find(({ id }) => id === selectedStrategyId) ?? entries[0];
  const formParams = useMemo(
    () =>
      selectedEntry === undefined
        ? params
        : { ...createDefaultParameterValues(selectedEntry), ...params },
    [params, selectedEntry],
  );
  const resolvedParams = useMemo(
    () => resolveParameters(formParams, selectedEntry),
    [formParams, selectedEntry],
  );

  const selectStrategy = (entry: StrategyCatalogEntry): void => {
    setSelectedStrategyId(entry.id);
    setParams(createDefaultParameterValues(entry));
  };

  const submit = (): void => {
    if (selectedEntry === undefined || resolvedParams === null) {
      return;
    }
    const strategyName =
      name.trim() || `${formatStrategyType(selectedEntry.id)} strategy`;
    void onSave({
      name: strategyName,
      ...(Object.keys(resolvedParams).length === 0
        ? {}
        : { params: resolvedParams }),
      strategyId: selectedEntry.id,
    });
  };

  return (
    <section
      aria-labelledby="singular-strategy-title"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.5)] sm:p-5"
      data-testid="singular-strategy-builder"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-500">
          Strategy Engine
        </p>
        <h2
          className="mt-1 text-xl font-semibold tracking-tight text-slate-950"
          id="singular-strategy-title"
        >
          Singular Strategy
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Create a reusable version from one of the available strategy plugins.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
          Loading available strategy plugins…
        </p>
      ) : (
        <>
          <div className="mt-5 space-y-2">
            {entries.map((entry, index) => {
              const Icon =
                STRATEGY_ICONS[index % STRATEGY_ICONS.length] ?? LineChart;
              const isSelected = entry.id === selectedEntry?.id;
              return (
                <button
                  aria-label={`Select ${formatStrategyType(entry.id)} strategy`}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? 'border-indigo-300 bg-indigo-50/70 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                  }`}
                  key={entry.id}
                  onClick={() => selectStrategy(entry)}
                  type="button"
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                      isSelected
                        ? 'bg-indigo-100 text-indigo-600'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">
                      {formatStrategyType(entry.id)}
                    </span>
                    <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                      {STRATEGY_DESCRIPTIONS[entry.id] ??
                        'Use this strategy plugin as a standalone signal.'}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className={`size-4 shrink-0 ${
                      isSelected ? 'text-indigo-600' : 'text-slate-400'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {selectedEntry !== undefined && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                {formatStrategyType(selectedEntry.id)} parameters
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <StrategyParameterFields
                  definitions={selectedEntry.paramsSchema.properties}
                  idPrefix="singular-parameter"
                  labelPrefix={formatStrategyType(selectedEntry.id)}
                  onChange={(parameterName, value) =>
                    setParams((current) => ({
                      ...current,
                      [parameterName]: value,
                    }))
                  }
                  values={formParams}
                />
              </div>
              <div className="mt-4">
                <label
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700"
                  htmlFor="singular-strategy-name"
                >
                  Strategy name
                </label>
                <input
                  aria-label="Singular strategy name"
                  className="w-full rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  id="singular-strategy-name"
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={`e.g. ${formatStrategyType(selectedEntry.id)} trend`}
                  type="text"
                  value={name}
                />
              </div>
              <button
                className="mt-3 w-full rounded-lg border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={resolvedParams === null || isSaving}
                onClick={submit}
                type="button"
              >
                {isSaving ? 'Saving…' : 'Save singular strategy'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
