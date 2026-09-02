import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { trimHtmlForModel } from '@/api/features/news/services/extraction/htmlTrimmer';

describe('trimHtmlForModel', () => {
  it('strips script, style, noscript, svg and comment content', () => {
    const html = `<html><head><style>.a{color:red}</style></head><body>
      <!-- a comment -->
      <script>console.log('x')</script>
      <svg viewBox="0 0 1 1"><path d="M0 0"/></svg>
      <noscript>enable js</noscript>
      <article><h2>Real title</h2></article>
    </body></html>`;

    const trimmed = trimHtmlForModel(html);

    expect(trimmed).not.toContain('console.log');
    expect(trimmed).not.toContain('color:red');
    expect(trimmed).not.toContain('a comment');
    expect(trimmed).not.toContain('enable js');
    expect(trimmed).not.toContain('<path');
    expect(trimmed).toContain('Real title');
  });

  it('collapses runs of whitespace to a single space', () => {
    const trimmed = trimHtmlForModel('<p>a</p>\n\n   <p>b</p>\t\t<p>c</p>');
    expect(trimmed).not.toMatch(/\s{2,}/);
  });

  it('caps output length at roughly 150KB', () => {
    const big = `<article>${'x'.repeat(300_000)}</article>`;
    const trimmed = trimHtmlForModel(big);
    expect(trimmed.length).toBeLessThanOrEqual(150_000);
  });

  it('leaves short markup under the cap untouched in length', () => {
    const small = '<article><h2>Title</h2><p>Body</p></article>';
    const trimmed = trimHtmlForModel(small);
    expect(trimmed.length).toBeLessThan(150_000);
    expect(trimmed).toContain('Title');
    expect(trimmed).toContain('Body');
  });

  describe('against the seeded CryptoSlate snapshot', () => {
    let snapshot: string;

    beforeAll(async () => {
      const fixturePath = fileURLToPath(
        new URL(
          '../../../../fixtures/news/cryptoslate-news-snapshot.html',
          import.meta.url,
        ),
      );
      snapshot = await readFile(fixturePath, 'utf-8');
    });

    it('stays within the 150KB budget and still contains the article listing', () => {
      const trimmed = trimHtmlForModel(snapshot);
      expect(trimmed.length).toBeLessThanOrEqual(150_000);
      expect(trimmed).toContain('cs-article-card');
      expect(trimmed).not.toContain('<script');
      expect(trimmed).not.toContain('<style');
    });
  });
});
