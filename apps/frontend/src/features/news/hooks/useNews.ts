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

export function useNews({ isAdmin = false }: { isAdmin?: boolean } = {}) {
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

  const loadNews = useCallback(async () => {
    try {
      const providerType = selectedTab === 'ALL' ? undefined : selectedTab;
      const coin = selectedCoin === 'ALL' ? undefined : selectedCoin;

      const [newsData, sourcesData, statsData] = await Promise.all([
        fetchNewsItems({ page, limit, providerType, coin }),
        fetchNewsSources().catch(() => []),
        fetchNewsStats().catch(() => ({
          totalItems: 0,
          totalSources: 0,
          activeSources: 0,
          coveragePercent: 0,
        })),
      ]);

      setItems(newsData.items);
      setTotal(newsData.total);
      setSources(sourcesData);
      setStats(statsData);

      const now = new Date();
      setLastUpdated(now.toLocaleTimeString('vi-VN', { hour12: false }));
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, selectedTab, selectedCoin]);

  useEffect(() => {
    let active = true;

    async function fetchInitial() {
      try {
        const providerType = selectedTab === 'ALL' ? undefined : selectedTab;
        const coin = selectedCoin === 'ALL' ? undefined : selectedCoin;

        const [newsData, sourcesData, statsData, intervalData] =
          await Promise.all([
            fetchNewsItems({ page, limit, providerType, coin }),
            fetchNewsSources().catch(() => []),
            fetchNewsStats().catch(() => ({
              totalItems: 0,
              totalSources: 0,
              activeSources: 0,
              coveragePercent: 0,
            })),
            isAdmin
              ? fetchCrawlInterval().catch(() => ({ intervalMinutes: 3 }))
              : Promise.resolve({ intervalMinutes: 3 }),
          ]);

        if (!active) return;
        setItems(newsData.items);
        setTotal(newsData.total);
        setSources(sourcesData);
        setStats(statsData);
        if (intervalData?.intervalMinutes) {
          setIntervalMinutesState(intervalData.intervalMinutes);
        }
        const now = new Date();
        setLastUpdated(now.toLocaleTimeString('vi-VN', { hour12: false }));
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
  }, [page, limit, selectedTab, selectedCoin, isAdmin]);

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
