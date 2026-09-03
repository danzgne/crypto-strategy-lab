'use client';

import { TIMEFRAME_INTERVAL_MS } from '@crypto-strategy-lab/shared/market-data';
import type { Pair, Timeframe } from '@crypto-strategy-lab/shared/market-data';
import {
  isVersionMember,
  RANDOM_SEARCH_ALGORITHM_ID,
} from '@crypto-strategy-lab/shared/search';
import type { EnabledStrategyDescriptor } from '@crypto-strategy-lab/shared/search';
import { pairMatchesRuleApplicability } from '@crypto-strategy-lab/shared/strategy';
import type {
  LibraryBuiltin,
  LibraryEntry,
  RuleApplicability,
} from '@crypto-strategy-lab/shared/strategy';
import {
  Sparkles,
  Play,
  Pause,
  Square,
  Dna,
  Compass,
  Shuffle,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { UseDiscoverySessionResult } from '../hooks/useDiscoverySession';

const AVAILABLE_PAIRS: Pair[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
const AVAILABLE_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const DISCOVERY_CONFIG_STORAGE_KEY =
  'crypto-strategy-lab:discovery-form-config:v2';
const DEFAULT_SELECTED_STRATEGIES = [
  'builtin:ma',
  'builtin:rsi',
  'builtin:bb',
  'builtin:sr',
];

interface StoredDiscoveryConfig {
  pair?: Pair;
  timeframe?: Timeframe;
  strategies?: string[];
  modes?: ('majority' | 'weighted')[];
  maxCandidates?: number;
  timeBudgetMinutes?: number;
}

function getStoredConfig(): StoredDiscoveryConfig {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(DISCOVERY_CONFIG_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as StoredDiscoveryConfig) : {};
  } catch {
    return {};
  }
}

function builtinOptionId(strategyId: string): string {
  return `builtin:${strategyId}`;
}

function entryOptionId(entryId: string): string {
  return `entry:${entryId}`;
}

// Never fires: the client snapshot (`true`) is a static value, so there's nothing to
// resubscribe to. useSyncExternalStore is only used here for its getServerSnapshot split,
// the React-sanctioned way to read "is this the hydrated client render yet?".
function subscribeNever() {
  return () => {};
}
function getClientMountedSnapshot() {
  return true;
}
function getServerMountedSnapshot() {
  return false;
}

function builtinDisabledReason(builtin: LibraryBuiltin): string | null {
  return builtin.liveOnly === true
    ? 'Live only — preview it on the realtime chart instead'
    : null;
}

function entryApplicabilityReason(
  entry: LibraryEntry,
  pair: Pair,
  timeframe: Timeframe,
): string | null {
  const params = entry.latestVersion.params;
  if (!params) return null;

  const declaredTimeframe = params.timeframe;
  if (
    typeof declaredTimeframe === 'string' &&
    declaredTimeframe !== timeframe
  ) {
    return `Only applies to ${declaredTimeframe}`;
  }

  const applicability = params.applicability as RuleApplicability | undefined;
  return pairMatchesRuleApplicability(pair, applicability)
    ? null
    : `Not available for ${pair}`;
}

function libraryEntryDisabledReason(
  entry: LibraryEntry,
  builtins: readonly LibraryBuiltin[],
  pair: Pair,
  timeframe: Timeframe,
): string | null {
  if (entry.kind === 'composite') {
    return "Composite entries can't be added to a Search Space yet";
  }
  const builtin = builtins.find((b) => b.strategyId === entry.strategyId);
  const builtinReason = builtin ? builtinDisabledReason(builtin) : null;
  return builtinReason ?? entryApplicabilityReason(entry, pair, timeframe);
}

interface DiscoverySessionControlProps {
  builtins: readonly LibraryBuiltin[];
  entries: readonly LibraryEntry[];
  libraryLoading: boolean;
  discovery: UseDiscoverySessionResult;
}

export function DiscoverySessionControl({
  builtins,
  entries,
  libraryLoading,
  discovery,
}: DiscoverySessionControlProps) {
  const mounted = useSyncExternalStore(
    subscribeNever,
    getClientMountedSnapshot,
    getServerMountedSnapshot,
  );

  const [selectedPair, setSelectedPair] = useState<Pair>(
    () => discovery.session?.searchSpace.pair ?? 'BTCUSDT',
  );
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>(
    () => discovery.session?.searchSpace.timeframe ?? '1h',
  );
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(() => [
    ...DEFAULT_SELECTED_STRATEGIES,
  ]);
  const [permittedModes, setPermittedModes] = useState<
    ('majority' | 'weighted')[]
  >(() => ['majority', 'weighted']);
  const [maxCandidates, setMaxCandidates] = useState<number>(100);
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState<number>(15);
  const [libraryFilter, setLibraryFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSessionActive = discovery.session?.status === 'ACTIVE';
  const isSessionPaused = discovery.session?.status === 'PAUSED';
  const isSessionRunning = isSessionActive || isSessionPaused;

  // Storage is only ever read here, once, after mount: an initializer above would run during SSR
  // and during the client's first (pre-hydration) render with different `typeof window` results,
  // producing a server/client text mismatch. Waiting for the Library to load too means a stored
  // selection is validated against real ids instead of restored blind (see ADR-0028 / issue #103).
  const appliedStoredConfigRef = useRef(false);
  useEffect(() => {
    if (appliedStoredConfigRef.current) return;
    if (!mounted || libraryLoading || isSessionRunning) return;
    appliedStoredConfigRef.current = true;

    // One-time sync from an external system (localStorage) into form state, guarded above so it
    // can never re-fire: not the "derive during render" case react-hooks/set-state-in-effect wants.
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = getStoredConfig();
    if (stored.pair && AVAILABLE_PAIRS.includes(stored.pair)) {
      setSelectedPair(stored.pair);
    }
    if (stored.timeframe && AVAILABLE_TIMEFRAMES.includes(stored.timeframe)) {
      setSelectedTimeframe(stored.timeframe);
    }
    if (Array.isArray(stored.strategies)) {
      const validIds = new Set([
        ...builtins.map((b) => builtinOptionId(b.strategyId)),
        ...entries
          .filter((e) => e.archivedAt === null)
          .map((e) => entryOptionId(e.id)),
      ]);
      const restored = stored.strategies.filter((id) => validIds.has(id));
      if (restored.length > 0) setSelectedStrategies(restored);
    }
    if (Array.isArray(stored.modes) && stored.modes.length > 0) {
      setPermittedModes(stored.modes);
    }
    if (typeof stored.maxCandidates === 'number' && stored.maxCandidates > 0) {
      setMaxCandidates(stored.maxCandidates);
    }
    if (
      typeof stored.timeBudgetMinutes === 'number' &&
      stored.timeBudgetMinutes > 0
    ) {
      setTimeBudgetMinutes(stored.timeBudgetMinutes);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [mounted, libraryLoading, isSessionRunning, builtins, entries]);

  const currentPair =
    isSessionRunning && discovery.session?.searchSpace.pair
      ? discovery.session.searchSpace.pair
      : selectedPair;

  const currentTimeframe =
    isSessionRunning && discovery.session?.searchSpace.timeframe
      ? discovery.session.searchSpace.timeframe
      : selectedTimeframe;

  const currentStrategies = useMemo(() => {
    if (
      isSessionRunning &&
      discovery.session?.searchSpace.enabledStrategies &&
      discovery.session.searchSpace.enabledStrategies.length > 0
    ) {
      return discovery.session.searchSpace.enabledStrategies.map((member) => {
        if (isVersionMember(member)) {
          const entry = entries.find(
            (e) => e.latestVersion.id === member.strategyVersionId,
          );
          return entry
            ? entryOptionId(entry.id)
            : entryOptionId(member.strategyVersionId);
        }
        return builtinOptionId(member.id);
      });
    }
    return selectedStrategies;
  }, [isSessionRunning, discovery.session, entries, selectedStrategies]);

  const currentModes =
    isSessionRunning &&
    discovery.session?.searchSpace.permittedCombinationModes &&
    discovery.session.searchSpace.permittedCombinationModes.length > 0
      ? discovery.session.searchSpace.permittedCombinationModes
      : permittedModes;

  const currentMaxCandidates =
    isSessionRunning && discovery.session?.stopPolicy.maxCandidates
      ? discovery.session.stopPolicy.maxCandidates
      : maxCandidates;

  const currentTimeBudgetMinutes =
    isSessionRunning && discovery.session?.stopPolicy.timeBudgetMs
      ? Math.max(
          1,
          Math.round(discovery.session.stopPolicy.timeBudgetMs / 60000),
        )
      : timeBudgetMinutes;

  const saveToStorage = (updates: Partial<StoredDiscoveryConfig>) => {
    if (typeof window === 'undefined') return;
    try {
      const current: StoredDiscoveryConfig = {
        maxCandidates,
        modes: permittedModes,
        pair: selectedPair,
        strategies: selectedStrategies,
        timeBudgetMinutes,
        timeframe: selectedTimeframe,
        ...updates,
      };
      localStorage.setItem(
        DISCOVERY_CONFIG_STORAGE_KEY,
        JSON.stringify(current),
      );
    } catch {
      // ignore storage quota or access errors
    }
  };

  const handlePairChange = (pair: Pair) => {
    setSelectedPair(pair);
    saveToStorage({ pair });
  };

  const handleTimeframeChange = (timeframe: Timeframe) => {
    setSelectedTimeframe(timeframe);
    saveToStorage({ timeframe });
  };

  const toggleStrategy = (id: string) => {
    setSelectedStrategies((prev) => {
      const next = prev.includes(id)
        ? prev.filter((s) => s !== id)
        : [...prev, id];
      saveToStorage({ strategies: next });
      return next;
    });
  };

  const toggleMode = (mode: 'majority' | 'weighted') => {
    setPermittedModes((prev) => {
      const next = prev.includes(mode)
        ? prev.filter((m) => m !== mode)
        : [...prev, mode];
      saveToStorage({ modes: next });
      return next;
    });
  };

  const handleMaxCandidatesChange = (val: number) => {
    setMaxCandidates(val);
    saveToStorage({ maxCandidates: val });
  };

  const handleTimeBudgetChange = (val: number) => {
    setTimeBudgetMinutes(val);
    saveToStorage({ timeBudgetMinutes: val });
  };

  const visibleEntries = useMemo(() => {
    const nonArchived = entries.filter((e) => e.archivedAt === null);
    const query = libraryFilter.trim().toLowerCase();
    if (!query) return nonArchived;
    return nonArchived.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        e.tags.some((tag) => tag.toLowerCase().includes(query)),
    );
  }, [entries, libraryFilter]);

  const handleStart = async () => {
    if (selectedStrategies.length === 0 || permittedModes.length === 0) return;
    setSubmitting(true);
    try {
      const enabledStrategies: EnabledStrategyDescriptor[] = [];
      for (const value of selectedStrategies) {
        if (value.startsWith('builtin:')) {
          enabledStrategies.push({ id: value.slice('builtin:'.length) });
          continue;
        }
        if (value.startsWith('entry:')) {
          const entryId = value.slice('entry:'.length);
          const entry = entries.find((e) => e.id === entryId);
          if (!entry || entry.kind === 'composite') continue;
          enabledStrategies.push({
            displayName: entry.name,
            id: entry.strategyId,
            kind: 'version',
            params: entry.latestVersion.params ?? {},
            strategyVersionId: entry.latestVersion.id,
            versionTag: entry.latestVersion.versionTag,
          });
        }
      }
      if (enabledStrategies.length === 0) return;

      const interval = TIMEFRAME_INTERVAL_MS[selectedTimeframe] ?? 3_600_000;
      const now = Date.now();
      const endTime = Math.floor(now / interval) * interval;
      const startTime = endTime - 30 * 24 * 60 * 60 * 1000;
      const alignedStartTime = Math.floor(startTime / interval) * interval;

      saveToStorage({
        maxCandidates,
        modes: permittedModes,
        pair: selectedPair,
        strategies: selectedStrategies,
        timeBudgetMinutes,
        timeframe: selectedTimeframe,
      });

      await discovery.startSession({
        algorithm: RANDOM_SEARCH_ALGORITHM_ID,
        searchSpace: {
          enabledStrategies,
          endTime,
          pair: selectedPair,
          permittedCombinationModes: permittedModes,
          startTime: alignedStartTime,
          timeframe: selectedTimeframe,
        },
        stopPolicy: {
          maxCandidates,
          timeBudgetMs: timeBudgetMinutes * 60 * 1000,
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted || libraryLoading) {
    return <DiscoverySessionControlSkeleton />;
  }

  return (
    <section
      aria-labelledby="discovery-controls-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="discovery-session-control"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h2
              className="text-base font-semibold text-slate-900"
              id="discovery-controls-heading"
            >
              Search Engine &amp; Strategy Discovery
            </h2>
            <p className="text-xs text-slate-500">
              Configure continuous strategy discovery sessions
            </p>
          </div>
        </div>
      </div>

      {/* Algorithm Method Selector */}
      <div className="mt-4">
        <label className="text-xs font-semibold text-slate-700">
          Discovery Method
        </label>
        <div className="mt-2 grid grid-cols-3 gap-2.5">
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl border border-indigo-600 bg-indigo-50/50 px-3 py-2.5 text-xs font-semibold text-indigo-700 shadow-sm"
          >
            <Shuffle className="size-3.5 text-indigo-600" />
            <span>Random Search</span>
            <span className="rounded-full bg-indigo-600/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
              Active
            </span>
          </button>

          <button
            type="button"
            disabled
            className="flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs font-medium text-slate-400 opacity-80"
            title="Swappable Generator plugin interface ready for DomainGuidedGenerator"
          >
            <Compass className="size-3.5 text-slate-400" />
            <span>Domain-guided</span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
              Soon
            </span>
          </button>

          <button
            type="button"
            disabled
            className="flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs font-medium text-slate-400 opacity-80"
            title="Swappable Generator plugin interface ready for GeneticGenerator"
          >
            <Dna className="size-3.5 text-slate-400" />
            <span>Genetic</span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
              Soon
            </span>
          </button>
        </div>
      </div>

      {/* Search Space Settings */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="discovery-pair-select"
            className="text-xs font-semibold text-slate-700"
          >
            Market Pair
          </label>
          <select
            id="discovery-pair-select"
            disabled={isSessionActive || isSessionPaused}
            value={currentPair}
            onChange={(e) => handlePairChange(e.target.value as Pair)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
          >
            {AVAILABLE_PAIRS.map((pair) => (
              <option key={pair} value={pair}>
                {pair}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="discovery-timeframe-select"
            className="text-xs font-semibold text-slate-700"
          >
            Timeframe
          </label>
          <select
            id="discovery-timeframe-select"
            disabled={isSessionActive || isSessionPaused}
            value={currentTimeframe}
            onChange={(e) => handleTimeframeChange(e.target.value as Timeframe)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
          >
            {AVAILABLE_TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Search Space members */}
      <div className="mt-4">
        <label className="text-xs font-semibold text-slate-700">
          Search Space ({currentStrategies.length} selected)
        </label>

        <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Built-in
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {builtins.map((builtin) => {
            const value = builtinOptionId(builtin.strategyId);
            const isSelected = currentStrategies.includes(value);
            const disabledReason = builtinDisabledReason(builtin);
            const isDisabled =
              isSessionActive || isSessionPaused || disabledReason !== null;
            return (
              <button
                key={builtin.strategyId}
                type="button"
                disabled={isDisabled}
                title={disabledReason ?? undefined}
                onClick={() => toggleStrategy(value)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/50 font-semibold text-indigo-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                } disabled:pointer-events-none disabled:opacity-60`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="min-w-0 flex-1 truncate">
                  {builtin.strategyId.toUpperCase()}
                </span>
                {disabledReason && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                    Live only
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            My Library
          </p>
          {entries.length > 5 && (
            <input
              type="search"
              value={libraryFilter}
              onChange={(e) => setLibraryFilter(e.target.value)}
              placeholder="Filter by name or tag"
              className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 focus:border-indigo-500 focus:outline-none"
            />
          )}
        </div>

        {visibleEntries.length === 0 ? (
          <p className="mt-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-[11px] text-slate-500">
            {entries.length === 0
              ? 'Strategies you save to your Library will show up here.'
              : 'No Library entries match this filter.'}
          </p>
        ) : (
          <div className="mt-1.5 max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-slate-100 p-1.5">
            {visibleEntries.map((entry) => {
              const value = entryOptionId(entry.id);
              const isSelected = currentStrategies.includes(value);
              const disabledReason = libraryEntryDisabledReason(
                entry,
                builtins,
                currentPair,
                currentTimeframe,
              );
              const isDisabled =
                isSessionActive || isSessionPaused || disabledReason !== null;
              return (
                <button
                  key={entry.id}
                  type="button"
                  disabled={isDisabled}
                  title={disabledReason ?? undefined}
                  onClick={() => toggleStrategy(value)}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/50 font-semibold text-indigo-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  } disabled:pointer-events-none disabled:opacity-60`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  {disabledReason && (
                    <span className="shrink-0 truncate text-[10px] font-medium text-slate-400">
                      {disabledReason}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Combination Modes */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="text-xs font-semibold text-slate-700">
          Combination Modes:
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-700">
          <input
            type="checkbox"
            disabled={isSessionActive || isSessionPaused}
            checked={currentModes.includes('majority')}
            onChange={() => toggleMode('majority')}
            className="rounded border-slate-300 text-indigo-600"
          />
          Majority Vote
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-700">
          <input
            type="checkbox"
            disabled={isSessionActive || isSessionPaused}
            checked={currentModes.includes('weighted')}
            onChange={() => toggleMode('weighted')}
            className="rounded border-slate-300 text-indigo-600"
          />
          Weighted Score
        </label>
      </div>

      {/* Stop Policy Controls */}
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
        <div>
          <label
            htmlFor="discovery-max-candidates"
            className="text-[11px] font-medium text-slate-500"
          >
            Max Candidates / Run
          </label>
          <input
            id="discovery-max-candidates"
            type="number"
            min={10}
            max={500}
            disabled={isSessionActive || isSessionPaused}
            value={currentMaxCandidates}
            onChange={(e) => handleMaxCandidatesChange(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="discovery-time-budget"
            className="text-[11px] font-medium text-slate-500"
          >
            Time Budget (min)
          </label>
          <input
            id="discovery-time-budget"
            type="number"
            min={1}
            max={60}
            disabled={isSessionActive || isSessionPaused}
            value={currentTimeBudgetMinutes}
            onChange={(e) => handleTimeBudgetChange(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-3">
        {!isSessionActive && !isSessionPaused ? (
          <button
            type="button"
            disabled={submitting || selectedStrategies.length === 0}
            onClick={handleStart}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            <Play className="size-4" />
            <span>
              {submitting ? 'Starting Session…' : 'Start Discovery Session'}
            </span>
          </button>
        ) : isSessionActive ? (
          <>
            <button
              type="button"
              onClick={discovery.pauseSession}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Pause className="size-4" />
              <span>Pause Discovery</span>
            </button>
            <button
              type="button"
              onClick={discovery.stopSession}
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
            >
              <Square className="size-4" />
              <span>Stop Session</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={discovery.resumeSession}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <Play className="size-4" />
              <span>Resume Discovery</span>
            </button>
            <button
              type="button"
              onClick={discovery.stopSession}
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
            >
              <Square className="size-4" />
              <span>Stop Session</span>
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function DiscoverySessionControlSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="discovery-session-control-skeleton"
    >
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
        <span className="size-9 rounded-xl bg-slate-100" />
        <div className="space-y-1.5">
          <div className="h-4 w-48 rounded bg-slate-100" />
          <div className="h-3 w-64 rounded bg-slate-100" />
        </div>
      </div>
      <div className="mt-4 h-9 rounded-xl bg-slate-100" />
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="h-9 rounded-xl bg-slate-100" />
        <div className="h-9 rounded-xl bg-slate-100" />
      </div>
      <div className="mt-4 h-40 rounded-xl bg-slate-100" />
      <div className="mt-4 h-6 w-56 rounded bg-slate-100" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="h-12 rounded-lg bg-slate-100" />
        <div className="h-12 rounded-lg bg-slate-100" />
      </div>
      <div className="mt-5 h-11 rounded-xl bg-slate-100" />
    </section>
  );
}
