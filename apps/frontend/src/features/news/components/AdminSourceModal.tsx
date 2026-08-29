'use client';

import { useState } from 'react';
import { X, Plus, Radio, Globe, Loader2, Check } from 'lucide-react';
import type { NewsSource, NewsProviderType } from '../types';
import { createNewsSource } from '../api/newsClient';

interface AdminSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources: NewsSource[];
  onRefresh: () => void;
}

export function AdminSourceModal({
  isOpen,
  onClose,
  sources,
  onRefresh,
}: AdminSourceModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [providerType, setProviderType] = useState<NewsProviderType>('RSS');
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
      await createNewsSource({
        name: name.trim(),
        url: url.trim(),
        providerType,
        isActive: true,
      });

      setSuccess(true);
      setName('');
      setUrl('');
      onRefresh();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create news source',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Cấu hình nguồn tin tức
            </h3>
            <p className="text-xs text-slate-500">
              Quản lý các nguồn RSS Feed và Website trích xuất dữ liệu
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Add New Source Form */}
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
          >
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Thêm nguồn mới
            </h4>

            {error && (
              <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-600 border border-rose-200">
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-700 border border-emerald-200">
                <Check className="size-4" />
                <span>Đã thêm nguồn tin tức thành công!</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tên nguồn
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: CoinDesk RSS"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Loại nguồn
                </label>
                <select
                  value={providerType}
                  onChange={(e) =>
                    setProviderType(e.target.value as NewsProviderType)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="RSS">RSS Feed</option>
                  <option value="WEBSITE">Website (HTML)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                URL nguồn
              </label>
              <input
                type="url"
                required
                placeholder="https://example.com/rss"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {isSubmitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                <span>Thêm nguồn</span>
              </button>
            </div>
          </form>

          {/* List of Configured Sources */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
              Danh sách nguồn đang cấu hình ({sources.length})
            </h4>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
              {sources.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  Chưa có nguồn nào được cấu hình.
                </div>
              ) : (
                sources.map((src) => (
                  <div
                    key={src.id}
                    className="flex items-center justify-between p-3 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        {src.providerType === 'RSS' ? (
                          <Radio className="size-3.5" />
                        ) : (
                          <Globe className="size-3.5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800">
                            {src.name}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            {src.providerType}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono truncate max-w-sm">
                          {src.url}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          src.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {src.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-3 bg-slate-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
