'use client';

import type { LibraryBuiltin, LibraryEntry } from '@crypto-strategy-lab/shared';
import { formatStrategyType } from '@crypto-strategy-lab/shared/strategy';
import {
  Archive,
  ArchiveRestore,
  BookMarked,
  Compass,
  Copy,
  Layers,
  MoreVertical,
  Play,
  Plus,
  TestTubeDiagonal,
  Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { LeaderboardPanel } from '../../leaderboard';
import {
  DiscoveryProgressCard,
  DiscoveryRunHistoryTable,
  DiscoverySessionControl,
  useDiscoverySession,
} from '../../search';
import { strategyLibraryClient, useStrategyLibrary } from '../../strategies';
import { ManualCompositeBuilder } from './ManualCompositeBuilder';

type DashboardTab = 'discover' | 'manual' | 'library' | 'leaderboard';

const TABS: ReadonlyArray<{
  id: DashboardTab;
  label: string;
  icon: typeof Compass;
}> = [
  { id: 'discover', label: 'Auto Discovery', icon: Compass },
  { id: 'manual', label: 'Manual Build', icon: Layers },
  { id: 'library', label: 'Library', icon: BookMarked },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
];

export function DiscoveryDashboard() {
  const library = useStrategyLibrary();
  const discovery = useDiscoverySession();
  const [activeTab, setActiveTab] = useState<DashboardTab>('discover');

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
        Composition workspace
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
        Strategy Workbench
      </h1>

      {library.error !== null && (
        <div
          className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          {library.error}
        </div>
      )}

      {discovery.error !== null && (
        <div
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          {discovery.error}
        </div>
      )}

      <div
        aria-label="Strategy Workbench sections"
        className="mt-7 inline-flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
        role="tablist"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            aria-selected={activeTab === id}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === id
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-100'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            key={id}
            onClick={() => setActiveTab(id)}
            role="tab"
            type="button"
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'discover' && (
        <div role="tabpanel">
          <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
            <DiscoverySessionControl
              builtins={library.builtins}
              discovery={discovery}
              entries={library.entries.filter(
                (entry) => entry.archivedAt === null,
              )}
              libraryLoading={library.loading}
            />
            <DiscoveryProgressCard discovery={discovery} />
          </div>

          <DiscoveryRunHistoryTable discovery={discovery} />
        </div>
      )}

      {activeTab === 'manual' && (
        <div className="mt-7" role="tabpanel">
          <ManualCompositeBuilder
            builtins={library.builtins}
            entries={library.entries}
            onSaved={library.refresh}
          />
        </div>
      )}

      {activeTab === 'library' && (
        <div role="tabpanel">
          <BuiltinsSection builtins={library.builtins} />

          <EntriesSection
            entries={library.entries}
            hasMore={library.hasMore}
            loading={library.loading}
            loadingMore={library.loadingMore}
            onArchiveChanged={library.refresh}
            onLoadMore={library.loadMore}
            setShowArchived={library.setShowArchived}
            showArchived={library.showArchived}
          />
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <div role="tabpanel">
          <LeaderboardPanel />
        </div>
      )}
    </div>
  );
}

function BuiltinsSection({
  builtins,
}: {
  builtins: readonly LibraryBuiltin[];
}) {
  return (
    <section
      aria-labelledby="builtin-strategies-title"
      className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.5)] sm:p-5"
    >
      <div className="flex items-center gap-2">
        <BookMarked aria-hidden="true" className="size-5 text-slate-500" />
        <h2
          className="text-lg font-semibold tracking-tight text-slate-950"
          id="builtin-strategies-title"
        >
          Built-in strategies
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
          Read-only
        </span>
      </div>

      {builtins.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {builtins.map((builtin) => (
            <article
              className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
              key={builtin.strategyId}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  {formatStrategyType(builtin.strategyId)}
                </h3>
                <Link
                  className="flex items-center gap-1 text-xs font-semibold text-indigo-600 transition hover:text-indigo-800"
                  href={`/strategies/new?fork=builtin:${builtin.strategyId}`}
                >
                  <Copy aria-hidden="true" className="size-3.5" /> Save as my
                  strategy
                </Link>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                {Object.keys(builtin.paramsSchema.properties).length}{' '}
                configurable parameter
                {Object.keys(builtin.paramsSchema.properties).length === 1
                  ? ''
                  : 's'}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EntriesSection({
  entries,
  hasMore,
  loading,
  loadingMore,
  onArchiveChanged,
  onLoadMore,
  setShowArchived,
  showArchived,
}: {
  entries: readonly LibraryEntry[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  onArchiveChanged: () => void;
  onLoadMore: () => void;
  setShowArchived: (value: boolean) => void;
  showArchived: boolean;
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
            My strategies
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <input
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              type="checkbox"
            />
            Show archived
          </label>
          <Link
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            href="/strategies/new"
          >
            <Plus aria-hidden="true" className="size-3.5" /> New strategy
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading saved strategies…</p>
      ) : entries.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          Saved versions will appear here after you create them.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <EntryCard
              entry={entry}
              key={entry.id}
              onArchiveChanged={onArchiveChanged}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 disabled:opacity-50"
            disabled={loadingMore}
            onClick={onLoadMore}
            type="button"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </section>
  );
}

function EntryCard({
  entry,
  onArchiveChanged,
}: {
  entry: LibraryEntry;
  onArchiveChanged: () => void;
}) {
  const typeLabel =
    entry.kind === 'composite'
      ? 'Composite Strategy'
      : formatStrategyType(entry.strategyId);

  const toggleArchive = async (): Promise<void> => {
    await strategyLibraryClient.archive(entry.id, {
      archived: entry.archivedAt === null,
    });
    onArchiveChanged();
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <Link
          className="min-w-0 text-sm font-semibold text-slate-900 hover:text-indigo-700"
          href={`/strategies/${entry.id}`}
        >
          <span className="block truncate">{entry.name}</span>
        </Link>
        {entry.archivedAt !== null && (
          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            Archived
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">{typeLabel}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
          {entry.source}
        </span>
        <span className="text-[11px] text-slate-400">
          v{entry.latestVersion.libraryVersion}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <Link
          aria-label={`Run ${entry.name} on chart`}
          className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-700"
          href={`/?strategyVersionId=${entry.latestVersion.id}`}
        >
          <Play aria-hidden="true" className="size-3" /> Run
        </Link>
        <details className="relative ml-auto">
          <summary
            aria-label={`More actions for ${entry.name}`}
            className="flex cursor-pointer list-none items-center justify-center rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition hover:border-indigo-200 [&::-webkit-details-marker]:hidden"
          >
            <MoreVertical aria-hidden="true" className="size-3.5" />
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            <Link
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
              href={`/backtests?strategyVersionId=${entry.latestVersion.id}`}
            >
              <TestTubeDiagonal aria-hidden="true" className="size-3.5" />
              Backtest
            </Link>
            <button
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => void toggleArchive()}
              type="button"
            >
              {entry.archivedAt === null ? (
                <>
                  <Archive aria-hidden="true" className="size-3.5" /> Archive
                </>
              ) : (
                <>
                  <ArchiveRestore aria-hidden="true" className="size-3.5" />
                  Unarchive
                </>
              )}
            </button>
          </div>
        </details>
      </div>
    </article>
  );
}
