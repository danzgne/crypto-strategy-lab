import { describe, expect, it, vi } from 'vitest';

import {
  extractTextFromHtml,
  extractTextFromUrl,
  LinkExtractionError,
} from '@/api/features/strategies/generation/linkExtractor';

const ARTICLE_HTML = `<!doctype html>
<html>
  <head><title>My Trading Strategy</title></head>
  <body>
    <nav><a href="/">Home</a><a href="/about">About</a></nav>
    <article>
      <h1>My Mean Reversion Strategy</h1>
      <p>${'This strategy buys when the RSI drops below thirty and the price closes beneath the lower Bollinger Band, then exits at the middle band with a two percent stop loss. '.repeat(6)}</p>
    </article>
    <footer>Copyright 2026. All rights reserved.</footer>
  </body>
</html>`;

function jsonResponseHeaders(overrides: Record<string, string> = {}) {
  return { 'content-type': 'text/html; charset=utf-8', ...overrides };
}

describe('extractTextFromHtml', () => {
  it('extracts the article body via Readability, dropping nav chrome', () => {
    const text = extractTextFromHtml(ARTICLE_HTML, 'https://example.com/post');
    expect(text.toLowerCase()).toContain('mean reversion');
    expect(text.toLowerCase()).not.toContain('copyright 2026');
  });

  it('falls back to a plain tag-strip when Readability finds no article', () => {
    const text = extractTextFromHtml(
      '<html><body><div>Hi</div></body></html>',
      'https://example.com/tiny',
    );
    expect(text).toBe('Hi');
  });
});

describe('extractTextFromUrl', () => {
  const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34' }]);

  it('rejects a malformed URL', async () => {
    await expect(extractTextFromUrl('not a url', { lookup })).rejects.toThrow(
      LinkExtractionError,
    );
  });

  it('fetches and extracts text from a safe https URL', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(ARTICLE_HTML, {
        status: 200,
        headers: jsonResponseHeaders(),
      }),
    );

    const text = await extractTextFromUrl('https://example.com/post', {
      fetchImplementation,
      lookup,
    });

    expect(text.toLowerCase()).toContain('mean reversion');
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('rejects when the resolved address is private', async () => {
    const fetchImplementation = vi.fn();
    const privateLookup = vi.fn().mockResolvedValue([{ address: '10.0.0.5' }]);

    await expect(
      extractTextFromUrl('http://internal.example.com/', {
        fetchImplementation,
        lookup: privateLookup,
      }),
    ).rejects.toThrow(LinkExtractionError);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('follows up to the redirect cap and re-checks safety on each hop', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://hop1.example.com/' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://hop2.example.com/' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(ARTICLE_HTML, {
          status: 200,
          headers: jsonResponseHeaders(),
        }),
      );

    const text = await extractTextFromUrl('https://start.example.com/', {
      fetchImplementation,
      lookup,
    });

    expect(text.toLowerCase()).toContain('mean reversion');
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(lookup).toHaveBeenCalledWith('start.example.com');
    expect(lookup).toHaveBeenCalledWith('hop1.example.com');
    expect(lookup).toHaveBeenCalledWith('hop2.example.com');
  });

  it('throws once the redirect cap is exceeded', async () => {
    const redirectTo = (host: string) =>
      new Response(null, { status: 302, headers: { location: host } });
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(redirectTo('https://hop1.example.com/'))
      .mockResolvedValueOnce(redirectTo('https://hop2.example.com/'))
      .mockResolvedValueOnce(redirectTo('https://hop3.example.com/'))
      .mockResolvedValueOnce(redirectTo('https://hop4.example.com/'));

    await expect(
      extractTextFromUrl('https://start.example.com/', {
        fetchImplementation,
        lookup,
        maxRedirects: 3,
      }),
    ).rejects.toThrow(LinkExtractionError);
  });

  it('rejects a redirect with no Location header', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302 }));

    await expect(
      extractTextFromUrl('https://start.example.com/', {
        fetchImplementation,
        lookup,
      }),
    ).rejects.toThrow(LinkExtractionError);
  });

  it('rejects a non-2xx response', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 404 }));

    await expect(
      extractTextFromUrl('https://example.com/missing', {
        fetchImplementation,
        lookup,
      }),
    ).rejects.toThrow(LinkExtractionError);
  });

  it('rejects a non-text/html content type', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      extractTextFromUrl('https://example.com/api', {
        fetchImplementation,
        lookup,
      }),
    ).rejects.toThrow(LinkExtractionError);
  });

  it('bounds the amount of response body read', async () => {
    const hugeHtml = `<html><body><article><p>${'word '.repeat(1_000_000)}</p></article></body></html>`;
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(hugeHtml, {
        status: 200,
        headers: jsonResponseHeaders(),
      }),
    );

    const text = await extractTextFromUrl('https://example.com/huge', {
      fetchImplementation,
      lookup,
      maxBytes: 1_000,
    });

    expect(text.length).toBeLessThan(hugeHtml.length);
  });
});
