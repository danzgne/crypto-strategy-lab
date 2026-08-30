'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import {
  NewsHeader,
  NewsControlBar,
  NewsFeedList,
  ExtractionDiagramPanel,
  SelfHealingDiagramPanel,
  AnalysisOutputPanel,
  StrategyIntegrationPanel,
  AdminSourceModal,
  AdminHtmlPasteModal,
  useNews,
} from '../../../features/news';
import { useAuth } from '../../../features/auth';

export default function NewsPage() {
  const { isAdmin } = useAuth();
  const {
    items,
    total,
    hasMore,
    isLoadingMore,
    handleLoadMore,
    sources,
    stats,
    isLoading,
    isCrawling,
    errorMessage,
    setErrorMessage,
    crawlNotice,
    setCrawlNotice,
    selectedTab,
    setSelectedTab,
    selectedCoin,
    setSelectedCoin,
    intervalMinutes,
    handleIntervalChange,
    lastUpdated,
    loadNews,
    handleTriggerCrawl,
    handleIngestHtml,
  } = useNews({ isAdmin });

  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [isHtmlModalOpen, setIsHtmlModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <NewsHeader />

      {/* Crawl Result / Feedback Banner */}
      {crawlNotice && (
        <div
          className={`flex items-start justify-between rounded-xl border p-4 text-xs shadow-xs ${
            crawlNotice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : crawlNotice.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {crawlNotice.type === 'success' ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" />
            ) : crawlNotice.type === 'warning' ? (
              <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
            ) : (
              <AlertCircle className="size-4 shrink-0 text-rose-600 mt-0.5" />
            )}
            <div className="space-y-1">
              <p className="font-semibold">
                {crawlNotice.type === 'success'
                  ? 'Crawl thành công'
                  : crawlNotice.type === 'warning'
                    ? 'Crawl hoàn tất có cảnh báo lỗi nguồn'
                    : 'Crawl thất bại'}
              </p>
              <p className="whitespace-pre-line font-medium opacity-90 leading-relaxed">
                {crawlNotice.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCrawlNotice(null)}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-200/50 transition"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="size-4 shrink-0 text-rose-600" />
            <p className="font-medium">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="rounded-lg p-1 text-rose-600 hover:bg-rose-100 transition"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Control Bar */}
      <NewsControlBar
        selectedTab={selectedTab}
        onSelectTab={setSelectedTab}
        selectedCoin={selectedCoin}
        onSelectCoin={setSelectedCoin}
        intervalMinutes={intervalMinutes}
        onIntervalChange={handleIntervalChange}
        onOpenSourceModal={() => setIsSourceModalOpen(true)}
        onOpenHtmlModal={() => setIsHtmlModalOpen(true)}
        onTriggerCrawl={handleTriggerCrawl}
        isCrawling={isCrawling}
        isAdmin={isAdmin}
      />

      {/* Main 3-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left Column: Tin tức đầu vào (News Feed) */}
        <div className="lg:col-span-4 h-[780px]">
          <NewsFeedList
            items={items}
            total={total}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={handleLoadMore}
            isLoading={isLoading}
            lastUpdated={lastUpdated}
            onRefresh={loadNews}
          />
        </div>

        {/* Middle Column: LLM Extraction & Self-Healing */}
        <div className="lg:col-span-5 space-y-6">
          <ExtractionDiagramPanel isAdmin={isAdmin} />
          <SelfHealingDiagramPanel isAdmin={isAdmin} />
        </div>

        {/* Right Column: Analytics Output & Strategy Integration */}
        <div className="lg:col-span-3 space-y-6">
          <AnalysisOutputPanel stats={stats} lastUpdated={lastUpdated} />
          <StrategyIntegrationPanel />
        </div>
      </div>

      {/* Admin Modals */}
      {isAdmin && (
        <>
          <AdminSourceModal
            isOpen={isSourceModalOpen}
            onClose={() => setIsSourceModalOpen(false)}
            sources={sources}
            onRefresh={loadNews}
          />

          <AdminHtmlPasteModal
            isOpen={isHtmlModalOpen}
            onClose={() => setIsHtmlModalOpen(false)}
            onIngest={handleIngestHtml}
          />
        </>
      )}
    </div>
  );
}
