import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNews } from '../../../../src/features/news/hooks/useNews';
import * as newsClient from '../../../../src/features/news/api/newsClient';

vi.mock('../../../../src/features/news/api/newsClient', () => ({
  fetchNewsItems: vi.fn(),
  fetchNewsSources: vi.fn(),
  fetchNewsStats: vi.fn(),
  fetchCrawlInterval: vi.fn(),
  updateCrawlInterval: vi.fn(),
  triggerCrawl: vi.fn(),
  ingestHtml: vi.fn(),
}));

describe('useNews hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(newsClient.fetchNewsItems).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    vi.mocked(newsClient.fetchNewsSources).mockResolvedValue([]);
    vi.mocked(newsClient.fetchNewsStats).mockResolvedValue({
      totalItems: 0,
      totalSources: 0,
      enabledSources: 0,
      activeSources: 0,
      coveragePercent: 0,
    });
    vi.mocked(newsClient.fetchCrawlInterval).mockResolvedValue({
      intervalMinutes: 5,
    });
  });

  it('regular users fetch and reflect the admin-configured crawl interval on mount', async () => {
    const { result } = renderHook(() => useNews({ isAdmin: false }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(newsClient.fetchCrawlInterval).toHaveBeenCalled();
    expect(result.current.intervalMinutes).toBe(5);
  });

  it('falls back to 3 minutes if fetching crawl interval fails', async () => {
    vi.mocked(newsClient.fetchCrawlInterval).mockRejectedValue(
      new Error('Network error'),
    );

    const { result } = renderHook(() => useNews({ isAdmin: false }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.intervalMinutes).toBe(3);
  });

  it('admin can change crawl interval and updates state', async () => {
    vi.mocked(newsClient.updateCrawlInterval).mockResolvedValue({
      intervalMinutes: 4,
    });

    const { result } = renderHook(() => useNews({ isAdmin: true }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.handleIntervalChange(4);
    });

    expect(newsClient.updateCrawlInterval).toHaveBeenCalledWith(4);
    expect(result.current.intervalMinutes).toBe(4);
  });

  it('resets page to 1 when changing selectedTab or selectedCoin', async () => {
    const { result } = renderHook(() => useNews());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.page).toBe(3);

    act(() => {
      result.current.setSelectedTab('RSS');
    });
    expect(result.current.selectedTab).toBe('RSS');
    expect(result.current.page).toBe(1);

    act(() => {
      result.current.setPage(5);
    });
    expect(result.current.page).toBe(5);

    act(() => {
      result.current.setSelectedCoin('BTC');
    });
    expect(result.current.selectedCoin).toBe('BTC');
    expect(result.current.page).toBe(1);
  });

  it('handleLoadMore appends additional items and updates total', async () => {
    vi.mocked(newsClient.fetchNewsItems).mockResolvedValueOnce({
      items: [
        {
          id: 'news-1',
          title: 'News 1',
          content: 'Content 1',
          source: 'CoinDesk',
          url: 'https://coindesk.com/1',
          publishedAt: '2026-08-30T10:00:00.000Z',
          relatedCoins: ['BTC'],
          createdAt: '2026-08-30T10:00:00.000Z',
          updatedAt: '2026-08-30T10:00:00.000Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
    });

    const { result } = renderHook(() => useNews());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);

    vi.mocked(newsClient.fetchNewsItems).mockResolvedValueOnce({
      items: [
        {
          id: 'news-2',
          title: 'News 2',
          content: 'Content 2',
          source: 'CoinDesk',
          url: 'https://coindesk.com/2',
          publishedAt: '2026-08-30T10:05:00.000Z',
          relatedCoins: ['ETH'],
          createdAt: '2026-08-30T10:05:00.000Z',
          updatedAt: '2026-08-30T10:05:00.000Z',
        },
      ],
      total: 2,
      page: 2,
      limit: 20,
    });

    await act(async () => {
      await result.current.handleLoadMore();
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.hasMore).toBe(false);
  });
});
