import { describe, it, expect } from 'vitest';
import type { ExtractionTemplate } from '@crypto-strategy-lab/shared';
import {
  isSupportedSelector,
  validateTemplateSelectors,
} from '@/api/features/news/services/extraction/selectorValidator';

describe('isSupportedSelector', () => {
  it.each([
    'article',
    'article.cs-article-card',
    '.cs-article-card__title',
    '#post-1',
    'a[href]',
    'time[datetime]',
    'div[data-foo="bar"]',
    'article.cs-article-card time',
    'div.a.b#c',
  ])('accepts the supported CSS subset: %s', (selector) => {
    expect(isSupportedSelector(selector)).toBe(true);
  });

  it.each([
    '',
    '   ',
    'div > span',
    'li:nth-child(2)',
    'a:hover',
    'div + p',
    'div ~ p',
    'div::before',
    'div[href^="https"]',
    '[',
  ])('rejects selectors outside the supported subset: %s', (selector) => {
    expect(isSupportedSelector(selector)).toBe(false);
  });
});

describe('validateTemplateSelectors', () => {
  const validTemplate: ExtractionTemplate = {
    item: 'article.cs-article-card',
    fields: {
      title: { selector: 'h2.cs-article-card__title' },
      summary: { selector: 'p.cs-article-card__excerpt' },
      publishedAt: { selector: 'time', attr: 'datetime' },
      url: { selector: 'a.cs-article-card__link' },
    },
    confidence: 0.9,
  };

  it('returns no issues for a fully valid template', () => {
    expect(validateTemplateSelectors(validTemplate)).toEqual([]);
  });

  it('reports the item selector when unsupported', () => {
    const issues = validateTemplateSelectors({
      ...validTemplate,
      item: 'div > article',
    });
    expect(issues).toContain('item');
  });

  it('reports each unsupported field selector', () => {
    const issues = validateTemplateSelectors({
      ...validTemplate,
      fields: {
        ...validTemplate.fields,
        title: { selector: 'h2:nth-child(1)' },
        url: { selector: '' },
      },
    });
    expect(issues).toEqual(
      expect.arrayContaining(['fields.title', 'fields.url']),
    );
  });
});
