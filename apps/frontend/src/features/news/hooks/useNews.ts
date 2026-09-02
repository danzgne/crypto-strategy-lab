'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  NewsItem,
  NewsSource,
  NewsStats,
  NewsProviderType,
} from '../types';
import {
  fetchNewsItems,
  fetchNewsSources,
  fetchNewsStats,
  triggerCrawl,
  fetchCrawlInterval,
  updateCrawlInterval,
  ingestHtml,
} from '../api/newsClient';

async function fetchNewsBundle(params: {
  page: number;
  limit: number;
  selectedTab: NewsProviderType | 'ALL';
  selectedCoin: string;
}) {
  const providerType =
    params.selectedTab === 'ALL' ? undefined : params.selectedTab;
  const coin = params.selectedCoin === 'ALL' ? undefined : params.selectedCoin;

  const [newsData, sourcesData, statsData, intervalData] = await Promise.all([
    fetchNewsItems({
      page: params.page,
      limit: params.limit,
      providerType,
      coin,
    }),
    fetchNewsSources().catch(() => []),
    fetchNewsStats(coin).catch(() => ({
      totalItems: 0,
      totalSources: 0,
      enabledSources: 0,
      activeSources: 0,
      coveragePercent: 0,
    })),
    fetchCrawlInterval().catch(() => ({ intervalMinutes: 3 })),
  ]);

  const now = new Date();
  return {
    items: newsData.items,
    total: newsData.total,
    sources: sourcesData,
    stats: statsData,
    intervalMinutes: intervalData?.intervalMinutes,
    lastUpdated: now.toLocaleTimeString('en-US', { hour12: false }),
  };
}

export interface UseNewsOptions {
  isAdmin?: boolean;
}

export function useNews(options: UseNewsOptions = {}) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [stats, setStats] = useState<NewsStats>({
    totalItems: 0,
    totalSources: 0,
    enabledSources: 0,
    activeSources: 0,
    coveragePercent: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<NewsProviderType | 'ALL'>(
    'ALL',
  );
  const [selectedCoin, setSelectedCoin] = useState<string>('ALL');
  const [intervalMinutes, setIntervalMinutesState] = useState<number>(3);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const [crawlNotice, setCrawlNotice] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSelectTab = useCallback((tab: NewsProviderType | 'ALL') => {
    setSelectedTab(tab);
    setPage(1);
  }, []);

  const handleSelectCoin = useCallback((coin: string) => {
    setSelectedCoin(coin);
    setPage(1);
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = Math.floor(items.length / limit) + 1;
      const providerType = selectedTab === 'ALL' ? undefined : selectedTab;
      const coin = selectedCoin === 'ALL' ? undefined : selectedCoin;

      const res = await fetchNewsItems({
        page: nextPage,
        limit,
        providerType,
        coin,
      });

      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const newItems = res.items.filter((i) => !existingIds.has(i.id));
        return [...prev, ...newItems];
      });
      setTotal(res.total);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load more news';
      setErrorMessage(msg);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, items.length, limit, selectedTab, selectedCoin]);

  const loadNews = useCallback(async () => {
    try {
      const bundle = await fetchNewsBundle({
        page,
        limit,
        selectedTab,
        selectedCoin,
      });
      setItems(bundle.items);
      setTotal(bundle.total);
      setSources(bundle.sources);
      setStats(bundle.stats);
      if (bundle.intervalMinutes) {
        setIntervalMinutesState(bundle.intervalMinutes);
      }
      setLastUpdated(bundle.lastUpdated);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load news data';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, selectedTab, selectedCoin]);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        const bundle = await fetchNewsBundle({
          page,
          limit,
          selectedTab,
          selectedCoin,
        });

        if (!active) return;
        setItems(bundle.items);
        setTotal(bundle.total);
        setSources(bundle.sources);
        setStats(bundle.stats);
        if (bundle.intervalMinutes) {
          setIntervalMinutesState(bundle.intervalMinutes);
        }
        setLastUpdated(bundle.lastUpdated);
      } catch (err) {
        if (active) {
          const msg =
            err instanceof Error ? err.message : 'Failed to load news data';
          setErrorMessage(msg);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      active = false;
    };
  }, [page, limit, selectedTab, selectedCoin]);

  // Auto-refresh interval timer
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
    timerRef.current = setInterval(() => {
      void loadNews();
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [intervalMinutes, loadNews]);

  const handleTriggerCrawl = async () => {
    if (options.isAdmin === false) {
      setErrorMessage(
        'ADMIN role is required to trigger a crawl. Please sign out and back in with an ADMIN account (admin@example.com / admin123).',
      );
      return;
    }
    setIsCrawling(true);
    setErrorMessage(null);
    setCrawlNotice(null);
    try {
      const summary = await triggerCrawl();
      await loadNews();

      if (summary && Array.isArray(summary.results)) {
        const failed = summary.results.filter((r) => r.status === 'FAILURE');
        const succeeded = summary.results.filter((r) => r.status === 'SUCCESS');

        if (failed.length > 0) {
          const failDetails = failed
            .map((f) => `• ${f.sourceName}: ${f.error || 'Unknown error'}`)
            .join('\n');
          setCrawlNotice({
            type: 'warning',
            message: `Crawl completed: ${succeeded.length}/${summary.sourcesProcessed} sources succeeded, ${failed.length} sources failed.\nError details:\n${failDetails}`,
          });
        } else {
          setCrawlNotice({
            type: 'success',
            message: `Crawl completed successfully! Found ${summary.totalFound} new articles across all ${summary.sourcesProcessed} sources.`,
          });
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to trigger crawl';
      if (
        msg.includes('Forbidden') ||
        msg.includes('403') ||
        msg.includes('role')
      ) {
        setErrorMessage(
          'ADMIN role is required to trigger a crawl. Please sign out and back in with an ADMIN account (admin@example.com / admin123).',
        );
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsCrawling(false);
    }
  };

  const handleIntervalChange = async (minutes: number) => {
    if (options.isAdmin === false) {
      setErrorMessage(
        'ADMIN role is required to change the crawl interval. Please sign in with an ADMIN account.',
      );
      return;
    }
    setIntervalMinutesState(minutes);
    setErrorMessage(null);
    try {
      await updateCrawlInterval(minutes);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to update the interval';
      if (
        msg.includes('Forbidden') ||
        msg.includes('403') ||
        msg.includes('role')
      ) {
        setErrorMessage(
          'ADMIN role is required to change the crawl interval. Please sign in with an ADMIN account.',
        );
      }
    }
  };

  const handleIngestHtml = async (data: {
    title: string;
    html: string;
    url?: string | undefined;
    source?: string | undefined;
    relatedCoins?: string[] | undefined;
  }) => {
    const newItem = await ingestHtml(data);
    await loadNews();
    return newItem;
  };

  return {
    items,
    total,
    hasMore: items.length < total,
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
    setSelectedTab: handleSelectTab,
    selectedCoin,
    setSelectedCoin: handleSelectCoin,
    intervalMinutes,
    handleIntervalChange,
    lastUpdated,
    page,
    setPage,
    loadNews,
    handleTriggerCrawl,
    handleIngestHtml,
  };
}
