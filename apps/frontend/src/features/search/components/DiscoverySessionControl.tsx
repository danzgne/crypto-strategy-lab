'use client';

import { TIMEFRAME_INTERVAL_MS } from '@crypto-strategy-lab/shared/market-data';
import type {
  Pair,
  StrategyCatalog,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import {
  Sparkles,
  Play,
  Pause,
  Square,
  Dna,
  Compass,
  Shuffle,
} from 'lucide-react';
import { useState } from 'react';
import type { UseDiscoverySessionResult } from '../hooks/useDiscoverySession';

const AVAILABLE_PAIRS: Pair[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
const AVAILABLE_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const DISCOVERY_CONFIG_STORAGE_KEY =
  'crypto-strategy-lab:discovery-form-config';

interface StoredDiscoveryConfig {
  pair?: Pair;
  timeframe?: Timeframe;
  strategies?: string[];
  modes?: ('majority' | 'weighted')[];
  maxCandidates?: number;
  timeBudgetMinutes?: number;
}

function getInitialConfig(): StoredDiscoveryConfig {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(DISCOVERY_CONFIG_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as StoredDiscoveryConfig) : {};
  } catch {
    return {};
  }
}

interface DiscoverySessionControlProps {
  catalog: StrategyCatalog;
  discovery: UseDiscoverySessionResult;
}

export function DiscoverySessionControl({
  catalog,
  discovery,
}: DiscoverySessionControlProps) {
  const [selectedPair, setSelectedPair] = useState<Pair>(() => {
    if (discovery.session?.searchSpace.pair) {
      return discovery.session.searchSpace.pair;
    }
    const init = getInitialConfig();
    return init.pair && AVAILABLE_PAIRS.includes(init.pair)
      ? init.pair
      : 'BTCUSDT';
  });

  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>(() => {
    if (discovery.session?.searchSpace.timeframe) {
      return discovery.session.searchSpace.timeframe;
    }
    const init = getInitialConfig();
    return init.timeframe && AVAILABLE_TIMEFRAMES.includes(init.timeframe)
      ? init.timeframe
      : '1h';
  });

  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(() => {
    if (discovery.session?.searchSpace.enabledStrategies?.length) {
      return discovery.session.searchSpace.enabledStrategies.map((s) => s.id);
    }
    const init = getInitialConfig();
    if (Array.isArray(init.strategies) && init.strategies.length > 0) {
      const mapped = init.strategies
        .map((id) =>
          id === 'bollinger' ? 'bb' : id === 'support-resistance' ? 'sr' : id,
        )
        .filter((id, index, arr) => arr.indexOf(id) === index);
      if (mapped.length > 0) return mapped;
    }
    return ['ma', 'rsi', 'bb', 'sr'];
  });

  const [permittedModes, setPermittedModes] = useState<
    ('majority' | 'weighted')[]
  >(() => {
    if (discovery.session?.searchSpace.permittedCombinationModes?.length) {
      return [...discovery.session.searchSpace.permittedCombinationModes];
    }
    const init = getInitialConfig();
    return Array.isArray(init.modes) && init.modes.length > 0
      ? init.modes
      : ['majority', 'weighted'];
  });

  const [maxCandidates, setMaxCandidates] = useState<number>(() => {
    if (discovery.session?.stopPolicy.maxCandidates) {
      return discovery.session.stopPolicy.maxCandidates;
    }
    const init = getInitialConfig();
    return typeof init.maxCandidates === 'number' && init.maxCandidates > 0
      ? init.maxCandidates
      : 100;
  });

  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState<number>(() => {
    if (discovery.session?.stopPolicy.timeBudgetMs) {
      return Math.max(
        1,
        Math.round(discovery.session.stopPolicy.timeBudgetMs / 60000),
      );
    }
    const init = getInitialConfig();
    return typeof init.timeBudgetMinutes === 'number' &&
      init.timeBudgetMinutes > 0
      ? init.timeBudgetMinutes
      : 15;
  });

  const [submitting, setSubmitting] = useState(false);

  const isSessionActive = discovery.session?.status === 'ACTIVE';
  const isSessionPaused = discovery.session?.status === 'PAUSED';
  const isSessionRunning = isSessionActive || isSessionPaused;

  const currentPair =
    isSessionRunning && discovery.session?.searchSpace.pair
      ? discovery.session.searchSpace.pair
      : selectedPair;

  const currentTimeframe =
    isSessionRunning && discovery.session?.searchSpace.timeframe
      ? discovery.session.searchSpace.timeframe
      : selectedTimeframe;

  const currentStrategies =
    isSessionRunning &&
    discovery.session?.searchSpace.enabledStrategies &&
    discovery.session.searchSpace.enabledStrategies.length > 0
      ? discovery.session.searchSpace.enabledStrategies.map((s) => s.id)
      : selectedStrategies;

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

  const handleStart = async () => {
    if (selectedStrategies.length === 0 || permittedModes.length === 0) return;
    setSubmitting(true);
    try {
      const canonicalizedStrategies = selectedStrategies
        .map((id) =>
          id === 'bollinger' ? 'bb' : id === 'support-resistance' ? 'sr' : id,
        )
        .filter((id, index, arr) => arr.indexOf(id) === index);
      const enabledStrategies = canonicalizedStrategies.map((id) => ({ id }));
      const interval = TIMEFRAME_INTERVAL_MS[selectedTimeframe] ?? 3_600_000;
      const now = Date.now();
      const endTime = Math.floor(now / interval) * interval;
      const startTime = endTime - 30 * 24 * 60 * 60 * 1000;
      const alignedStartTime = Math.floor(startTime / interval) * interval;

      saveToStorage({
        maxCandidates,
        modes: permittedModes,
        pair: selectedPair,
        strategies: canonicalizedStrategies,
        timeBudgetMinutes,
        timeframe: selectedTimeframe,
      });

      await discovery.startSession({
        algorithm: 'random',
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

      {/* Standalone Strategies Pool */}
      <div className="mt-4">
        <label className="text-xs font-semibold text-slate-700">
          Strategy Candidates Pool ({currentStrategies.length} selected)
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {catalog.strategies.map((strat) => {
            const isSelected = currentStrategies.includes(strat.id);
            return (
              <button
                key={strat.id}
                type="button"
                disabled={isSessionActive || isSessionPaused}
                onClick={() => toggleStrategy(strat.id)}
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
                <span className="truncate">{strat.id.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
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
