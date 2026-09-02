'use client';

import type { NewsStats } from '../types';
import {
  NEWS_EVENT_TYPES,
  type NewsEventType,
} from '@crypto-strategy-lab/shared/news';

interface AnalysisOutputPanelProps {
  stats: NewsStats;
  lastUpdated: string;
}

export function AnalysisOutputPanel({
  stats,
  lastUpdated,
}: AnalysisOutputPanelProps) {
  const activeSourcesCount = stats.activeSources;
  const totalSourcesCount = stats.totalSources;
  const coveragePct = stats.coveragePercent;
  const aggregate = stats.analytics?.aggregate ?? {
    positive: 0,
    neutral: 0,
    negative: 0,
    score: 0,
    sampleSize: 0,
  };
  const eventTypes: Partial<Record<NewsEventType, number>> =
    stats.analytics?.eventTypes ?? {};
  const totalAnalyzed = (stats.analytics?.analyzedCount ?? 0).toLocaleString();
  const topEventTypes = NEWS_EVENT_TYPES.map((eventType) => ({
    eventType,
    percentage: eventTypes[eventType] ?? 0,
  }))
    .filter((entry) => entry.percentage > 0)
    .sort((left, right) => right.percentage - left.percentage)
    .slice(0, 5);

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
            style={{ width: `${aggregate.positive}%` }}
            className="flex items-center justify-center bg-emerald-500 transition-all duration-500"
          >
            {aggregate.positive}%
          </div>
          <div
            style={{ width: `${aggregate.neutral}%` }}
            className="flex items-center justify-center bg-slate-400 transition-all duration-500"
          >
            {aggregate.neutral}%
          </div>
          <div
            style={{ width: `${aggregate.negative}%` }}
            className="flex items-center justify-center bg-rose-500 transition-all duration-500"
          >
            {aggregate.negative}%
          </div>
        </div>

        {/* Legend */}
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span>Positive ({aggregate.positive}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-slate-400" />
            <span>Neutral ({aggregate.neutral}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-rose-500" />
            <span>Negative ({aggregate.negative}%)</span>
          </div>
        </div>
      </div>

      {/* Event Type (Top) */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">
            Event Type (Top)
          </p>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {topEventTypes.map(({ eventType, percentage }) => (
            <div
              key={eventType}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700"
            >
              <span className="font-medium">{formatEventType(eventType)}</span>
              <span className="font-bold text-blue-600">{percentage}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Sentiment score (TB)</span>
          <span className="font-bold text-emerald-600">
            {aggregate.score.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-500">
            Số lượng tin đã thu thập &amp; phân tích
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

function formatEventType(eventType: NewsEventType): string {
  return {
    ETF_FUND_FLOW: 'ETF / Fund Flow',
    PROTOCOL_UPGRADE: 'Protocol Upgrade',
    REGULATION: 'Regulation',
    PARTNERSHIP: 'Partnership',
    MARKET_TREND: 'Market Trend',
    OTHER: 'Other',
  }[eventType];
}
