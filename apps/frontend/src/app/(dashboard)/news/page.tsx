'use client';

import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
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
    sources,
    stats,
    isLoading,
    isCrawling,
    errorMessage,
    setErrorMessage,
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

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="size-4 shrink-0 text-amber-600" />
            <p className="font-medium">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="rounded-lg p-1 text-amber-600 hover:bg-amber-100 transition"
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
