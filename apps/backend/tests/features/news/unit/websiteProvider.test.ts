import { describe, it, expect, vi } from 'vitest';
import type {
  ExtractionTemplate,
  NewsSource,
} from '@crypto-strategy-lab/shared';
import { WebsiteNewsProvider } from '@/api/features/news/services/providers/websiteProvider';
import type { ActiveTemplatePort } from '@/api/features/news/services/extraction/activeTemplatePort.interface';

const TEMPLATE: ExtractionTemplate = {
  item: 'article.card',
  fields: {
    title: { selector: 'h2' },
    summary: { selector: 'p' },
    publishedAt: { selector: 'time', attr: 'datetime' },
    url: { selector: 'a' },
  },
  confidence: 0.9,
};

const SOURCE: NewsSource = {
  id: 'source-1',
  name: 'CryptoSlate',
  url: 'https://cryptoslate.com/news/',
  providerType: 'WEBSITE',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const HTML = `<html><body>
  <article class="card">
    <a href="/one/"><h2>Title One</h2><p>Summary one</p><time datetime="2026-09-02T14:45:03+01:00">now</time></a>
  </article>
</body></html>`;

describe('WebsiteNewsProvider', () => {
  it('applies the active template and reports extraction metrics', async () => {
    const templatePort: ActiveTemplatePort = {
      getActiveTemplate: vi
        .fn()
        .mockResolvedValue({ versionId: 'v1', template: TEMPLATE }),
    };
    const fetchHtml = vi.fn().mockResolvedValue(HTML);
    const provider = new WebsiteNewsProvider(
      templatePort,
      fetchHtml,
      () => new Date('2026-09-02T15:00:00Z'),
    );

    const result = await provider.fetchNewsWithMetrics(SOURCE);

    expect(fetchHtml).toHaveBeenCalledWith(SOURCE.url);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe('Title One');
    expect(result.metrics).toEqual({
      templateVersionId: 'v1',
      emptyFieldRate: 0,
      malformedFieldRate: 0,
      avgConfidence: 0.9,
    });
  });

  it('exposes the plain fetchNews contract by delegating to fetchNewsWithMetrics', async () => {
    const templatePort: ActiveTemplatePort = {
      getActiveTemplate: vi
        .fn()
        .mockResolvedValue({ versionId: 'v1', template: TEMPLATE }),
    };
    const provider = new WebsiteNewsProvider(
      templatePort,
      vi.fn().mockResolvedValue(HTML),
    );

    const items = await provider.fetchNews(SOURCE);
    expect(items).toHaveLength(1);
  });

  it('throws, without any fallback, when no usable template is available', async () => {
    const templatePort: ActiveTemplatePort = {
      getActiveTemplate: vi.fn().mockResolvedValue(null),
    };
    const provider = new WebsiteNewsProvider(templatePort, vi.fn());

    await expect(provider.fetchNewsWithMetrics(SOURCE)).rejects.toThrow(
      /No usable extraction template/,
    );
  });
});
