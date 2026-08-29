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
    fetchNewsStats().catch(() => ({
      totalItems: 0,
      totalSources: 0,
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
    lastUpdated: now.toLocaleTimeString('vi-VN', { hour12: false }),
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
    activeSources: 0,
    coveragePercent: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
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

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchInitial() {
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
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void fetchInitial();

    return () => {
      active = false;
    };
  }, [page, limit, selectedTab, selectedCoin]);

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
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
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
        'Yêu cầu quyền ADMIN để kích hoạt crawl. Bạn hãy đăng xuất và đăng nhập lại bằng tài khoản ADMIN (admin@example.com / admin123).',
      );
      return;
    }
    setIsCrawling(true);
    setErrorMessage(null);
    try {
      await triggerCrawl();
      await loadNews();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Kích hoạt crawl thất bại';
      if (
        msg.includes('Forbidden') ||
        msg.includes('403') ||
        msg.includes('role')
      ) {
        setErrorMessage(
          'Yêu cầu quyền ADMIN để kích hoạt crawl. Bạn hãy đăng xuất và đăng nhập lại bằng tài khoản ADMIN (admin@example.com / admin123).',
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
        'Yêu cầu quyền ADMIN để đổi chu kỳ crawl. Bạn hãy đăng nhập với tài khoản ADMIN.',
      );
      return;
    }
    setIntervalMinutesState(minutes);
    setErrorMessage(null);
    try {
      await updateCrawlInterval(minutes);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Cập nhật chu kỳ thất bại';
      if (
        msg.includes('Forbidden') ||
        msg.includes('403') ||
        msg.includes('role')
      ) {
        setErrorMessage(
          'Yêu cầu quyền ADMIN để đổi chu kỳ crawl. Bạn hãy đăng nhập với tài khoản ADMIN.',
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
    page,
    setPage,
    loadNews,
    handleTriggerCrawl,
    handleIngestHtml,
  };
}
