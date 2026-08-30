'use client';

import { useState } from 'react';
import { ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import type { NewsItem } from '../types';
import { NewsDetailModal } from './NewsDetailModal';

interface NewsFeedListProps {
  items: NewsItem[];
  isLoading: boolean;
  lastUpdated: string;
  onRefresh: () => void;
}

function isExternalUrl(url?: string): boolean {
  if (!url) return false;
  return (
    (url.startsWith('http://') || url.startsWith('https://')) &&
    !url.includes('local.ingest')
  );
}

function CoinBadge({ coins }: { coins: string[] }) {
  if (coins.includes('BTC')) {
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500 font-bold text-white shadow-sm shadow-amber-500/30">
        ₿
      </div>
    );
  }
  if (coins.includes('ETH')) {
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 font-bold text-white shadow-sm shadow-indigo-600/30">
        Ξ
      </div>
    );
  }
  if (coins.includes('SOL')) {
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-purple-600 to-cyan-500 font-bold text-white shadow-sm shadow-purple-600/30">
        S
      </div>
    );
  }
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-700 font-bold text-white shadow-sm">
      📰
    </div>
  );
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

export function NewsFeedList({
  items,
  isLoading,
  lastUpdated,
  onRefresh,
}: NewsFeedListProps) {
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);

  return (
    <>
      <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm h-full">
        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Tin tức đầu vào
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-slate-400">
                Cập nhật: {lastUpdated}
              </span>
            )}
            <button
              type="button"
              onClick={onRefresh}
              aria-label="Refresh news"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            >
              <RefreshCw
                className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-[48px_1fr_90px_60px] gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs font-semibold text-slate-500">
          <div>Asset</div>
          <div>Tiêu đề</div>
          <div>Nguồn</div>
          <div className="text-right">Thời gian</div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {isLoading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="size-8 animate-spin text-blue-600" />
              <p className="mt-3 text-sm">Đang tải tin tức...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              Chưa có tin tức nào được thu thập.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[48px_1fr_90px_60px] items-start gap-3 px-5 py-3.5 hover:bg-slate-50/80 transition"
              >
                <div>
                  <CoinBadge coins={item.relatedCoins} />
                </div>

                <div className="min-w-0 pr-2">
                  <div className="flex items-start gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedArticle(item)}
                      className="group text-left text-xs font-bold text-slate-900 hover:text-blue-600 transition line-clamp-2"
                    >
                      {item.title}
                    </button>
                    {isExternalUrl(item.url) && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Mở bài viết gốc trong tab mới"
                        className="text-slate-400 hover:text-blue-600 p-0.5 rounded transition shrink-0 mt-0.5"
                      >
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  <p
                    onClick={() => setSelectedArticle(item)}
                    className="mt-1 text-xs text-slate-500 line-clamp-2 leading-relaxed cursor-pointer hover:text-slate-700 transition"
                  >
                    {item.content}
                  </p>
                </div>

                <div className="truncate text-xs font-medium text-slate-600">
                  <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                    {item.source}
                  </span>
                </div>

                <div className="text-right text-xs text-slate-400 font-mono">
                  {formatTime(item.publishedAt)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <NewsDetailModal
        item={selectedArticle}
        isOpen={!!selectedArticle}
        onClose={() => setSelectedArticle(null)}
      />
    </>
  );
}
