import { describe, it, expect } from 'vitest';
import type { ExtractionTemplate } from '@crypto-strategy-lab/shared';
import { applyTemplate } from '@/api/features/news/services/extraction/templateApplier';

const TEMPLATE: ExtractionTemplate = {
  item: 'article.cs-article-card',
  fields: {
    title: { selector: 'h2.cs-article-card__title' },
    summary: { selector: 'p.cs-article-card__excerpt' },
    publishedAt: { selector: 'time', attr: 'datetime' },
    url: { selector: 'a.cs-article-card__link' },
  },
  confidence: 0.92,
};

const SOURCE_URL = 'https://cryptoslate.com/news/';
const SOURCE_NAME = 'CryptoSlate';
const NOW = new Date('2026-09-02T15:16:10.000Z');

function cardHtml({
  href = '/tron-h1-2026-strategy-report/',
  title = 'TRON H1 2026 Strategy Report',
  summary = '<p class="cs-article-card__excerpt">Dual-engine growth via DeFi and AI.</p>',
  time = '<time datetime="2026-09-02T14:45:03+01:00">31 mins ago</time>',
}: {
  href?: string;
  title?: string;
  summary?: string;
  time?: string;
} = {}): string {
  return `<article class="cs-article-card cs-article-card--news">
    <a class="cs-article-card__link" href="${href}">
      <h2 class="cs-article-card__title">${title}</h2>
      ${summary}
      ${time}
    </a>
  </article>`;
}

function page(cards: string[]): string {
  return `<!DOCTYPE html><html><head><title>News</title></head><body><main>${cards.join('\n')}</main></body></html>`;
}

