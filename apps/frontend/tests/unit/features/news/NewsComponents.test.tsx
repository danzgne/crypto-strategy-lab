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
      />,
    );

    expect(screen.getByText('Website')).toBeInTheDocument();
    expect(screen.getByText('RSS')).toBeInTheDocument();
    expect(screen.getByText('</> HTML')).toBeInTheDocument();

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
});
