'use client';

import {
  X,
  ExternalLink,
  Globe,
  Radio,
  Code2,
  Calendar,
  Coins,
} from 'lucide-react';
import type { NewsItem } from '../types';

interface NewsDetailModalProps {
  item: NewsItem | null;
  isOpen: boolean;
  onClose: () => void;
}

function isExternalUrl(url?: string): boolean {
  if (!url) return false;
  return (
    (url.startsWith('http://') || url.startsWith('https://')) &&
    !url.includes('local.ingest')
  );
}

function formatFullDateTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

export function NewsDetailModal({
  item,
  isOpen,
  onClose,
}: NewsDetailModalProps) {
  if (!isOpen || !item) return null;

  const hasExternalLink = isExternalUrl(item.url);

  const getSourceIcon = (sourceName: string) => {
    const lower = sourceName.toLowerCase();
    if (lower.includes('html') || lower.includes('ingest')) {
      return <Code2 className="size-3.5 text-purple-600" />;
    }
    if (lower.includes('rss') || lower.includes('coindesk')) {
      return <Radio className="size-3.5 text-amber-600" />;
    }
    return <Globe className="size-3.5 text-blue-600" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-xs">
              {getSourceIcon(item.source)}
              <span>{item.source}</span>
            </span>

            {item.relatedCoins && item.relatedCoins.length > 0 && (
              <div className="flex items-center gap-1">
                <Coins className="size-3.5 text-slate-400" />
                <div className="flex items-center gap-1">
                  {item.relatedCoins.map((coin) => (
                    <span
                      key={coin}
                      className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200/60"
                    >
                      {coin}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 leading-snug">
              {item.title}
            </h2>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <Calendar className="size-3.5" />
              <span>
                Thời gian đăng: {formatFullDateTime(item.publishedAt)}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Nội dung bài viết
            </h3>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800 font-normal selection:bg-blue-100">
              {item.content}
            </p>
          </div>

          {!hasExternalLink && (
            <div className="rounded-lg bg-slate-100/80 px-3.5 py-2.5 text-xs text-slate-600 border border-slate-200/70 flex items-center gap-2">
              <Code2 className="size-4 shrink-0 text-slate-500" />
              <span>
                Tin tức này được nhập trực tiếp qua HTML và không có liên kết
                trang ngoài.
              </span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3.5 bg-slate-50/50">
          <div>
            {hasExternalLink ? (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 shadow-xs hover:bg-blue-100 transition"
              >
                <span>Mở bài viết gốc</span>
                <ExternalLink className="size-3.5" />
              </a>
            ) : (
              <span className="text-xs text-slate-400 italic">
                Nguồn lưu trữ nội bộ
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
