'use client';

import type {
  CompositeStrategyMemberRequest,
  CompositeStrategyRequest,
  SaveStrategyRequest,
  StrategyCatalog,
} from '@crypto-strategy-lab/shared';
import { formatStrategyType } from '@crypto-strategy-lab/shared/strategy';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  catalogEntries,
  createDefaultParameterValues,
  resolveParameters,
  strategyVersionKey,
} from '../strategyForm';
import { StrategyParameterFields } from './StrategyParameterFields';

export interface ManualCompositeBuilderProperties {
  catalog: StrategyCatalog;
  onCompositeChange: (definition: CompositeStrategyRequest | null) => void;
  onSave?: (request: SaveStrategyRequest) => Promise<unknown> | void;
  isSaving?: boolean;
}

interface EditableMember {
  key: string;
  strategyId: string;
  params: Record<string, string>;
  weight: string;
}

export function ManualCompositeBuilder({
  catalog,
  isSaving = false,
  onCompositeChange,
  onSave,
}: ManualCompositeBuilderProperties) {
  const entries = useMemo(() => catalogEntries(catalog), [catalog]);
  const [members, setMembers] = useState<EditableMember[]>([]);
  const [threshold, setThreshold] = useState('0.3');
  const [pendingStrategyId, setPendingStrategyId] = useState('');
  const [name, setName] = useState('');
  const memberSequence = useRef(0);
  const uniqueMemberCount = useMemo(
    () => countUniqueVersions(members, entries),
    [entries, members],
  );

  const definition = useMemo(
    () => toCompositeDefinition(members, threshold, entries),
    [entries, members, threshold],
  );

  useEffect(() => {
    onCompositeChange(definition);
  }, [definition, onCompositeChange]);

  const addMember = (strategyId: string): void => {
    if (strategyId.length === 0) return;
    const entry = entries.find(({ id }) => id === strategyId);
    const memberKey = `member-${memberSequence.current}`;
    memberSequence.current += 1;
    setMembers((current) => {
      return [
        ...current,
        createEditableMember(
          entry ?? {
            id: strategyId,
            paramsSchema: { type: 'object', properties: {} },
          },
          memberKey,
        ),
      ];
    });
    setPendingStrategyId('');
  };

  const removeMember = (memberKey: string): void => {
    setMembers((current) =>
      current.filter((member) => member.key !== memberKey),
    );
  };

  const updateMember = (
    memberKey: string,
    update: (member: EditableMember) => EditableMember,
  ): void => {
    setMembers((current) =>
      current.map((member) =>
        member.key === memberKey ? update(member) : member,
      ),
    );
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
            · Combine enabled Strategy Versions into one live signal. Weights
            are normalized when the Composite Strategy is assembled.
          </p>
        </div>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
          {uniqueMemberCount}{' '}
          {uniqueMemberCount === 1 ? 'unique member' : 'unique members'}
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
              const strategyId = event.target.value;
              setPendingStrategyId(strategyId);
              addMember(strategyId);
            }}
            value={pendingStrategyId}
          >
            <option value="">Select a strategy…</option>
            {entries.map(({ id }) => (
              <option key={id} value={id}>
                {formatStrategyType(id)}
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
          <p className="mt-1 text-[11px] text-slate-400">
            Default 0.3 · range 0–1
          </p>
        </div>
      </div>

      {members.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          Select at least two strategies to activate the live composite.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {members.map((member) => {
            const entry = entries.find(({ id }) => id === member.strategyId);
            const strategyName = formatStrategyType(member.strategyId);
            return (
              <article
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                key={member.key}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {strategyName}
                  </h3>
                  <button
                    aria-label={`Remove ${strategyName} from composite`}
                    className="text-xs font-semibold text-slate-400 transition hover:text-rose-600"
                    onClick={() => removeMember(member.key)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <StrategyParameterFields
                    definitions={entry?.paramsSchema.properties ?? {}}
                    idPrefix={`parameter-${member.key}`}
                    labelPrefix={strategyName}
                    onChange={(parameterName, value) =>
                      updateMember(member.key, (current) => ({
                        ...current,
                        params: {
                          ...current.params,
                          [parameterName]: value,
                        },
                      }))
                    }
                    values={member.params}
                  />
                  <div>
                    <label
                      className="mb-1 block text-[11px] font-medium text-slate-500"
                      htmlFor={`weight-${member.key}`}
                    >
                      Weight for {strategyName}
                    </label>
                    <input
                      aria-label={`Weight for ${strategyName}`}
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      id={`weight-${member.key}`}
                      min="0"
                      onChange={(event) =>
                        updateMember(member.key, (current) => ({
                          ...current,
                          weight: event.target.value,
                        }))
                      }
                      step="0.01"
                      type="number"
                      value={member.weight}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {onSave !== undefined && (
        <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 sm:flex sm:items-end sm:gap-3">
          <div className="min-w-0 flex-1">
            <label
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700"
              htmlFor="composite-strategy-name"
            >
              Strategy name
            </label>
            <input
              aria-label="Composite strategy name"
              className="w-full rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              id="composite-strategy-name"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Momentum confirmation"
              type="text"
              value={name}
            />
          </div>
          <button
            className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-0 sm:w-auto"
            disabled={definition === null || isSaving}
            onClick={() => {
              if (definition === null) return;
              void onSave({
                composite: definition,
                name: name.trim() || 'Composite Strategy',
                strategyId: 'composite',
              });
            }}
            type="button"
          >
            {isSaving ? 'Saving…' : 'Save composite strategy'}
          </button>
        </div>
      )}
    </section>
  );
}

function createEditableMember(
  entry: ReturnType<typeof catalogEntries>[number],
  key: string,
): EditableMember {
  const params = createDefaultParameterValues(entry);
  return { key, strategyId: entry.id, params, weight: '1' };
}

function toCompositeDefinition(
  members: readonly EditableMember[],
  thresholdText: string,
  entries: readonly ReturnType<typeof catalogEntries>[number][],
): CompositeStrategyRequest | null {
  if (members.length < 2) return null;
  const threshold = Number(thresholdText);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    return null;
  }

  const resolvedMembers: CompositeStrategyMemberRequest[] = [];
  const versionIds = new Set<string>();
  for (const member of members) {
    const entry = entries.find(({ id }) => id === member.strategyId);
    const params = resolveParameters(member.params, entry);
    const weight = Number(member.weight);
    if (params === null || !Number.isFinite(weight) || weight < 0) {
      return null;
    }
    const versionId = strategyVersionKey(member.strategyId, params, entry);
    if (versionIds.has(versionId)) return null;
    versionIds.add(versionId);
    resolvedMembers.push({
      strategyId: member.strategyId,
      ...(Object.keys(params).length === 0 ? {} : { params }),
      weight,
    });
  }

  return { mode: 'weighted', members: resolvedMembers, threshold };
}

function countUniqueVersions(
  members: readonly EditableMember[],
  entries: readonly ReturnType<typeof catalogEntries>[number][],
): number {
  const versionIds = new Set<string>();
  for (const member of members) {
    const entry = entries.find(({ id }) => id === member.strategyId);
    const params = resolveParameters(member.params, entry);
    if (params === null) continue;
    versionIds.add(strategyVersionKey(member.strategyId, params, entry));
  }
  return versionIds.size;
}
