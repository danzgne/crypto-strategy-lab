'use client';

import { useState } from 'react';
import { X, Code2, Loader2, Check } from 'lucide-react';

interface AdminHtmlPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIngest: (data: {
    title: string;
    html: string;
    url?: string | undefined;
    source?: string | undefined;
    relatedCoins?: string[] | undefined;
  }) => Promise<unknown>;
}

export function AdminHtmlPasteModal({
  isOpen,
  onClose,
  onIngest,
}: AdminHtmlPasteModalProps) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('HTML Ingest');
  const [url, setUrl] = useState('');
  const [coins, setCoins] = useState('BTC, ETH');
  const [html, setHtml] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    setSuccess(false);

    try {
      const parsedCoins = coins
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length > 0);

      const payload: {
        title: string;
        html: string;
        source?: string | undefined;
        url?: string | undefined;
        relatedCoins?: string[] | undefined;
      } = {
        title: title.trim(),
        html: html.trim(),
        source: source.trim() || 'HTML Ingest',
        relatedCoins: parsedCoins,
      };

      if (url.trim()) {
        payload.url = url.trim();
      }

      await onIngest(payload);

      setSuccess(true);
      setTitle('');
      setHtml('');
      setUrl('');
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ingest HTML');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Code2 className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Nhập tin tức bằng Raw HTML
              </h3>
              <p className="text-xs text-slate-500">
                Thêm bài báo trực tiếp vào kho dữ liệu tin tức chung
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-4"
        >
          {error && (
            <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-600 border border-rose-200">
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-200">
              <Check className="size-4" />
              <span>Đã nhập bài báo thành công!</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tiêu đề bài viết *
            </label>
            <input
              type="text"
              required
              placeholder="VD: Bitcoin ETF Inflows Reach All-Time High"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên nguồn
              </label>
              <input
                type="text"
                placeholder="VD: CoinDesk"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Coins liên quan (phân tách bằng dấu phẩy)
              </label>
              <input
                type="text"
                placeholder="BTC, ETH, SOL"
                value={coins}
                onChange={(e) => setCoins(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              URL bài viết gốc (Tùy chọn)
            </label>
            <input
              type="url"
              placeholder="https://example.com/article-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nội dung HTML hoặc Text thô *
            </label>
            <textarea
              required
              rows={6}
              placeholder="<div><h1>...</h1><p>Dán đoạn mã HTML bài báo vào đây...</p></div>"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-3 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isSubmitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              <span>Nhập bài báo</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
