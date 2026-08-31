'use client';

import { HelpCircle, Bell } from 'lucide-react';

export function NewsHeader() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          News Crawler & Phân tích thị trường
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Thu thập tin tức, hiểu HTML bằng LLM, lưu template và phân tích
          sentiment
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-800 shadow-sm">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Nguồn dữ liệu: Binance API + WebSocket</span>
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
