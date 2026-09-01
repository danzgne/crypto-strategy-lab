'use client';

import '../editors/registerBuiltinEditors';

import type { LibraryEntryDetail } from '@crypto-strategy-lab/shared';
import { formatStrategyType } from '@crypto-strategy-lab/shared/strategy';
import {
  Archive,
  ArchiveRestore,
  Copy,
  MoreVertical,
  Play,
  TestTubeDiagonal,
} from 'lucide-react';
import Link from 'next/link';
import { createElement, useMemo, useState } from 'react';

import { strategyLibraryClient } from '../api/strategyLibraryClient';
import { DefaultParamsEditor } from '../editors/DefaultParamsEditor';
import { StrategyEditorRegistry } from '../editors/StrategyEditorRegistry';
import { useLibraryEntry } from '../hooks/useLibraryEntry';
import { useStrategyLibrary } from '../hooks/useStrategyLibrary';
import { bumpPatchVersion } from '../libraryVersion';
import { TagsInput } from './TagsInput';

export function StrategyEntryDetail({ entryId }: { entryId: string }) {
  const { entry, error, loading, notFound, refresh } = useLibraryEntry(entryId);
  const library = useStrategyLibrary();
  const existingTags = useMemo(
    () => [...new Set(library.entries.flatMap((row) => row.tags))],
    [library.entries],
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [draftParams, setDraftParams] = useState<Record<string, unknown>>({});
  const [newLibraryVersion, setNewLibraryVersion] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [loadedEntry, setLoadedEntry] = useState<LibraryEntryDetail | null>(
    null,
  );

  if (entry !== null && entry !== loadedEntry) {
    setLoadedEntry(entry);
    setSelectedVersionId((current) => current ?? entry.latestVersion.id);
    setName(entry.name);
    setDescription(entry.description ?? '');
    setTags(entry.tags);
    setNewLibraryVersion(bumpPatchVersion(entry.latestVersion.libraryVersion));
  }

  const strategyId = entry?.strategyId;
  const kind = entry?.kind;
  const EditorComponent = useMemo(
    () =>
      kind === undefined || kind === 'composite' || strategyId === undefined
        ? null
        : StrategyEditorRegistry.resolve(strategyId, DefaultParamsEditor),
    [kind, strategyId],
  );
  const editorSchema = library.builtins.find(
    (builtin) => builtin.strategyId === strategyId,
  )?.paramsSchema ?? { type: 'object' as const, properties: {} };

  if (loading && entry === null) {
    return <p className="text-sm text-slate-500">Loading strategy…</p>;
  }
  if (notFound) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
        This strategy does not exist, or is not yours to view.
      </div>
    );
  }
  if (entry === null) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error ?? 'Unable to load this strategy.'}
      </div>
    );
  }

  const selectedVersion =
    entry.versions.find((version) => version.id === selectedVersionId) ??
    entry.latestVersion;
  const isLatest = selectedVersion.id === entry.latestVersion.id;
  const effectiveParams =
    Object.keys(draftParams).length === 0
      ? (selectedVersion.params ?? {})
      : draftParams;

  const saveMetadata = async (): Promise<void> => {
    setSavingMetadata(true);
    try {
      await strategyLibraryClient.updateMetadata(entry.id, {
        name: name.trim(),
        description: description.trim().length === 0 ? '' : description.trim(),
        tags,
      });
      void refresh();
    } finally {
      setSavingMetadata(false);
    }
  };

  const saveNewVersion = async (): Promise<void> => {
    if (newLibraryVersion.trim().length === 0) return;
    setSavingVersion(true);
    setVersionError(null);
    try {
      if (entry.kind === 'composite') {
        await strategyLibraryClient.addVersion(entry.id, {
          libraryVersion: newLibraryVersion.trim(),
          composite: selectedVersion.composite!,
        });
      } else {
        await strategyLibraryClient.addVersion(entry.id, {
          libraryVersion: newLibraryVersion.trim(),
          params: effectiveParams,
        });
      }
      setNewLibraryVersion('');
      void refresh();
    } catch (reason: unknown) {
      setVersionError(
        reason instanceof Error ? reason.message : 'Unable to save version',
      );
    } finally {
      setSavingVersion(false);
    }
  };

  const toggleArchive = async (): Promise<void> => {
    setArchiving(true);
    try {
      await strategyLibraryClient.archive(entry.id, {
        archived: entry.archivedAt === null,
      });
      void refresh();
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-500">
            {entry.kind === 'composite'
              ? 'Composite Strategy'
              : formatStrategyType(entry.strategyId)}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {entry.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
              {entry.source}
            </span>
            <span className="text-[11px] text-slate-400">
              Created {new Date(entry.createdAt).toLocaleString()}
            </span>
          </div>
          {entry.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {entry.tags.map((tag) => (
                <span
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {entry.archivedAt !== null && (
            <span className="mt-1 inline-block rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
              Archived
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {entry.kind === 'singular' && (
            <Link
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-200"
              href={`/strategies/new?fork=entry:${entry.id}`}
            >
              <Copy aria-hidden="true" className="size-3.5" /> Fork
            </Link>
          )}
          <Link
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            href={`/?strategyVersionId=${selectedVersion.id}`}
          >
            <Play aria-hidden="true" className="size-3.5" /> Run on chart
          </Link>
          <details className="relative">
            <summary
              aria-label="More actions"
              className="flex cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-indigo-200 [&::-webkit-details-marker]:hidden"
            >
              <MoreVertical aria-hidden="true" className="size-4" />
            </summary>
            <div className="absolute right-0 z-10 mt-1.5 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
              <Link
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                href={`/backtests?strategyVersionId=${selectedVersion.id}`}
              >
                <TestTubeDiagonal aria-hidden="true" className="size-3.5" />
                Backtest
              </Link>
              <button
                className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                disabled={archiving}
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
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.5)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Metadata
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  className="mb-1 block text-[11px] font-medium text-slate-500"
                  htmlFor="entry-name"
                >
                  Name
                </label>
                <input
                  className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                  id="entry-name"
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500">
                  Tags
                </span>
                <TagsInput
                  onChange={setTags}
                  suggestions={existingTags}
                  value={tags}
                />
              </div>
            </div>
            <div className="mt-3">
              <label
                className="mb-1 block text-[11px] font-medium text-slate-500"
                htmlFor="entry-description"
              >
                Description
              </label>
              <textarea
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                id="entry-description"
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                value={description}
              />
            </div>
            <button
              className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
              disabled={savingMetadata}
              onClick={() => void saveMetadata()}
              type="button"
            >
              {savingMetadata ? 'Saving…' : 'Save metadata'}
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.5)]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Editor{' '}
                {!isLatest && (
                  <span className="text-amber-600">
                    (viewing v{selectedVersion.libraryVersion}, not latest)
                  </span>
                )}
              </p>
            </div>
            <div className="mt-3">
              {entry.kind === 'composite' || EditorComponent === null ? (
                <CompositeReadOnlySummary
                  composite={selectedVersion.composite!}
                />
              ) : (
                createElement(EditorComponent, {
                  idPrefix: `entry-${entry.id}`,
                  onChange: setDraftParams,
                  params: effectiveParams,
                  paramsSchema: editorSchema,
                })
              )}
            </div>

            {entry.kind !== 'composite' && (
              <div className="mt-4 flex items-end gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                <div className="min-w-0 flex-1">
                  <label
                    className="mb-1 block text-[11px] font-semibold text-indigo-700"
                    htmlFor="new-library-version"
                  >
                    Save as new Library Version
                  </label>
                  <input
                    className="w-full rounded-md border border-indigo-100 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
                    id="new-library-version"
                    onChange={(event) =>
                      setNewLibraryVersion(event.target.value)
                    }
                    placeholder="e.g. 1.1.0"
                    value={newLibraryVersion}
                  />
                </div>
                <button
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    savingVersion || newLibraryVersion.trim().length === 0
                  }
                  onClick={() => void saveNewVersion()}
                  type="button"
                >
                  {savingVersion ? 'Saving…' : 'Save version'}
                </button>
              </div>
            )}
            {versionError !== null && (
              <p
                className="mt-2 text-xs font-medium text-rose-600"
                role="alert"
              >
                {versionError}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-slate-100">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              JSON (read-only)
            </p>
            <pre className="mt-3 overflow-x-auto text-xs leading-5">
              {JSON.stringify(
                selectedVersion.composite ?? selectedVersion.params,
                null,
                2,
              )}
            </pre>
          </section>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Version history
          </p>
          <ul className="mt-3 space-y-1.5">
            {[...entry.versions].reverse().map((version) => (
              <li key={version.id}>
                <button
                  className={`w-full rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                    version.id === selectedVersion.id
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'
                  }`}
                  onClick={() => {
                    setSelectedVersionId(version.id);
                    setDraftParams({});
                  }}
                  type="button"
                >
                  <span className="block font-semibold">
                    v{version.libraryVersion}
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    {new Date(version.createdAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function CompositeReadOnlySummary({
  composite,
}: {
  composite: {
    mode: string;
    threshold?: number;
    members: readonly { strategyId: string; weight?: number }[];
  };
}) {
  return (
    <div className="space-y-1.5 text-xs text-slate-600">
      <p>
        Mode: <span className="font-semibold">{composite.mode}</span>
        {composite.threshold !== undefined &&
          ` · Threshold ${composite.threshold}`}
      </p>
      <ul className="space-y-1">
        {composite.members.map((member, index) => (
          <li className="rounded-lg bg-slate-50 px-2.5 py-1.5" key={index}>
            {formatStrategyType(member.strategyId)}
            {member.weight !== undefined &&
              ` · weight ${member.weight.toFixed(2)}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
