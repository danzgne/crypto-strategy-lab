'use client';

import type {
  CompositeStrategyMemberRequest,
  CompositeStrategyRequest,
  LibraryBuiltin,
  LibraryEntry,
} from '@crypto-strategy-lab/shared';
import {
  canonicalStrategyVersionId,
  formatStrategyType,
} from '@crypto-strategy-lab/shared/strategy';
import { useEffect, useMemo, useRef, useState } from 'react';

import { DefaultParamsEditor, strategyLibraryClient } from '../../strategies';
import { TagsInput } from '../../strategies/components/TagsInput';

export interface ManualCompositeBuilderProperties {
  builtins: readonly LibraryBuiltin[];
  entries: readonly LibraryEntry[];
  onCompositeChange?: (definition: CompositeStrategyRequest | null) => void;
  onSaved?: () => void;
}

interface EditableMember {
  key: string;
  strategyId: string;
  params: Record<string, unknown>;
  weight: string;
  fixed: boolean;
  label: string;
}

export function ManualCompositeBuilder({
  builtins,
  entries,
  onCompositeChange,
  onSaved,
}: ManualCompositeBuilderProperties) {
  const [members, setMembers] = useState<EditableMember[]>([]);
  const [threshold, setThreshold] = useState('0.3');
  const [pendingKey, setPendingKey] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [libraryVersion, setLibraryVersion] = useState('1.0.0');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const memberSequence = useRef(0);

  const pickerOptions = useMemo(
    () => [
      ...builtins.map((builtin) => ({
        key: `builtin:${builtin.strategyId}`,
        label: formatStrategyType(builtin.strategyId),
      })),
      ...entries
        .filter(
          (entry) => entry.kind === 'singular' && entry.archivedAt === null,
        )
        .map((entry) => ({
          key: `entry:${entry.id}`,
          label: `Saved · ${entry.name}`,
        })),
    ],
    [builtins, entries],
  );
  const existingTags = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.tags))],
    [entries],
  );

  const definition = useMemo(
    () => toCompositeDefinition(members, threshold),
    [members, threshold],
  );

  useEffect(() => {
    onCompositeChange?.(definition);
  }, [definition, onCompositeChange]);

  const addMember = (key: string): void => {
    if (key.length === 0) return;
    memberSequence.current += 1;
    const memberKey = `member-${memberSequence.current}`;
    if (key.startsWith('builtin:')) {
      const strategyId = key.slice('builtin:'.length);
      setMembers((current) => [
        ...current,
        {
          key: memberKey,
          strategyId,
          params: {},
          weight: '1',
          fixed: false,
          label: formatStrategyType(strategyId),
        },
      ]);
    } else if (key.startsWith('entry:')) {
      const entryId = key.slice('entry:'.length);
      const entry = entries.find((candidate) => candidate.id === entryId);
      if (entry !== undefined && entry.kind === 'singular') {
        setMembers((current) => [
          ...current,
          {
            key: memberKey,
            strategyId: entry.strategyId,
            params: entry.latestVersion.params ?? {},
            weight: '1',
            fixed: true,
            label: `Saved · ${entry.name}`,
          },
        ]);
      }
    }
    setPendingKey('');
  };

  const removeMember = (memberKey: string): void => {
    setMembers((current) =>
      current.filter((member) => member.key !== memberKey),
    );
  };

  const openSaveDialog = (): void => {
    setSaveError(null);
    setDialogOpen(true);
  };

  const save = async (): Promise<void> => {
    if (definition === null || name.trim().length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await strategyLibraryClient.create({
        name: name.trim(),
        tags,
        libraryVersion,
        source: 'MANUAL',
        strategyId: 'composite',
        composite: definition,
      });
      setDialogOpen(false);
      setName('');
      setTags([]);
      setLibraryVersion('1.0.0');
      setMembers([]);
      onSaved?.();
    } catch (reason: unknown) {
      setSaveError(reason instanceof Error ? reason.message : 'Unable to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="manual-composite-builder-title"
      className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.5)] sm:p-5"
      data-testid="manual-composite-builder"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-500">
            Manual composite builder
          </p>
          <h2
            className="mt-1 text-lg font-semibold tracking-tight text-slate-950"
            id="manual-composite-builder-title"
          >
            Composite Strategy
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            <span className="font-semibold text-slate-700">
              Weighted Voting
            </span>{' '}
            · Combine built-in and saved Strategy Versions into one live signal.
          </p>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <label
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"
            htmlFor="add-strategy-to-composite"
          >
            Add strategy
          </label>
          <select
            aria-label="Add strategy to composite"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            id="add-strategy-to-composite"
            onChange={(event) => {
              setPendingKey(event.target.value);
              addMember(event.target.value);
            }}
            value={pendingKey}
          >
            <option value="">Select a strategy…</option>
            {pickerOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"
            htmlFor="weighted-threshold"
          >
            Threshold
          </label>
          <input
            aria-label="Weighted threshold"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            id="weighted-threshold"
            max="1"
            min="0"
            onChange={(event) => setThreshold(event.target.value)}
            step="0.01"
            type="number"
            value={threshold}
          />
        </div>
      </div>

      {members.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          Select at least two strategies to activate the live composite.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {members.map((member) => (
            <article
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
              key={member.key}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  {member.label}
                </h3>
                <button
                  aria-label={`Remove ${member.label} from composite`}
                  className="text-xs font-semibold text-slate-400 transition hover:text-rose-600"
                  onClick={() => removeMember(member.key)}
                  type="button"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {member.fixed ? (
                  <p className="text-[11px] text-slate-500">
                    Using this entry&apos;s saved parameters as-is.
                  </p>
                ) : (
                  <DefaultParamsEditor
                    idPrefix={`composite-${member.key}`}
                    labelPrefix={member.label}
                    onChange={(params) =>
                      setMembers((current) =>
                        current.map((entry) =>
                          entry.key === member.key
                            ? { ...entry, params }
                            : entry,
                        ),
                      )
                    }
                    params={member.params}
                    paramsSchema={
                      builtins.find(
                        (builtin) => builtin.strategyId === member.strategyId,
                      )?.paramsSchema ?? { type: 'object', properties: {} }
                    }
                  />
                )}
                <div>
                  <label
                    className="mb-1 block text-[11px] font-medium text-slate-500"
                    htmlFor={`weight-${member.key}`}
                  >
                    Weight for {member.label}
                  </label>
                  <input
                    aria-label={`Weight for ${member.label}`}
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    id={`weight-${member.key}`}
                    min="0"
                    onChange={(event) =>
                      setMembers((current) =>
                        current.map((entry) =>
                          entry.key === member.key
                            ? { ...entry, weight: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    step="0.01"
                    type="number"
                    value={member.weight}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <button
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={definition === null}
          onClick={openSaveDialog}
          type="button"
        >
          Save composite strategy
        </button>
      </div>

      {dialogOpen && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">
              Save composite strategy
            </h3>
            <div className="mt-3 space-y-3">
              <div>
                <label
                  className="mb-1 block text-[11px] font-semibold text-slate-500"
                  htmlFor="composite-save-name"
                >
                  Name
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  id="composite-save-name"
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </div>
              <div>
                <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                  Tags
                </span>
                <TagsInput
                  onChange={setTags}
                  suggestions={existingTags}
                  value={tags}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-[11px] font-semibold text-slate-500"
                  htmlFor="composite-save-version"
                >
                  Library Version
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  id="composite-save-version"
                  onChange={(event) => setLibraryVersion(event.target.value)}
                  value={libraryVersion}
                />
              </div>
              {saveError !== null && (
                <p className="text-xs font-medium text-rose-600" role="alert">
                  {saveError}
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                onClick={() => setDialogOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={saving || name.trim().length === 0}
                onClick={() => void save()}
                type="button"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function toCompositeDefinition(
  members: readonly EditableMember[],
  thresholdText: string,
): CompositeStrategyRequest | null {
  if (members.length < 2) return null;
  const threshold = Number(thresholdText);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    return null;
  }

  const resolvedMembers: CompositeStrategyMemberRequest[] = [];
  const versionIds = new Set<string>();
  for (const member of members) {
    const weight = Number(member.weight);
    if (!Number.isFinite(weight) || weight < 0) return null;
    const versionId = canonicalStrategyVersionId(
      member.strategyId,
      member.params,
    );
    if (versionIds.has(versionId)) return null;
    versionIds.add(versionId);
    resolvedMembers.push({
      strategyId: member.strategyId,
      ...(Object.keys(member.params).length === 0
        ? {}
        : { params: member.params }),
      weight,
    });
  }

  return { mode: 'weighted', members: resolvedMembers, threshold };
}
