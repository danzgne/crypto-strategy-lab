import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NewsFeedList } from '../../../../src/features/news/components/NewsFeedList';
import { NewsControlBar } from '../../../../src/features/news/components/NewsControlBar';
import { AnalysisOutputPanel } from '../../../../src/features/news/components/AnalysisOutputPanel';
import { ExtractionDiagramPanel } from '../../../../src/features/news/components/ExtractionDiagramPanel';
import { SelfHealingDiagramPanel } from '../../../../src/features/news/components/SelfHealingDiagramPanel';
import type { NewsItem } from '../../../../src/features/news/types';

describe('News Frontend Components', () => {
  const sampleItems: NewsItem[] = [
    {
      id: 'news-1',
      title: 'Bitcoin ETF Inflows Surge Past $200M',
      content: 'Massive institutional interest drives crypto markets upward.',
      source: 'CoinDesk',
      url: 'https://example.com/btc-etf',
      publishedAt: '2026-08-29T10:40:00.000Z',
      relatedCoins: ['BTC'],
      createdAt: '2026-08-29T10:40:00.000Z',
      updatedAt: '2026-08-29T10:40:00.000Z',
    },
    {
      id: 'news-2',
      title: 'Ethereum Pectra Testnet Upgrade Live',
      content:
        'Core developers confirm successful deployment of Pectra upgrade.',
      source: 'The Block',
      url: 'https://example.com/eth-pectra',
      publishedAt: '2026-08-29T10:32:00.000Z',
      relatedCoins: ['ETH'],
      createdAt: '2026-08-29T10:32:00.000Z',
      updatedAt: '2026-08-29T10:32:00.000Z',
    },
  ];

  it('NewsFeedList renders news items with titles and sources', () => {
    const onRefresh = vi.fn();
    render(
      <NewsFeedList
        items={sampleItems}
        isLoading={false}
        lastUpdated="10:45:18"
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText('Tin tức đầu vào')).toBeInTheDocument();
    expect(
      screen.getByText('Bitcoin ETF Inflows Surge Past $200M'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ethereum Pectra Testnet Upgrade Live'),
    ).toBeInTheDocument();
    expect(screen.getByText('CoinDesk')).toBeInTheDocument();
    expect(screen.getByText('The Block')).toBeInTheDocument();
  });

  it('NewsControlBar renders tabs and triggers tab selection', () => {
    const onSelectTab = vi.fn();
    const onSelectCoin = vi.fn();
    const onIntervalChange = vi.fn();
    const onOpenSourceModal = vi.fn();
    const onOpenHtmlModal = vi.fn();
    const onTriggerCrawl = vi.fn();

    render(
      <NewsControlBar
        selectedTab="ALL"
        onSelectTab={onSelectTab}
        selectedCoin="ALL"
        onSelectCoin={onSelectCoin}
        intervalMinutes={3}
        onIntervalChange={onIntervalChange}
        onOpenSourceModal={onOpenSourceModal}
        onOpenHtmlModal={onOpenHtmlModal}
        onTriggerCrawl={onTriggerCrawl}
        isCrawling={false}
        isAdmin={true}
      />,
    );

    expect(screen.getByText('Website')).toBeInTheDocument();
    expect(screen.getByText('RSS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'HTML' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('RSS'));
    expect(onSelectTab).toHaveBeenCalledWith('RSS');

    fireEvent.click(screen.getByText('Bắt đầu crawl'));
    expect(onTriggerCrawl).toHaveBeenCalled();
  });

  it('AnalysisOutputPanel renders sentiment aggregate and source coverage', () => {
    render(
      <AnalysisOutputPanel
        stats={{
          totalItems: 120,
          totalSources: 5,
          activeSources: 5,
          coveragePercent: 100,
        }}
        lastUpdated="10:45"
      />,
    );

    expect(screen.getByText('Đầu ra phân tích')).toBeInTheDocument();
    expect(screen.getByText('Sentiment tổng hợp (24h)')).toBeInTheDocument();
    expect(screen.getByText('58%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('ExtractionDiagramPanel and SelfHealingDiagramPanel render properly', () => {
    render(
      <div>
        <ExtractionDiagramPanel />
        <SelfHealingDiagramPanel />
      </div>,
    );

    expect(screen.getByText('LLM-assisted Extraction')).toBeInTheDocument();
    expect(screen.getByText('Template: v1.4.2')).toBeInTheDocument();
    expect(screen.getByText('Self-healing extraction')).toBeInTheDocument();
    expect(screen.getByText('Validate kết quả')).toBeInTheDocument();
  });

  it('NewsControlBar hides admin action buttons when isAdmin is false but keeps filter tabs', () => {
    const onSelectTab = vi.fn();
    const onSelectCoin = vi.fn();
    const onIntervalChange = vi.fn();
    const onOpenSourceModal = vi.fn();
    const onOpenHtmlModal = vi.fn();
    const onTriggerCrawl = vi.fn();

    render(
      <NewsControlBar
        selectedTab="ALL"
        onSelectTab={onSelectTab}
        selectedCoin="ALL"
        onSelectCoin={onSelectCoin}
        intervalMinutes={3}
        onIntervalChange={onIntervalChange}
        onOpenSourceModal={onOpenSourceModal}
        onOpenHtmlModal={onOpenHtmlModal}
        onTriggerCrawl={onTriggerCrawl}
        isCrawling={false}
        isAdmin={false}
      />,
    );

    // Regular user sees Website, RSS, and HTML filter tabs
    expect(screen.getByText('Website')).toBeInTheDocument();
    expect(screen.getByText('RSS')).toBeInTheDocument();
    const htmlTab = screen.getByRole('button', { name: 'HTML' });
    expect(htmlTab).toBeInTheDocument();

    // Clicking HTML tab only triggers tab selection, not modal opening
    fireEvent.click(htmlTab);
    expect(onSelectTab).toHaveBeenCalledWith('HTML');
    expect(onOpenHtmlModal).not.toHaveBeenCalled();

    // Regular user does NOT see admin action buttons
    expect(screen.queryByText('Nhập HTML')).not.toBeInTheDocument();
    expect(screen.queryByText('Cấu hình nguồn')).not.toBeInTheDocument();
    expect(screen.queryByText('Bắt đầu crawl')).not.toBeInTheDocument();

    // Auto refresh interval is displayed as read-only badge
    expect(screen.getByText('3 phút')).toBeInTheDocument();
    // Select dropdown for auto refresh should not exist for regular user
    expect(
      screen.queryByRole('combobox', { name: 'Chu kỳ tự động làm mới' }),
    ).not.toBeInTheDocument();
  });

  it('NewsControlBar shows admin buttons (Nhập HTML, Cấu hình nguồn, Bắt đầu crawl) and auto refresh select when isAdmin is true', () => {
    const onSelectTab = vi.fn();
    const onSelectCoin = vi.fn();
    const onIntervalChange = vi.fn();
    const onOpenSourceModal = vi.fn();
    const onOpenHtmlModal = vi.fn();
    const onTriggerCrawl = vi.fn();

    render(
      <NewsControlBar
        selectedTab="ALL"
        onSelectTab={onSelectTab}
        selectedCoin="ALL"
        onSelectCoin={onSelectCoin}
        intervalMinutes={3}
        onIntervalChange={onIntervalChange}
        onOpenSourceModal={onOpenSourceModal}
        onOpenHtmlModal={onOpenHtmlModal}
        onTriggerCrawl={onTriggerCrawl}
        isCrawling={false}
        isAdmin={true}
      />,
    );

    expect(screen.getByRole('button', { name: 'HTML' })).toBeInTheDocument();
    expect(screen.getByText('Nhập HTML')).toBeInTheDocument();
    expect(screen.getByText('Cấu hình nguồn')).toBeInTheDocument();
    expect(screen.getByText('Bắt đầu crawl')).toBeInTheDocument();

    const intervalSelect = screen.getByRole('combobox', {
      name: 'Chu kỳ tự động làm mới',
    });
    expect(intervalSelect).toBeInTheDocument();
    fireEvent.change(intervalSelect, { target: { value: '5' } });
    expect(onIntervalChange).toHaveBeenCalledWith(5);

    // Clicking Nhập HTML action button triggers modal
    fireEvent.click(screen.getByText('Nhập HTML'));
    expect(onOpenHtmlModal).toHaveBeenCalled();
  });

  it('NewsFeedList renders total counter and triggers onLoadMore when load more button is clicked', () => {
    const onRefresh = vi.fn();
    const onLoadMore = vi.fn();
    const mockItem: NewsItem = {
      id: 'news-1',
      title: 'Bitcoin Hits 70k',
      content: 'Bitcoin breaks new records.',
      source: 'CoinDesk',
      url: 'https://coindesk.com/btc',
      publishedAt: '2026-08-30T10:00:00.000Z',
      relatedCoins: ['BTC'],
      createdAt: '2026-08-30T10:00:00.000Z',
      updatedAt: '2026-08-30T10:00:00.000Z',
    };

    render(
      <NewsFeedList
        items={[mockItem]}
        total={10}
        hasMore={true}
        isLoadingMore={false}
        onLoadMore={onLoadMore}
        isLoading={false}
        lastUpdated="11:00:00"
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText('1/10')).toBeInTheDocument();
    const loadMoreBtn = screen.getByText(/Xem thêm tin tức \(9 tin còn lại\)/);
    expect(loadMoreBtn).toBeInTheDocument();

    fireEvent.click(loadMoreBtn);
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('NewsFeedList opens NewsDetailModal on item click and handles internal URLs safely', () => {
    const onRefresh = vi.fn();
    const htmlItem: NewsItem = {
      id: 'news-html-1',
      title: 'Solana Ecosystem Update via Raw HTML',
      content: 'Solana DEX volume hits new weekly record high.',
      source: 'HTML Ingest',
      url: 'https://local.ingest/html/12345-6789',
      publishedAt: '2026-08-30T10:00:00.000Z',
      relatedCoins: ['SOL'],
      createdAt: '2026-08-30T10:00:00.000Z',
      updatedAt: '2026-08-30T10:00:00.000Z',
    };

    render(
      <NewsFeedList
        items={[htmlItem]}
        isLoading={false}
        lastUpdated="11:00:00"
        onRefresh={onRefresh}
      />,
    );

    // Modal is initially not open
    expect(screen.queryByText('Nội dung bài viết')).not.toBeInTheDocument();

    // Click on the article title
    fireEvent.click(screen.getByText('Solana Ecosystem Update via Raw HTML'));

    // Modal is now displayed with full content
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Nội dung bài viết')).toBeInTheDocument();
    expect(
      screen.getAllByText('Solana DEX volume hits new weekly record high.')
        .length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(
        'Tin tức này được nhập trực tiếp qua HTML và không có liên kết trang ngoài.',
      ),
    ).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByText('Đóng'));
    expect(screen.queryByText('Nội dung bài viết')).not.toBeInTheDocument();
  });
});
