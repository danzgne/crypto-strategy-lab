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
});
