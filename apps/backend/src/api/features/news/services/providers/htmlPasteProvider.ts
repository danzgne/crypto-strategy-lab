import type {
  NewsProviderType,
  NewsSource,
  RawNewsItem,
} from '@crypto-strategy-lab/shared';
import type { NewsProvider } from '../interfaces/newsProvider.interface';
import type { ingestHtmlSchema } from '../../types/news.dto';
import type { z } from 'zod';

import { stripHtml } from '@/utils/htmlSanitizer';
import { extractRelatedCoins } from '../../utils/coinExtractor';

export type IngestHtmlInput = z.input<typeof ingestHtmlSchema>;

export class HtmlPasteNewsProvider implements NewsProvider {
  public readonly providerType: NewsProviderType = 'HTML';

  public async fetchNews(_source: NewsSource): Promise<RawNewsItem[]> {
    // HTML provider is invoked via explicit paste/ingest actions, not periodic polling
    return [];
  }

  public parseIngestedHtml(dto: IngestHtmlInput): RawNewsItem {
    const cleanContent = stripHtml(dto.html).slice(0, 2000);
    const publishedAt = dto.publishedAt
      ? new Date(dto.publishedAt)
      : new Date();
    const url =
      dto.url ||
      `https://local.ingest/html/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const title = dto.title.trim();
    const content = cleanContent || title;
    const relatedCoins =
      dto.relatedCoins && dto.relatedCoins.length > 0
        ? dto.relatedCoins
        : extractRelatedCoins([], title, content);

    return {
      title,
      content,
      url,
      publishedAt: Number.isNaN(publishedAt.getTime())
        ? new Date()
        : publishedAt,
      source: dto.source || 'HTML Ingest',
      relatedCoins,
    };
  }
}
