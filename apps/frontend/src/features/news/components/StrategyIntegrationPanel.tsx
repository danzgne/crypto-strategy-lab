'use client';

import { Zap, ArrowRight, ArrowDown } from 'lucide-react';

export function StrategyIntegrationPanel() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900">
          Strategy integration
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          How News Sentiment is used in the Strategy Engine
        </p>
      </div>

      {/* Diagram */}
      <div className="mt-4 flex flex-col items-center">
        {/* Top row */}
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex-1 rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 text-center">
            <span className="text-[10px] font-bold text-blue-800">
              News Sentiment
            </span>
            <p className="text-[9px] text-blue-600">(Real-time)</p>
          </div>

          <div className="flex flex-col items-center text-[10px] text-slate-400 font-mono">
            <span className="text-[9px]">API / Stream</span>
            <ArrowRight className="size-3 text-slate-400" />
          </div>

          <div className="flex-1 rounded-xl border border-indigo-200 bg-indigo-50/70 p-2.5 text-center">
            <span className="text-[10px] font-bold text-indigo-900">
              Condition
            </span>
            <p className="text-[9px] text-indigo-600">(entry condition)</p>
          </div>
        </div>

        {/* Middle connector */}
        <div className="my-3 flex items-center gap-1 text-[10px] text-slate-400">
          <ArrowDown className="size-3 text-slate-400" />
          <span>Or use it directly</span>
        </div>

        {/* Bottom card */}
        <div className="flex w-full items-center gap-3 rounded-xl border border-purple-200 bg-purple-50/60 p-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-purple-600 text-white shadow-sm">
            <Zap className="size-4 fill-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-purple-950">
              NewsSentimentStrategy
            </p>
            <p className="text-[10px] text-purple-700">(sample strategy)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
