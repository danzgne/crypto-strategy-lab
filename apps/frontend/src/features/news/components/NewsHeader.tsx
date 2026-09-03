'use client';

import { HelpCircle, Bell } from 'lucide-react';

export function NewsHeader() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Market intelligence
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
          News Crawler & Market Analysis
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          Collects news, understands HTML with an LLM, saves extraction
          templates, and analyzes sentiment
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-800 shadow-sm">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Data source: News providers</span>
        </div>

        <button
          type="button"
          aria-label="Help"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
        >
          <HelpCircle className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
        >
          <Bell className="size-5" />
        </button>
      </div>
    </div>
  );
}
