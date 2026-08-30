'use client';

import type {
  CompositeStrategyRequest,
  SavedStrategy,
} from '@crypto-strategy-lab/shared';
import { formatStrategyType } from '@crypto-strategy-lab/shared/strategy';
import { BookMarked, CheckCircle2, Clock3, RadioTower } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { useSavedStrategies } from '../../strategies';
import { useStrategyCatalog } from '../../market-data/hooks/useStrategyCatalog';
import { ManualCompositeBuilder } from './ManualCompositeBuilder';
import { SingularStrategyBuilder } from './SingularStrategyBuilder';

export function DiscoveryDashboard() {
  const catalog = useStrategyCatalog();
  const saved = useSavedStrategies();
  const [draftComposite, setDraftComposite] =
    useState<CompositeStrategyRequest | null>(null);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
            Strategy Engine &amp; Loop Discovery
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Create a standalone strategy, combine strategy versions, and save
            the exact definitions you want to follow in Realtime.
          </p>
        </div>
        <StatusBadge tone="positive">
          <RadioTower aria-hidden="true" className="size-3.5" />
          Binance API + WebSocket
        </StatusBadge>
      </div>

      {saved.error !== null && (
        <div
          className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          {saved.error}
        </div>
      )}

      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(300px,0.78fr)_minmax(0,1.22fr)]">
        <SingularStrategyBuilder
          catalog={catalog}
          isSaving={saved.saving}
          onSave={saved.save}
        />
        <div>
          <ManualCompositeBuilder
            catalog={catalog}
            isSaving={saved.saving}
            onCompositeChange={setDraftComposite}
            onSave={saved.save}
          />
          <div className="mt-3 px-1 text-xs text-slate-400">
            {draftComposite === null
              ? 'Select at least two unique strategy versions to prepare a composite.'
              : 'Composite draft ready to save and reuse in Realtime.'}
          </div>
        </div>
      </div>

      <SavedStrategiesPanel
        loading={saved.loading}
        strategies={saved.strategies}
      />
    </div>
  );
}

function SavedStrategiesPanel({
  loading,
  strategies,
}: {
  loading: boolean;
  strategies: SavedStrategy[];
}) {
  return (
    <section
      aria-labelledby="saved-strategies-title"
      className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.5)] sm:p-5"
      data-testid="saved-strategies-panel"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BookMarked aria-hidden="true" className="size-5 text-indigo-600" />
          <h2
            className="text-lg font-semibold tracking-tight text-slate-950"
            id="saved-strategies-title"
          >
            Saved strategies
          </h2>
        </div>
        <Link
          className="text-sm font-semibold text-indigo-600 transition hover:text-indigo-800"
          href="/"
        >
          Open Realtime →
        </Link>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading saved strategies…</p>
      ) : strategies.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          Saved versions will appear here after you create them.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {strategies.map((strategy) => (
            <SavedStrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </div>
      )}
    </section>
  );
}

function SavedStrategyCard({ strategy }: { strategy: SavedStrategy }) {
  const typeLabel =
    strategy.kind === 'composite'
      ? 'Composite Strategy'
      : formatStrategyType(strategy.strategyId);
  const versionLabel = strategy.versionId.slice(0, 8);
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
          <CheckCircle2 aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">
            {strategy.name}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{typeLabel}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
        <Clock3 aria-hidden="true" className="size-3.5" />
        <span title={strategy.versionId}>Version {versionLabel}</span>
      </div>
    </article>
  );
}