describe('applyTemplate', () => {
  it('extracts title, summary, publishedAt, and an absolute url from each item', () => {
    const html = page([cardHtml()]);
    const { items, metrics } = applyTemplate(
      html,
      TEMPLATE,
      SOURCE_URL,
      SOURCE_NAME,
      NOW,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'TRON H1 2026 Strategy Report',
      content: 'Dual-engine growth via DeFi and AI.',
      url: 'https://cryptoslate.com/tron-h1-2026-strategy-report/',
      source: SOURCE_NAME,
    });
    expect(items[0]?.publishedAt.toISOString()).toBe(
      '2026-09-02T13:45:03.000Z',
    );
    expect(metrics).toEqual({
      itemCount: 1,
      emptyFieldRate: 0,
      malformedFieldRate: 0,
    });
  });

  it('prefers the datetime attribute over the visible relative-time text', () => {
    const html = page([
      cardHtml({
        time: '<time datetime="2026-09-02T10:00:00Z">5 hours ago</time>',
      }),
    ]);
    const { items } = applyTemplate(
      html,
      TEMPLATE,
      SOURCE_URL,
      SOURCE_NAME,
      NOW,
    );
    expect(items[0]?.publishedAt.toISOString()).toBe(
      '2026-09-02T10:00:00.000Z',
    );
  });

  it('falls back to crawl time and counts malformed when the timestamp is unparseable', () => {
    const html = page([
      cardHtml({ time: '<time datetime="not-a-date">recently</time>' }),
    ]);
    const { items, metrics } = applyTemplate(
      html,
      TEMPLATE,
      SOURCE_URL,
      SOURCE_NAME,
      NOW,
    );
    expect(items[0]?.publishedAt.toISOString()).toBe(NOW.toISOString());
    expect(metrics.malformedFieldRate).toBeCloseTo(1 / 4);
    expect(metrics.emptyFieldRate).toBe(0);
  });

  it('does not persist an item with an empty title, but still counts it in metrics', () => {
    const html = page([cardHtml({ title: '' })]);
    const { items, metrics } = applyTemplate(
      html,
      TEMPLATE,
      SOURCE_URL,
      SOURCE_NAME,
      NOW,
    );
    expect(items).toHaveLength(0);
    expect(metrics.itemCount).toBe(1);
    expect(metrics.emptyFieldRate).toBeCloseTo(1 / 4);
  });

  it('counts a missing summary as empty but still persists the item using the title as content', () => {
    const html = page([cardHtml({ summary: '' })]);
    const { items, metrics } = applyTemplate(
      html,
      TEMPLATE,
      SOURCE_URL,
      SOURCE_NAME,
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.content).toBe(items[0]?.title);
    expect(metrics.emptyFieldRate).toBeCloseTo(1 / 4);
  });

  it('scores 100% empty when the item-container selector matches no nodes on a non-empty page', () => {
    const html = page(['<div class="not-a-card">nothing here</div>']);
    const { items, metrics } = applyTemplate(
      html,
      TEMPLATE,
      SOURCE_URL,
      SOURCE_NAME,
      NOW,
    );
    expect(items).toHaveLength(0);
    expect(metrics).toEqual({
      itemCount: 0,
      emptyFieldRate: 1,
      malformedFieldRate: 0,
    });
  });

  it('resolves relative item URLs absolute against the source URL', () => {
    const html = page([cardHtml({ href: 'relative-article/' })]);
    const { items } = applyTemplate(
      html,
      TEMPLATE,
      SOURCE_URL,
      SOURCE_NAME,
      NOW,
    );
    expect(items[0]?.url).toBe(
      'https://cryptoslate.com/news/relative-article/',
    );
  });

  it('skips persisting and counts malformed when the url cannot resolve to absolute http(s)', () => {
    const html = page([cardHtml({ href: 'javascript:void(0)' })]);
    const { items, metrics } = applyTemplate(
      html,
      TEMPLATE,
      SOURCE_URL,
      SOURCE_NAME,
      NOW,
    );
    expect(items).toHaveLength(0);
    expect(metrics.malformedFieldRate).toBeCloseTo(1 / 4);
  });

  it('computes rates across multiple items in the same attempt', () => {
    const html = page([
      cardHtml(),
      cardHtml({ title: '', href: '/second/' }),
      cardHtml({ time: '<time datetime="bad">later</time>', href: '/third/' }),
    ]);
    const { items, metrics } = applyTemplate(
      html,
      TEMPLATE,
      SOURCE_URL,
      SOURCE_NAME,
      NOW,
    );
    expect(items).toHaveLength(2);
    expect(metrics.itemCount).toBe(3);
    expect(metrics.emptyFieldRate).toBeCloseTo(1 / 12);
    expect(metrics.malformedFieldRate).toBeCloseTo(1 / 12);
  });

  it('breaks empty/malformed rates down per field, for briefing a replacement proposal', () => {
    const html = page([
      cardHtml({ summary: '' }),
      cardHtml({ time: '<time datetime="bad">later</time>' }),
    ]);
    const { fieldBreakdown } = applyTemplate(
      html,
      TEMPLATE,
      SOURCE_URL,
      SOURCE_NAME,
      NOW,
    );
    expect(fieldBreakdown.title).toEqual({ emptyRate: 0, malformedRate: 0 });
    expect(fieldBreakdown.summary).toEqual({
      emptyRate: 0.5,
      malformedRate: 0,
    });
    expect(fieldBreakdown.publishedAt).toEqual({
      emptyRate: 0,
      malformedRate: 0.5,
    });
    expect(fieldBreakdown.url).toEqual({ emptyRate: 0, malformedRate: 0 });
  });

  it('reads a field from a declared attribute instead of text content when attr is set', () => {
    const template: ExtractionTemplate = {
      ...TEMPLATE,
      fields: {
        ...TEMPLATE.fields,
        title: { selector: 'h2.cs-article-card__title', attr: 'data-title' },
      },
    };
    const html = page([
      `<article class="cs-article-card"><a class="cs-article-card__link" href="/x/"><h2 class="cs-article-card__title" data-title="Attr Title">Text Title</h2><p class="cs-article-card__excerpt">S</p><time datetime="2026-09-02T14:45:03+01:00">now</time></a></article>`,
    ]);
    const { items } = applyTemplate(
      html,
      template,
      SOURCE_URL,
      SOURCE_NAME,
      NOW,
    );
    expect(items[0]?.title).toBe('Attr Title');
  });
});
