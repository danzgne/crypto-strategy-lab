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
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Help"
          title="Collects crypto news, extracts structured data with an LLM, and scores sentiment in real time."
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
