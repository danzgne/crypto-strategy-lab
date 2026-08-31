import { describe, it, expect } from 'vitest';
import { stripHtml } from '@/api/features/news/utils/htmlSanitizer';

describe('stripHtml', () => {
  it('should return empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
  });

  it('should remove HTML tags', () => {
    expect(stripHtml('<p>Hello <strong>World</strong>!</p>')).toBe(
      'Hello World !',
    );
  });

  it('should decode basic named HTML entities', () => {
    expect(
      stripHtml('AT&amp;T &lt;tag&gt; &quot;quote&quot; &#39;single&#39;'),
    ).toBe('AT&T <tag> "quote" \'single\'');
  });

  it('should decode decimal numeric entities', () => {
    // 8217 is right single quotation mark ’, 8220 is left double quote “
    expect(stripHtml('Bitcoin&#8217;s price &#8220;surges&#8221;')).toBe(
      'Bitcoin’s price “surges”',
    );
  });

  it('should decode hex numeric entities', () => {
    // &#x2014; is em-dash —, &#x20AC; is Euro sign €
    expect(stripHtml('Crypto &#x2014; ETF inflows &#x20AC;100M')).toBe(
      'Crypto — ETF inflows €100M',
    );
  });

  it('should decode extended entities like &mdash; &ndash; &hellip; &bull;', () => {
    expect(
      stripHtml('Bitcoin &mdash; Ethereum &ndash; Solana &hellip; &bull; End'),
    ).toBe('Bitcoin — Ethereum – Solana … • End');
  });
});
