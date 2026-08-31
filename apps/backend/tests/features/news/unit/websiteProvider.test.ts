import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebsiteNewsProvider } from '@/api/features/news/services/providers/websiteProvider';
import type { NewsSource } from '@crypto-strategy-lab/shared';

describe('WebsiteNewsProvider', () => {
  const provider = new WebsiteNewsProvider();
  const dummySource: NewsSource = {
    id: 'source-web-1',
    name: 'CryptoNews Web',
    url: 'https://cryptonews.example.com/article/1',
    providerType: 'WEBSITE',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const OG_HTML_FIXTURE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta property="og:title" content="SEC Approves New Crypto Index &amp; ETP" />
  <meta property="og:description" content="Regulators have greenlit the first diversified crypto index vehicle in the US." />
  <title>Default Page Title - Ignored if OG present</title>
</head>
<body>
  <h1>Article Content</h1>
</body>
</html>`;

  const STANDARD_HTML_FIXTURE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="description" content="Bitcoin dominance rises past 60% amidst market consolidation." />
  <title>Bitcoin Dominance Rallies | Market Update</title>
</head>
<body>
  <p>Some text</p>
</body>
</html>`;

  const MINIMAL_HTML_FIXTURE = `<!DOCTYPE html>
<html>
<head>
  <title>Ethereum Scalability Breakthrough</title>
</head>
<body></body>
</html>`;

  const EMPTY_HTML_FIXTURE = `<!DOCTYPE html><html><head></head><body>No title here</body></html>`;

  const YAHOO_STYLE_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="twitter:title" content="Bitcoin BTC (BTC-USD) Live Price, News, Chart &amp; History - Yahoo Finance" />
  <meta name="description" content="Find the live Bitcoin USD (BTC-USD) price, history, news and other vital information." />
  <meta property="article:published_time" content="2026-08-29T10:00:00.000Z" />
</head>
<body>
  <p>Detailed overview of Bitcoin cryptocurrency market price performance.</p>
</body>
</html>`;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should extract title and description from OpenGraph meta tags and unescape entities', () => {
    const items = provider.parseHtml(OG_HTML_FIXTURE, dummySource);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('SEC Approves New Crypto Index & ETP');
    expect(items[0]?.content).toBe(
      'Regulators have greenlit the first diversified crypto index vehicle in the US.',
    );
    expect(items[0]?.url).toBe(dummySource.url);
    expect(items[0]?.source).toBe(dummySource.name);
  });

  it('should fallback to standard <title> and <meta name="description"> tags and extract coins', () => {
    const items = provider.parseHtml(STANDARD_HTML_FIXTURE, dummySource);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Bitcoin Dominance Rallies | Market Update');
    expect(items[0]?.content).toBe(
      'Bitcoin dominance rises past 60% amidst market consolidation.',
    );
    expect(items[0]?.relatedCoins).toContain('BTC');
  });

  it('should use title as content when description is missing and extract ETH', () => {
    const items = provider.parseHtml(MINIMAL_HTML_FIXTURE, dummySource);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Ethereum Scalability Breakthrough');
    expect(items[0]?.content).toBe('Ethereum Scalability Breakthrough');
    expect(items[0]?.relatedCoins).toContain('ETH');
  });

  it('should extract Twitter card, published time, and coins from Yahoo-style HTML', () => {
    const items = provider.parseHtml(YAHOO_STYLE_HTML, dummySource);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe(
      'Bitcoin BTC (BTC-USD) Live Price, News, Chart & History - Yahoo Finance',
    );
    expect(items[0]?.relatedCoins).toContain('BTC');
    expect(items[0]?.publishedAt.toISOString()).toBe(
      '2026-08-29T10:00:00.000Z',
    );
  });

  it('should return empty list when no title is found in HTML', () => {
    const items = provider.parseHtml(EMPTY_HTML_FIXTURE, dummySource);
    expect(items).toEqual([]);
  });

  it('should fetch HTML via network and parse news item successfully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => OG_HTML_FIXTURE,
      }),
    );

    const items = await provider.fetchNews(dummySource);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('SEC Approves New Crypto Index & ETP');
  });

  it('should throw an informative error when fetch fails with non-200 status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }),
    );

    await expect(provider.fetchNews(dummySource)).rejects.toThrow(
      'Website fetch failed for https://cryptonews.example.com/article/1: HTTP 404 Not Found',
    );
  });

  it('should throw an error when content is RSS/Atom XML instead of HTML', () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel><title>CoinDesk</title></channel>
</rss>`;

    expect(() => provider.parseHtml(rssXml, dummySource)).toThrow(
      'Nội dung nhận được là RSS/Atom feed XML, không phải trang Web HTML',
    );
  });
});
