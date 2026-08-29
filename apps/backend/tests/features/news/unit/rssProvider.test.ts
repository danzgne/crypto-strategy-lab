import { describe, it, expect } from 'vitest';
import { RssNewsProvider } from '@/api/features/news/services/providers/rssProvider';

describe('RssNewsProvider', () => {
  const provider = new RssNewsProvider();

  const SAMPLE_RSS_2_0 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>CoinDesk</title>
    <link>https://www.coindesk.com</link>
    <description>News and analysis</description>
    <item>
      <title>Bitcoin Reaches $100k as ETF Inflows Surge</title>
      <link>https://www.coindesk.com/markets/2026/08/29/bitcoin-100k</link>
      <description>&lt;p&gt;Bitcoin surged past $100,000 today following massive institutional demand.&lt;/p&gt;</description>
      <pubDate>Sat, 29 Aug 2026 12:00:00 GMT</pubDate>
      <category>Bitcoin</category>
      <category>Markets</category>
    </item>
    <item>
      <title>Ethereum Layer 2 Upgrades Go Live</title>
      <link>https://www.coindesk.com/tech/2026/08/29/ethereum-upgrades</link>
      <content:encoded>&lt;div&gt;&lt;p&gt;Ethereum scaling reaches new milestone with lower gas fees.&lt;/p&gt;&lt;/div&gt;</content:encoded>
      <dc:date>2026-08-29T13:30:00Z</dc:date>
      <category>Ethereum</category>
      <category>SOL</category>
    </item>
  </channel>
</rss>`;

  const SAMPLE_ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Cointelegraph</title>
  <entry>
    <title>Solana Mobile Pre-orders Cross 100k Units</title>
    <link href="https://cointelegraph.com/news/solana-mobile-100k" />
    <summary>Solana ecosystem tokens rally on hardware adoption news.</summary>
    <updated>2026-08-29T14:00:00Z</updated>
    <category term="Solana" />
    <category term="Mobile" />
  </entry>
</feed>`;

  it('should parse RSS 2.0 items and extract title, content, link, date, and coins', () => {
    const items = provider.parseXml(SAMPLE_RSS_2_0, 'CoinDesk');
    expect(items).toHaveLength(2);

    expect(items[0]?.title).toBe('Bitcoin Reaches $100k as ETF Inflows Surge');
    expect(items[0]?.url).toBe(
      'https://www.coindesk.com/markets/2026/08/29/bitcoin-100k',
    );
    expect(items[0]?.content).toBe(
      'Bitcoin surged past $100,000 today following massive institutional demand.',
    );
    expect(items[0]?.source).toBe('CoinDesk');
    expect(items[0]?.relatedCoins).toContain('BTC');

    expect(items[1]?.title).toBe('Ethereum Layer 2 Upgrades Go Live');
    expect(items[1]?.url).toBe(
      'https://www.coindesk.com/tech/2026/08/29/ethereum-upgrades',
    );
    expect(items[1]?.content).toBe(
      'Ethereum scaling reaches new milestone with lower gas fees.',
    );
    expect(items[1]?.relatedCoins).toContain('ETH');
    expect(items[1]?.relatedCoins).toContain('SOL');
  });

  it('should parse Atom feed entries properly', () => {
    const items = provider.parseXml(SAMPLE_ATOM_FEED, 'Cointelegraph');
    expect(items).toHaveLength(1);

    expect(items[0]?.title).toBe('Solana Mobile Pre-orders Cross 100k Units');
    expect(items[0]?.url).toBe(
      'https://cointelegraph.com/news/solana-mobile-100k',
    );
    expect(items[0]?.content).toBe(
      'Solana ecosystem tokens rally on hardware adoption news.',
    );
    expect(items[0]?.relatedCoins).toContain('SOL');
  });

  it('should handle malformed or empty XML gracefully without throwing', () => {
    const items = provider.parseXml('<not-a-feed></not-a-feed>', 'Unknown');
    expect(items).toEqual([]);
  });
});
