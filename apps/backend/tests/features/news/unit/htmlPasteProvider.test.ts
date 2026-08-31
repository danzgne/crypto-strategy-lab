import { describe, it, expect } from 'vitest';
import { HtmlPasteNewsProvider } from '@/api/features/news/services/providers/htmlPasteProvider';

describe('HtmlPasteNewsProvider', () => {
  const provider = new HtmlPasteNewsProvider();

  it('should parse ingested HTML snippet and strip tags', () => {
    const raw = provider.parseIngestedHtml({
      title: 'SEC Approves New Crypto Guidelines',
      html: '<div><h1>Header</h1><p>The SEC has released <b>new clarity</b> on token definitions.</p></div>',
      url: 'https://example.com/sec-news',
      source: 'SEC Press',
      relatedCoins: ['BTC', 'ETH'],
    });

    expect(raw.title).toBe('SEC Approves New Crypto Guidelines');
    expect(raw.content).toBe(
      'Header The SEC has released new clarity on token definitions.',
    );
    expect(raw.url).toBe('https://example.com/sec-news');
    expect(raw.source).toBe('SEC Press');
    expect(raw.relatedCoins).toEqual(['BTC', 'ETH']);
  });

  it('should generate a fallback URL if none provided', () => {
    const raw = provider.parseIngestedHtml({
      title: 'Breaking News',
      html: '<p>Some breaking news content</p>',
    });

    expect(raw.url).toMatch(/^https:\/\/local\.ingest\/html\//);
    expect(raw.source).toBe('HTML Ingest');
  });
});
