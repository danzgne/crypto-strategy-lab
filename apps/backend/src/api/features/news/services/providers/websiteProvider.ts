import type {
  NewsProviderType,
  NewsSource,
  RawNewsItem,
} from '@crypto-strategy-lab/shared';
import type { NewsProvider } from '../interfaces/newsProvider.interface';
import { stripHtml } from '../../utils/htmlSanitizer';
import { extractRelatedCoins } from '../../utils/coinExtractor';

function extractMetaTag(html: string, property: string): string | null {
  const propertyPattern = property.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const ogRegex = new RegExp(
    `<meta[^>]+(?:property|name)=["'](?:og:|twitter:|article:)?${propertyPattern}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const match = ogRegex.exec(html);
  if (match && match[1]) {
    return match[1].trim();
  }

  const altRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:|twitter:|article:)?${propertyPattern}["']`,
    'i',
  );
  const matchAlt = altRegex.exec(html);
  return matchAlt && matchAlt[1] ? matchAlt[1].trim() : null;
}

function extractTitle(html: string): string {
  const ogTitle = extractMetaTag(html, 'title');
  if (ogTitle) return stripHtml(ogTitle);

  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return titleMatch && titleMatch[1] ? stripHtml(titleMatch[1]) : '';
}

function extractDescription(html: string): string {
  const metaDesc = extractMetaTag(html, 'description');
  if (metaDesc) return stripHtml(metaDesc);

  const pMatch = /<p[^>]*>([^<]{20,})<\/p>/i.exec(html);
  if (pMatch && pMatch[1]) {
    return stripHtml(pMatch[1]);
  }

  return '';
}

function extractPublishedAt(html: string): Date {
  const metaDate =
    extractMetaTag(html, 'published_time') ??
    extractMetaTag(html, 'article:published_time') ??
    extractMetaTag(html, 'pubdate') ??
    extractMetaTag(html, 'date');

  if (metaDate) {
    const parsed = new Date(metaDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

export class WebsiteNewsProvider implements NewsProvider {
  public readonly providerType: NewsProviderType = 'WEBSITE';

  public parseHtml(html: string, source: NewsSource): RawNewsItem[] {
    const title = extractTitle(html);
    const description = extractDescription(html);

    if (!title) {
      return [];
    }

    const content = description || title;
    const publishedAt = extractPublishedAt(html);
    const relatedCoins = extractRelatedCoins([], title, content);

    return [
      {
        title,
        content,
        url: source.url,
        publishedAt,
        source: source.name,
        relatedCoins,
      },
    ];
  }

  public async fetchNews(source: NewsSource): Promise<RawNewsItem[]> {
    try {
      const response = await fetch(source.url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(
          `Website fetch failed for ${source.url}: HTTP ${response.status} ${response.statusText}`,
        );
      }

      const html = await response.text();
      return this.parseHtml(html, source);
    } catch (error) {
      throw new Error(
        `WebsiteProvider error fetching ${source.url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
