import type {
  NewsProviderType,
  NewsSource,
  RawNewsItem,
} from '@crypto-strategy-lab/shared';
import type { NewsProvider } from '../interfaces/newsProvider.interface';
import { stripHtml } from '../../utils/htmlSanitizer';
import { extractRelatedCoins } from '../../utils/coinExtractor';

function cleanHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
}

function extractMetaTag(html: string, property: string): string | null {
  const clean = cleanHtml(html);
  const escapedProp = property.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

  // Format 1: <meta ... (property|name|itemprop)="prop" ... content="val" ... >
  const pattern1 = new RegExp(
    `<meta\\s+[^>]*(?:property|name|itemprop)\\s*=\\s*["'](?:og:|twitter:|article:)?${escapedProp}["'][^>]*content\\s*=\\s*["']([^"']+)["'][^>]*>`,
    'is',
  );
  const match1 = pattern1.exec(clean);
  if (match1 && match1[1]) {
    return match1[1].trim();
  }

  // Format 2: <meta ... content="val" ... (property|name|itemprop)="prop" ... >
  const pattern2 = new RegExp(
    `<meta\\s+[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name|itemprop)\\s*=\\s*["'](?:og:|twitter:|article:)?${escapedProp}["'][^>]*>`,
    'is',
  );
  const match2 = pattern2.exec(clean);
  if (match2 && match2[1]) {
    return match2[1].trim();
  }

  return null;
}

function extractTitle(html: string): string {
  const ogTitle =
    extractMetaTag(html, 'title') ?? extractMetaTag(html, 'twitter:title');
  if (ogTitle) return stripHtml(ogTitle);

  const clean = cleanHtml(html);
  const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(clean);
  if (h1Match && h1Match[1]) {
    const titleFromH1 = stripHtml(h1Match[1]);
    if (titleFromH1.length > 5) return titleFromH1;
  }

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(clean);
  return titleMatch && titleMatch[1] ? stripHtml(titleMatch[1]) : '';
}

function extractDescription(html: string): string {
  const metaDesc =
    extractMetaTag(html, 'description') ??
    extractMetaTag(html, 'twitter:description');
  if (metaDesc) return stripHtml(metaDesc);

  const clean = cleanHtml(html);
  const pMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(clean);
  if (pMatch && pMatch[1]) {
    const text = stripHtml(pMatch[1]);
    if (text.length >= 20) {
      return text;
    }
  }

  return '';
}

function extractPublishedAt(html: string): Date {
  const metaDate =
    extractMetaTag(html, 'published_time') ??
    extractMetaTag(html, 'article:published_time') ??
    extractMetaTag(html, 'datePublished') ??
    extractMetaTag(html, 'pubdate') ??
    extractMetaTag(html, 'date');

  if (metaDate) {
    const parsed = new Date(metaDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const clean = cleanHtml(html);
  const timeMatch =
    /<time[^>]*(?:datetime|data-time)\s*=\s*["']([^"']+)["'][^>]*>/i.exec(
      clean,
    );
  if (timeMatch && timeMatch[1]) {
    const parsedTime = new Date(timeMatch[1]);
    if (!Number.isNaN(parsedTime.getTime())) {
      return parsedTime;
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
