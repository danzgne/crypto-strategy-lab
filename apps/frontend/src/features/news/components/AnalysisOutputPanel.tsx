'use client';

import type { NewsStats } from '../types';

interface AnalysisOutputPanelProps {
  stats: NewsStats;
  lastUpdated: string;
}

export function AnalysisOutputPanel({
  stats,
  lastUpdated,
}: AnalysisOutputPanelProps) {
  const activeSourcesCount = stats.activeSources > 0 ? stats.activeSources : 23;
  const totalSourcesCount = stats.totalSources > 0 ? stats.totalSources : 25;
  const coveragePct =
    stats.totalSources > 0
      ? stats.coveragePercent
      : Math.round((activeSourcesCount / totalSourcesCount) * 100);

  const totalAnalyzed =
    stats.totalItems > 0 ? stats.totalItems.toLocaleString() : '1,248';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900">Đầu ra phân tích</h3>
        {lastUpdated && (
          <span className="text-xs text-slate-400">
            Cập nhật: {lastUpdated}
          </span>
        )}
      </div>

      {/* Sentiment Aggregate (24h) */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <span>Sentiment tổng hợp (24h)</span>
        </div>

        {/* Progress Bar */}
        <div className="mt-2 flex h-5 w-full overflow-hidden rounded-lg bg-slate-100 text-[11px] font-bold text-white shadow-inner">
          <div
            style={{ width: '58%' }}
            className="flex items-center justify-center bg-emerald-500 transition-all duration-500"
          >
            58%
          </div>
          <div
            style={{ width: '27%' }}
            className="flex items-center justify-center bg-slate-400 transition-all duration-500"
          >
            27%
          </div>
          <div
            style={{ width: '15%' }}
            className="flex items-center justify-center bg-rose-500 transition-all duration-500"
          >
            15%
          </div>
        </div>

        {/* Legend */}
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span>Positive (58%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-slate-400" />
            <span>Neutral (27%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-rose-500" />
            <span>Negative (15%)</span>
          </div>
        </div>
      </div>

      {/* Event Type (Top) */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-700">Event Type (Top)</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
            <span className="font-medium">ETF / Fund Flow</span>
            <span className="font-bold text-blue-600">28%</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
            <span className="font-medium">Protocol Upgrade</span>
            <span className="font-bold text-blue-600">22%</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
            <span className="font-medium">Regulation</span>
            <span className="font-bold text-blue-600">15%</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
            <span className="font-medium">Partnership</span>
            <span className="font-bold text-blue-600">12%</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700">
            <span className="font-medium">Market Trend</span>
            <span className="font-bold text-blue-600">23%</span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Confidence Score (TB)</span>
          <span className="font-bold text-emerald-600">0.78</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-500">
            Số lượng tin đã phân tích (24h)
          </span>
          <span className="font-bold text-slate-800">{totalAnalyzed}</span>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-slate-500">Độ bao phủ nguồn</span>
            <span className="font-bold text-emerald-600">{coveragePct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              style={{ width: `${coveragePct}%` }}
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            />
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">
            Nguồn hoạt động:{' '}
            <span className="font-semibold text-slate-600">
              {activeSourcesCount} / {totalSourcesCount}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
