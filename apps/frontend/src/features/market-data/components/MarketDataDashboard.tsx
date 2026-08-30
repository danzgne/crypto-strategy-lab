'use client';

import { RadioTower } from 'lucide-react';
import type {
  CompositeStrategyRequest,
  SavedStrategy,
} from '@crypto-strategy-lab/shared';
import { formatStrategyType } from '@crypto-strategy-lab/shared/strategy';
import { useCallback, useMemo, useState } from 'react';

import { StatusBadge } from '../../../shared/ui/StatusBadge';
import type { FinancialChartRenderer } from '../../../shared/charting';
import { ManualCompositeBuilder } from '../../combinations';
import { useSavedStrategies } from '../../strategies';
import { useStrategyCatalog } from '../hooks/useStrategyCatalog';
import { useRecentTicks } from '../hooks/useRecentTicks';
import { MarketPanel, type ChartTimeframe } from './MarketPanel';
import { RecentTicksCard } from './RecentTicksCard';
import { RealtimeConnectionPanel } from './RealtimeConnectionPanel';

const PAIR_OPTIONS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'] as const;
const INITIAL_PANEL_TIMEFRAMES: ChartTimeframe[] = ['1m', '5m', '15m', '1h'];

interface StrategyOverlayOption {
  value: string;
  label: string;
  strategyId: string;
  params?: unknown;
  composite?: CompositeStrategyRequest;
}

export interface MarketDataDashboardProperties {
  chartRenderer?: FinancialChartRenderer;
}

export function MarketDataDashboard({
  chartRenderer,
}: MarketDataDashboardProperties) {
  const [pair, setPair] = useState<string>(PAIR_OPTIONS[0]);
  const [panelTimeframes, setPanelTimeframes] = useState<ChartTimeframe[]>(
    INITIAL_PANEL_TIMEFRAMES,
  );
  const [overlayKey, setOverlayKey] = useState('');
  const [compositeDefinition, setCompositeDefinition] =
    useState<CompositeStrategyRequest | null>(null);
  const strategyCatalog = useStrategyCatalog();
  const savedStrategies = useSavedStrategies();
  const recentTicks = useRecentTicks({ pair, limit: 5 });
  const runnableStrategyIds = useMemo(
    () =>
      strategyCatalog.strategies
        .filter((entry) => {
          const requiresParams =
            entry.requiresParams ??
            (entry.paramsSchema.required?.length ?? 0) > 0;
          return !requiresParams;
        })
        .map(({ id }) => id),
    [strategyCatalog.strategies],
  );
  const strategyOverlayOptions = useMemo(
    () => [
      ...runnableStrategyIds.map<StrategyOverlayOption>((strategyId) => ({
        label: formatStrategyType(strategyId),
        strategyId,
        value: `builtin:${strategyId}`,
      })),
      ...savedStrategies.strategies.map(toOverlayOption),
    ],
    [runnableStrategyIds, savedStrategies.strategies],
  );
  const selectedOverlay = strategyOverlayOptions.find(
    ({ value }) => value === overlayKey,
  );
  const handleCompositeChange = useCallback(
    (nextDefinition: CompositeStrategyRequest | null): void => {
      setCompositeDefinition(nextDefinition);
      if (nextDefinition !== null) setOverlayKey('');
    },
    [],
  );

  const changeTimeframe = (
    panelIndex: number,
    timeframe: ChartTimeframe,
  ): void => {
    setPanelTimeframes((current) =>
      current.map((currentTimeframe, index) =>
        index === panelIndex ? timeframe : currentTimeframe,
      ),
    );
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Operations dashboard
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
            Realtime foundation
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Watch four independently switchable market panels in real time. The
            browser receives normalized candles from the Market Data Service;
            Binance remains behind the backend exchange adapter.
          </p>
        </div>
        <StatusBadge tone="neutral">
          <RadioTower aria-hidden="true" className="size-3.5" />
          Market-data boundary
        </StatusBadge>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,0.6fr)]">
        <section aria-labelledby="workspace-title">
          <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.5)] sm:flex-row sm:items-end sm:justify-between sm:p-5">
            <div>
              <h2
                id="workspace-title"
                className="text-base font-semibold text-slate-900"
              >
                Live market workspace
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Choose one shared pair, then tune each panel to its own
                timeframe. Matching panels share one backend market stream.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"
                  htmlFor="strategy-overlay"
                >
                  Strategy overlay
                </label>
                <select
                  className="min-w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  id="strategy-overlay"
                  onChange={(event) => {
                    setOverlayKey(event.target.value);
                    setCompositeDefinition(null);
                  }}
                  value={overlayKey}
                >
                  <option value="">None (No overlay)</option>
                  {strategyOverlayOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"
                  htmlFor="market-pair"
                >
                  Market pair
                </label>
                <select
                  className="min-w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  id="market-pair"
                  onChange={(event) => setPair(event.target.value)}
                  value={pair}
                >
                  {PAIR_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <span className="pb-2 text-xs font-medium text-slate-400">
                {panelTimeframes.length} live panels
              </span>
            </div>
          </div>
          <ManualCompositeBuilder
            catalog={strategyCatalog}
            onCompositeChange={handleCompositeChange}
          />
          <div className="grid gap-5 md:grid-cols-2">
            {panelTimeframes.map((timeframe, index) => (
              <MarketPanel
                {...(chartRenderer === undefined ? {} : { chartRenderer })}
                key={`market-panel-${index + 1}`}
                onTimeframeChange={(nextTimeframe) =>
                  changeTimeframe(index, nextTimeframe)
                }
                panelNumber={index + 1}
                pair={pair}
                composite={
                  compositeDefinition ?? selectedOverlay?.composite ?? null
                }
                {...(compositeDefinition !== null ||
                selectedOverlay?.params === undefined
                  ? {}
                  : { params: selectedOverlay.params })}
                strategyId={
                  compositeDefinition === null
                    ? (selectedOverlay?.strategyId ?? null)
                    : null
                }
                timeframe={timeframe}
              />
            ))}
          </div>
        </section>

        <aside aria-label="Realtime market details" className="xl:pt-[3.25rem]">
          <RealtimeConnectionPanel />
          <div className="mt-4">
            <RecentTicksCard
              loading={recentTicks.loading}
              pair={pair}
              ticks={recentTicks.ticks}
            />
          </div>
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
            <p className="text-sm font-semibold text-blue-950">
              Scope boundary
            </p>
            <p className="mt-2 text-xs leading-5 text-blue-900/70">
              The browser never connects to Binance. The live flow is Frontend →
              Market Data Service → Exchange Adapter → Binance.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function toOverlayOption(strategy: SavedStrategy): StrategyOverlayOption {
  if (strategy.kind === 'composite') {
    return {
      composite: strategy.composite,
      label: `Saved · ${strategy.name}`,
      strategyId: 'composite',
      value: `saved:${strategy.id}`,
    };
  }

  return {
    label: `Saved · ${strategy.name}`,
    params: strategy.params,
    strategyId: strategy.strategyId,
    value: `saved:${strategy.id}`,
  };
}
