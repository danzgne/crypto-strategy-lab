'use client';

import { useState } from 'react';
import {
  X,
  Plus,
  Radio,
  Globe,
  Loader2,
  Check,
  Trash2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import type { NewsSource, NewsProviderType } from '../types';
import {
  createNewsSource,
  deleteNewsSource,
  updateNewsSource,
} from '../api/newsClient';

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setActionError(null);
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
        err instanceof Error ? err.message : 'Failed to add news source',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!sourceToDelete) return;
    const { id } = sourceToDelete;
    setActionError(null);
    setDeletingId(id);
    try {
      await deleteNewsSource(id);
      setSourceToDelete(null);
      onRefresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to delete news source',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (source: NewsSource) => {
    setActionError(null);
    setTogglingId(source.id);
    try {
      await updateNewsSource(source.id, {
        isActive: !source.isActive,
      });
      onRefresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to update source status',
      );
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Configure news sources
            </h3>
            <p className="text-xs text-slate-500">
              Manage RSS Feed and Website extraction sources
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
          {actionError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertCircle className="size-4 shrink-0 text-rose-600" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Add New Source Form */}
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
          >
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Add new source
            </h4>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-600 border border-rose-200">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-700 border border-emerald-200">
                <Check className="size-4" />
                <span>News source added successfully!</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Source name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CoinDesk RSS"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Provider type
                </label>
                <select
                  value={providerType}
                  onChange={(e) =>
                    setProviderType(e.target.value as NewsProviderType)
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="RSS">RSS Feed</option>
                  <option value="WEBSITE">Website (HTML Scraper)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Source URL
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
                <span>Add source</span>
              </button>
            </div>
          </form>

          {/* List of Configured Sources */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
              Configured sources ({sources.length})
            </h4>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
              {sources.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No sources configured yet.
                </div>
              ) : (
                sources.map((src) => {
                  const lastAttempt = src.lastCrawlAttempt;
                  return (
                    <div
                      key={src.id}
                      className="p-3.5 hover:bg-slate-50 transition space-y-2"
                    >
                      <div className="flex items-center justify-between">
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
                            <p className="text-[11px] text-slate-400 font-mono truncate max-w-md">
                              {src.url}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Active / Inactive Button */}
                          <button
                            type="button"
                            disabled={togglingId === src.id}
                            onClick={() => handleToggleActive(src)}
                            className={`cursor-pointer rounded-full px-2.5 py-0.5 text-[10px] font-bold transition hover:opacity-80 disabled:opacity-50 ${
                              src.isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                            title="Click to enable / disable this source"
                          >
                            {togglingId === src.id ? (
                              <Loader2 className="size-3 animate-spin inline" />
                            ) : src.isActive ? (
                              'Active'
                            ) : (
                              'Disabled'
                            )}
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            disabled={deletingId === src.id}
                            onClick={() =>
                              setSourceToDelete({
                                id: src.id,
                                name: src.name,
                              })
                            }
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition disabled:opacity-50"
                            title="Delete this news source"
                          >
                            {deletingId === src.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Last Crawl Status Row */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1 font-medium">
                          <Clock className="size-3" />
                          Last crawl:
                        </span>

                        {lastAttempt ? (
                          lastAttempt.status === 'SUCCESS' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                              <CheckCircle2 className="size-3 text-emerald-600" />
                              Succeeded ({lastAttempt.itemsFound} items found)
                              <span className="text-emerald-600/70 font-normal">
                                •{' '}
                                {new Date(
                                  lastAttempt.crawledAt,
                                ).toLocaleTimeString('en-US')}
                              </span>
                            </span>
                          ) : (
                            <div className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-medium max-w-full truncate">
                              <XCircle className="size-3 shrink-0 text-rose-600" />
                              <span className="font-bold">Failed:</span>
                              <span
                                className="truncate"
                                title={
                                  lastAttempt.errorMessage || 'Unknown error'
                                }
                              >
                                {lastAttempt.errorMessage || 'Unknown error'}
                              </span>
                              <span className="text-rose-600/70 shrink-0">
                                •{' '}
                                {new Date(
                                  lastAttempt.crawledAt,
                                ).toLocaleTimeString('en-US')}
                              </span>
                            </div>
                          )
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">
                            No crawl data yet
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
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
            Close
          </button>
        </div>

        {/* Custom Confirmation Modal for Deletion */}
        {sourceToDelete && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                  <AlertCircle className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Confirm source deletion
                  </h4>
                  <p className="text-xs text-slate-500">
                    This action cannot be undone
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to delete the news source{' '}
                <span className="font-semibold text-slate-900">
                  &quot;{sourceToDelete.name}&quot;
                </span>
                ? All related crawl history will also be deleted.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={deletingId !== null}
                  onClick={() => setSourceToDelete(null)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingId !== null}
                  onClick={confirmDelete}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition shadow-sm"
                >
                  {deletingId !== null ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  <span>Confirm delete</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
