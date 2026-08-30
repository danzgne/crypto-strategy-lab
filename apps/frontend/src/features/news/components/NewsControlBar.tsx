'use client';

import { Globe, Radio, Code2, Settings, Play, Loader2 } from 'lucide-react';
import type { NewsProviderType } from '../types';

interface NewsControlBarProps {
  selectedTab: NewsProviderType | 'ALL';
  onSelectTab: (tab: NewsProviderType | 'ALL') => void;
  selectedCoin: string;
  onSelectCoin: (coin: string) => void;
  intervalMinutes: number;
  onIntervalChange: (minutes: number) => void;
  onOpenSourceModal: () => void;
  onOpenHtmlModal: () => void;
  onTriggerCrawl: () => void;
  isCrawling: boolean;
  isAdmin?: boolean;
}

export function NewsControlBar({
  selectedTab,
  onSelectTab,
  selectedCoin,
  onSelectCoin,
  intervalMinutes,
  onIntervalChange,
  onOpenSourceModal,
  onOpenHtmlModal,
  onTriggerCrawl,
  isCrawling,
  isAdmin = false,
}: NewsControlBarProps) {
  const intervals = [1, 2, 3, 4, 5];

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-6">
        {/* Source Tabs */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Nguồn
          </span>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => onSelectTab('WEBSITE')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                selectedTab === 'WEBSITE'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe className="size-3.5" />
              Website
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('RSS')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                selectedTab === 'RSS'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Radio className="size-3.5" />
              RSS
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('HTML')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                selectedTab === 'HTML'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Code2 className="size-3.5" />
              {'</> HTML'}
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('ALL')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                selectedTab === 'ALL'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả
            </button>
          </div>
        </div>

        {/* Pair / Asset Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Pair (Asset)
          </span>
          <select
            value={selectedCoin}
            onChange={(e) => onSelectCoin(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">BTC, ETH, SOL (Tất cả)</option>
            <option value="BTC">BTC (Bitcoin)</option>
            <option value="ETH">ETH (Ethereum)</option>
            <option value="SOL">SOL (Solana)</option>
          </select>
        </div>

        {/* Auto Refresh Interval */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Auto refresh
          </span>
          {isAdmin ? (
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {intervals.map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => onIntervalChange(min)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    intervalMinutes === min
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {min} phút
                </button>
              ))}
            </div>
          ) : (
            <span className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
              {intervalMinutes} phút
            </span>
          )}
        </div>
      </div>

      {/* Admin Action Buttons */}
      {isAdmin && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenHtmlModal}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <Code2 className="size-4 text-purple-600" />
            Nhập HTML
          </button>

          <button
            type="button"
            onClick={onOpenSourceModal}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <Settings className="size-4 text-slate-500" />
            Cấu hình nguồn
          </button>

          <button
            type="button"
            disabled={isCrawling}
            onClick={onTriggerCrawl}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {isCrawling ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4 fill-white" />
            )}
            {isCrawling ? 'Đang crawl...' : 'Bắt đầu crawl'}
          </button>
        </div>
      )}
    </div>
  );
}
