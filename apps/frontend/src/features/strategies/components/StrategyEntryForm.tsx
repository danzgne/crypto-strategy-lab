'use client';

import type { CreateSingularLibraryEntryRequest } from '@crypto-strategy-lab/shared';
import { formatStrategyType } from '@crypto-strategy-lab/shared/strategy';
import { useRouter, useSearchParams } from 'next/navigation';
import { createElement, useMemo, useState } from 'react';

import { strategyLibraryClient } from '../api/strategyLibraryClient';
import { DefaultParamsEditor } from '../editors/DefaultParamsEditor';
import { StrategyEditorRegistry } from '../editors/StrategyEditorRegistry';
import { emptyRuleParams } from '../editors/ruleEditorModel';
import { useStrategyLibrary } from '../hooks/useStrategyLibrary';
import { TagsInput } from './TagsInput';

const RULE_STRATEGY_OPTION = { strategyId: 'rule', label: 'Rule Strategy' };

export function StrategyEntryForm() {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const library = useStrategyLibrary();
  const forkKey = searchParameters.get('fork');

  const strategyOptions = useMemo(
    () => [
      ...library.builtins.map((builtin) => ({
        strategyId: builtin.strategyId,
        label: formatStrategyType(builtin.strategyId),
      })),
      RULE_STRATEGY_OPTION,
    ],
    [library.builtins],
  );
  const existingTags = useMemo(
    () => [...new Set(library.entries.flatMap((entry) => entry.tags))],
    [library.entries],
  );

  const [strategyId, setStrategyId] = useState('');
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [libraryVersion, setLibraryVersion] = useState('1.0.0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  if (!prefilled && forkKey !== null && library.builtins.length > 0) {
    if (forkKey.startsWith('builtin:')) {
      const builtinId = forkKey.slice('builtin:'.length);
      const builtin = library.builtins.find((b) => b.strategyId === builtinId);
      if (builtin !== undefined) {
        setStrategyId(builtinId);
        setParams({});
        setName(`${formatStrategyType(builtinId)} (my copy)`);
      }
    }
    setPrefilled(true);
  }

  const selectedSchema =
    strategyId === 'rule'
      ? { type: 'object' as const, properties: {} }
      : (library.builtins.find((b) => b.strategyId === strategyId)
          ?.paramsSchema ?? { type: 'object' as const, properties: {} });
  const EditorComponent = useMemo(
    () => StrategyEditorRegistry.resolve(strategyId, DefaultParamsEditor),
    [strategyId],
  );

  const selectStrategy = (nextStrategyId: string): void => {
    setStrategyId(nextStrategyId);
    setParams(
      nextStrategyId === 'rule'
        ? (emptyRuleParams() as unknown as Record<string, unknown>)
        : {},
    );
  };

  const submit = async (): Promise<void> => {
    if (strategyId.length === 0 || name.trim().length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const request: CreateSingularLibraryEntryRequest = {
        name: name.trim(),
        ...(description.trim().length === 0
          ? {}
          : { description: description.trim() }),
        tags,
        libraryVersion,
        source: 'MANUAL',
        strategyId,
        params,
      };
      const entry = await strategyLibraryClient.create(request);
      router.push(`/strategies/${entry.id}`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          New strategy
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a strategy plugin and configure it with the constrained form
          below. Nothing is saved until you name it and press Save.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.5)]">
        <label
          className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"
          htmlFor="new-strategy-id"
        >
          Strategy
        </label>
        <select
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          id="new-strategy-id"
          onChange={(event) => selectStrategy(event.target.value)}
          value={strategyId}
        >
          <option value="">Select a strategy…</option>
          {strategyOptions.map((option) => (
            <option key={option.strategyId} value={option.strategyId}>
              {option.label}
            </option>
          ))}
        </select>

        {strategyId.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            {createElement(EditorComponent, {
              idPrefix: 'new-strategy',
              onChange: setParams,
              params,
              paramsSchema: selectedSchema,
            })}
          </div>
        )}
      </section>

      {strategyId.length > 0 && (
        <section className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700"
                htmlFor="new-strategy-name"
              >
                Name
              </label>
              <input
                className="w-full rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                id="new-strategy-name"
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
                type="text"
                value={name}
              />
            </div>
            <div>
              <label
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700"
                htmlFor="new-strategy-library-version"
              >
                Library Version
              </label>
              <input
                className="w-full rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                id="new-strategy-library-version"
                onChange={(event) => setLibraryVersion(event.target.value)}
                placeholder="1.0.0"
                type="text"
                value={libraryVersion}
              />
            </div>
          </div>
          <div className="mt-3">
            <label
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700"
              htmlFor="new-strategy-description"
            >
              Description
            </label>
            <textarea
              className="w-full rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              id="new-strategy-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              value={description}
            />
          </div>
          <div className="mt-3">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
              Tags
            </span>
            <TagsInput
              onChange={setTags}
              suggestions={existingTags}
              value={tags}
            />
          </div>

          {error !== null && (
            <p className="mt-3 text-xs font-medium text-rose-600" role="alert">
              {error}
            </p>
          )}

          <button
            className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={saving || name.trim().length === 0}
            onClick={() => void submit()}
            type="button"
          >
            {saving ? 'Saving…' : 'Save strategy'}
          </button>
        </section>
      )}
    </div>
  );
}
