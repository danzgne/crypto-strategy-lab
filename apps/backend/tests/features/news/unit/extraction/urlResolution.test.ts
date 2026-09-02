import { describe, it, expect } from 'vitest';
import { resolveItemUrl } from '@/api/features/news/services/extraction/urlResolution';

describe('resolveItemUrl', () => {
  const base = 'https://cryptoslate.com/news/';

  it('resolves a relative path against the source URL', () => {
    const result = resolveItemUrl('/bitcoin-etf-inflows/', base);
    expect(result.malformed).toBe(false);
    expect(result.url).toBe('https://cryptoslate.com/bitcoin-etf-inflows/');
  });

  it('leaves an already-absolute http(s) URL untouched', () => {
    const result = resolveItemUrl('https://cryptoslate.com/article-1/', base);
    expect(result.malformed).toBe(false);
    expect(result.url).toBe('https://cryptoslate.com/article-1/');
  });

  it('treats an empty href as malformed', () => {
    const result = resolveItemUrl('', base);
    expect(result.malformed).toBe(true);
  });

  it('treats a non-http(s) scheme as malformed', () => {
    const result = resolveItemUrl('javascript:void(0)', base);
    expect(result.malformed).toBe(true);
  });

  it('treats an unparseable value as malformed', () => {
    const result = resolveItemUrl('   ', base);
    expect(result.malformed).toBe(true);
  });
});
