import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NewsFeedList } from '../../../../src/features/news/components/NewsFeedList';
import { NewsControlBar } from '../../../../src/features/news/components/NewsControlBar';
import { AnalysisOutputPanel } from '../../../../src/features/news/components/AnalysisOutputPanel';
import { ExtractionDiagramPanel } from '../../../../src/features/news/components/ExtractionDiagramPanel';
import { SelfHealingDiagramPanel } from '../../../../src/features/news/components/SelfHealingDiagramPanel';
import type {
  NewsItem,
  NewsSource,
  ExtractionPanelData,
} from '../../../../src/features/news/types';

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
      sentiment: {
        label: 'POSITIVE',
        score: 0.8,
        eventType: 'ETF_FUND_FLOW',
      },
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

    expect(screen.getByText('Incoming News')).toBeInTheDocument();
    expect(
      screen.getByText('Bitcoin ETF Inflows Surge Past $200M'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ethereum Pectra Testnet Upgrade Live'),
    ).toBeInTheDocument();
    expect(screen.getByText('CoinDesk')).toBeInTheDocument();
    expect(screen.getByText('The Block')).toBeInTheDocument();
    expect(screen.getByText('POSITIVE +0.80')).toBeInTheDocument();
    expect(screen.queryByText(/PENDING/)).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByText('Start crawl'));
    expect(onTriggerCrawl).toHaveBeenCalled();
  });

  it('AnalysisOutputPanel renders sentiment aggregate and source coverage', () => {
    render(
      <AnalysisOutputPanel
        stats={{
          totalItems: 120,
          totalSources: 5,
          enabledSources: 5,
          activeSources: 5,
          coveragePercent: 100,
          analytics: {
            aggregate: {
              positive: 58,
              neutral: 27,
              negative: 15,
              score: 0.43,
              sampleSize: 120,
            },
            eventTypes: {
              ETF_FUND_FLOW: 28,
              PROTOCOL_UPGRADE: 22,
              REGULATION: 15,
              PARTNERSHIP: 12,
              MARKET_TREND: 23,
              OTHER: 0,
            },
            analyzedCount: 120,
          },
        }}
        lastUpdated="10:45"
      />,
    );

    expect(screen.getByText('Analysis output')).toBeInTheDocument();
    expect(screen.getByText('Aggregate sentiment (24h)')).toBeInTheDocument();
    expect(screen.getByText('58%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  const websiteSource: NewsSource = {
    id: 'source-1',
    name: 'CryptoSlate',
    url: 'https://cryptoslate.com/news/',
    providerType: 'WEBSITE',
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  const activeVersionFixture: ExtractionPanelData['activeVersion'] = {
    id: 'version-1',
    newsSourceId: 'source-1',
    version: 1,
    status: 'ACTIVE',
    template: {
      item: 'article.cs-article-card',
      fields: {
        title: { selector: 'h2.cs-article-card__title' },
        summary: { selector: 'p.cs-article-card__excerpt' },
        publishedAt: { selector: 'time', attr: 'datetime' },
        url: { selector: 'a.cs-article-card__link' },
      },
      confidence: 0.92,
    },
    confidence: 0.92,
    generatedBy: 'gemini',
    basedOnVersionId: null,
    projectedEmptyFieldRate: null,
    projectedMalformedFieldRate: null,
    activatedAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
  };

  const panelFixture: ExtractionPanelData = {
    source: {
      id: 'source-1',
      name: 'CryptoSlate',
      url: 'https://cryptoslate.com/news/',
      providerType: 'WEBSITE',
      isActive: true,
    },
    activeVersion: activeVersionFixture,
    proposedVersion: null,
    versionHistory: [activeVersionFixture],
    health: {
      sourceId: 'source-1',
      enabled: true,
      active: true,
      lastAttemptAt: '2026-09-02T00:00:00.000Z',
      lastAttemptStatus: 'SUCCESS',
      avgConfidence24h: 0.9,
      itemsAnalysed24h: 20,
    },
    drift: {
      status: 'OK',
      threshold: 0.1,
      combinedRate: 0.03,
      sampleAttempts: 5,
      sampleItems: 40,
    },
    settings: { driftDetectionEnabled: true, driftThreshold: 0.1 },
  };

  it('ExtractionDiagramPanel shows an empty state when no Website Source is configured', () => {
    render(
      <ExtractionDiagramPanel
        selectedTab="ALL"
        websiteSources={[]}
        selectedSourceId={null}
        onSelectSource={vi.fn()}
        panel={null}
        isLoading={false}
        candidate={null}
        actionState="idle"
        pastedHtml=""
        onPastedHtmlChange={vi.fn()}
        previewResult={null}
        isPreviewing={false}
        onGenerate={vi.fn()}
        onPreview={vi.fn()}
        onSaveProposal={vi.fn()}
        onActivate={vi.fn()}
      />,
    );

    expect(screen.getByText('LLM-assisted Extraction')).toBeInTheDocument();
    expect(
      screen.getByText('No Website Sources configured yet.'),
    ).toBeInTheDocument();
  });

  it('ExtractionDiagramPanel renders the active template for a selected Website Source', () => {
    render(
      <ExtractionDiagramPanel
        selectedTab="WEBSITE"
        websiteSources={[websiteSource]}
        selectedSourceId="source-1"
        onSelectSource={vi.fn()}
        panel={panelFixture}
        isLoading={false}
        candidate={null}
        actionState="idle"
        pastedHtml=""
        onPastedHtmlChange={vi.fn()}
        previewResult={null}
        isPreviewing={false}
        onGenerate={vi.fn()}
        onPreview={vi.fn()}
        onSaveProposal={vi.fn()}
        onActivate={vi.fn()}
      />,
    );

    expect(screen.getByText('Template: v1')).toBeInTheDocument();
    expect(screen.getByText('article.cs-article-card')).toBeInTheDocument();
    expect(screen.getByText('Confidence: 0.92')).toBeInTheDocument();
  });

  it('ExtractionDiagramPanel lets an admin roll back to a superseded version', () => {
    const supersededVersion: ExtractionPanelData['versionHistory'][number] = {
      ...activeVersionFixture,
      id: 'version-0',
      version: 0,
      status: 'SUPERSEDED',
    };
    const onActivate = vi.fn();

    render(
      <ExtractionDiagramPanel
        isAdmin={true}
        selectedTab="WEBSITE"
        websiteSources={[websiteSource]}
        selectedSourceId="source-1"
        onSelectSource={vi.fn()}
        panel={{
          ...panelFixture,
          versionHistory: [activeVersionFixture, supersededVersion],
        }}
        isLoading={false}
        candidate={null}
        actionState="idle"
        pastedHtml=""
        onPastedHtmlChange={vi.fn()}
        previewResult={null}
        isPreviewing={false}
        onGenerate={vi.fn()}
        onPreview={vi.fn()}
        onSaveProposal={vi.fn()}
        onActivate={onActivate}
      />,
    );

    fireEvent.click(screen.getByText('Roll back'));
    expect(onActivate).toHaveBeenCalledWith('version-0');
  });

  it('SelfHealingDiagramPanel shows drift status and an admin-editable threshold', () => {
    const onUpdateSettings = vi.fn();
    render(
      <SelfHealingDiagramPanel
        isAdmin={true}
        selectedTab="WEBSITE"
        hasWebsiteSources={true}
        panel={panelFixture}
        isLoading={false}
        actionState="idle"
        onActivate={vi.fn()}
        onReject={vi.fn()}
        onUpdateSettings={onUpdateSettings}
      />,
    );

    expect(screen.getByText('Stable')).toBeInTheDocument();
    expect(
      screen.getByText(/No proposal is pending review/),
    ).toBeInTheDocument();

    // Trailing-24h source health, not just the drift verdict
    expect(screen.getByText('0.90')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    expect(onUpdateSettings).toHaveBeenCalledWith({
      driftDetectionEnabled: false,
    });
  });

  it('SelfHealingDiagramPanel offers Activate/Reject to an admin when a proposal is open', () => {
    const proposedVersion: ExtractionPanelData['proposedVersion'] = {
      ...activeVersionFixture,
      id: 'version-2',
      version: 2,
      status: 'PROPOSED',
      basedOnVersionId: 'version-1',
      activatedAt: null,
    };
    const onActivate = vi.fn();

    render(
      <SelfHealingDiagramPanel
        isAdmin={true}
        selectedTab="WEBSITE"
        hasWebsiteSources={true}
        panel={{ ...panelFixture, proposedVersion }}
        isLoading={false}
        actionState="idle"
        onActivate={onActivate}
        onReject={vi.fn()}
        onUpdateSettings={vi.fn()}
      />,
    );

    expect(screen.getByText('Proposal: v2 (based on v1)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Activate now'));
    expect(onActivate).toHaveBeenCalledWith('version-2');
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
    expect(screen.queryByText('Paste HTML')).not.toBeInTheDocument();
    expect(screen.queryByText('Configure sources')).not.toBeInTheDocument();
    expect(screen.queryByText('Start crawl')).not.toBeInTheDocument();

    // Auto refresh interval is displayed as read-only badge
    expect(screen.getByText('3 min')).toBeInTheDocument();
    // Select dropdown for auto refresh should not exist for regular user
    expect(
      screen.queryByRole('combobox', { name: 'Auto-refresh interval' }),
    ).not.toBeInTheDocument();
  });

  it('NewsControlBar shows admin buttons (Paste HTML, Configure sources, Start crawl) and auto refresh select when isAdmin is true', () => {
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
    expect(screen.getByText('Paste HTML')).toBeInTheDocument();
    expect(screen.getByText('Configure sources')).toBeInTheDocument();
    expect(screen.getByText('Start crawl')).toBeInTheDocument();

    const intervalSelect = screen.getByRole('combobox', {
      name: 'Auto-refresh interval',
    });
    expect(intervalSelect).toBeInTheDocument();
    fireEvent.change(intervalSelect, { target: { value: '5' } });
    expect(onIntervalChange).toHaveBeenCalledWith(5);

    // Clicking the Paste HTML action button triggers the modal
    fireEvent.click(screen.getByText('Paste HTML'));
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
    const loadMoreBtn = screen.getByText(/Load more \(9 remaining\)/);
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
    expect(screen.queryByText('Article content')).not.toBeInTheDocument();

    // Click on the article title
    fireEvent.click(screen.getByText('Solana Ecosystem Update via Raw HTML'));

    // Modal is now displayed with full content
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Article content')).toBeInTheDocument();
    expect(
      screen.getAllByText('Solana DEX volume hits new weekly record high.')
        .length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText(
        'This article was imported directly via HTML and has no external link.',
      ),
    ).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByText('Article content')).not.toBeInTheDocument();
  });
});
