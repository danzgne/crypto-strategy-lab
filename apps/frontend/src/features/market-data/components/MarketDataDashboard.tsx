'use client';

import { RadioTower } from 'lucide-react';
import { useState } from 'react';

import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { useStrategyCatalog } from '../hooks/useStrategyCatalog';
import { MarketPanel, type ChartTimeframe } from './MarketPanel';
import { RealtimeConnectionPanel } from './RealtimeConnectionPanel';

const PAIR_OPTIONS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'] as const;
const INITIAL_PANEL_TIMEFRAMES: ChartTimeframe[] = ['1m', '5m', '15m', '1h'];

export function MarketDataDashboard() {
  const [pair, setPair] = useState<string>(PAIR_OPTIONS[0]);
  const [panelTimeframes, setPanelTimeframes] = useState<ChartTimeframe[]>(
    INITIAL_PANEL_TIMEFRAMES,
  );
  const [enabledStrategyId, setEnabledStrategyId] = useState<string | null>(
    null,
  );
  const strategyCatalog = useStrategyCatalog();

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
            <div className="flex items-end gap-3">
              {strategyCatalog.strategyIds.map((strategyId) => (
                <label
                  className="flex items-center gap-2 pb-2 text-xs font-semibold text-slate-700"
                  key={strategyId}
                >
                  <input
                    aria-label={`Enable ${formatStrategyName(strategyId)} strategy`}
                    checked={enabledStrategyId === strategyId}
                    className="size-4 accent-indigo-600"
                    onChange={() =>
                      setEnabledStrategyId((current) =>
                        current === strategyId ? null : strategyId,
                      )
                    }
                    type="checkbox"
                  />
                  <span>Enable {formatStrategyName(strategyId)} strategy</span>
                </label>
              ))}
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
          <div className="grid gap-5 md:grid-cols-2">
            {panelTimeframes.map((timeframe, index) => (
              <MarketPanel
                key={`market-panel-${index + 1}`}
                onTimeframeChange={(nextTimeframe) =>
                  changeTimeframe(index, nextTimeframe)
                }
                panelNumber={index + 1}
                pair={pair}
                strategyId={enabledStrategyId}
                timeframe={timeframe}
              />
            ))}
          </div>
        </section>

        <aside
          aria-label="Realtime connection details"
          className="xl:pt-[3.25rem]"
        >
          <RealtimeConnectionPanel />
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

function formatStrategyName(strategyId: string): string {
  return strategyId.replaceAll(/[-_]+/g, ' ').toUpperCase();
}
