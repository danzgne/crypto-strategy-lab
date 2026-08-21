import { ArrowUpRight, CandlestickChart } from 'lucide-react';

import { StatusBadge } from '../../../shared/ui/StatusBadge';

const PATHS = {
  '1m': 'M2 67 C 24 61, 30 38, 51 45 S 82 59, 101 36 S 140 42, 158 23 S 190 31, 218 16',
  '5m': 'M2 72 C 19 51, 31 62, 49 43 S 75 33, 96 47 S 123 38, 142 25 S 182 43, 218 20',
  '15m':
    'M2 66 C 22 71, 38 43, 58 49 S 92 24, 111 36 S 143 51, 163 30 S 191 17, 218 25',
  '1h': 'M2 75 C 24 65, 35 69, 53 46 S 83 54, 105 31 S 139 44, 160 27 S 190 36, 218 15',
} as const;

export function MarketPanel({ timeframe }: { timeframe: keyof typeof PATHS }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.5)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">
              BTCUSDT
            </span>
            <span className="text-xs font-medium text-slate-400">
              · {timeframe}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Market stream placeholder
          </p>
        </div>
        <StatusBadge tone="neutral">Reserved</StatusBadge>
      </div>

      <div className="relative mt-6 h-28 overflow-hidden rounded-xl border border-dashed border-slate-200 bg-slate-50/80">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:36px_28px] opacity-55" />
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full"
          preserveAspectRatio="none"
          viewBox="0 0 220 90"
        >
          <defs>
            <linearGradient
              id={`area-${timeframe}`}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`${PATHS[timeframe]} L218 90 L2 90 Z`}
            fill={`url(#area-${timeframe})`}
          />
          <path
            d={PATHS[timeframe]}
            fill="none"
            stroke="#4f46e5"
            strokeLinecap="round"
            strokeWidth="2.25"
          />
        </svg>
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur">
          <CandlestickChart
            aria-hidden="true"
            className="size-3.5 text-indigo-500"
          />
          Candles land in market-data
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-slate-500">Transport skeleton only</span>
        <span className="inline-flex items-center gap-1 font-semibold text-indigo-600">
          Next slice
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </span>
      </div>
    </article>
  );
}
