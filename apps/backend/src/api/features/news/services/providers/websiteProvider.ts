import type {
  NewsProviderType,
  NewsSource,
  RawNewsItem,
} from '@crypto-strategy-lab/shared';
import type { NewsProvider } from '../interfaces/newsProvider.interface';

function extractMetaTag(html: string, property: string): string | null {
  const ogRegex = new RegExp(
    `<meta[^>]+(?:property|name)=["'](?:og:)?${property}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const match = ogRegex.exec(html);
  if (match && match[1]) {
    return match[1].trim();
  }

  const altRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:)?${property}["']`,
    'i',
  );
  const matchAlt = altRegex.exec(html);
  return matchAlt && matchAlt[1] ? matchAlt[1].trim() : null;
}

function extractTitle(html: string): string {
  const ogTitle = extractMetaTag(html, 'title');
  if (ogTitle) return ogTitle;

  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return titleMatch && titleMatch[1] ? titleMatch[1].trim() : '';
}

function extractDescription(html: string): string {
  return extractMetaTag(html, 'description') ?? '';
}

export class WebsiteNewsProvider implements NewsProvider {
  public readonly providerType: NewsProviderType = 'WEBSITE';

  public parseHtml(html: string, source: NewsSource): RawNewsItem[] {
    const title = extractTitle(html);
    const description = extractDescription(html);

    if (!title) {
      return [];
    }

    return [
      {
        title,
        content: description || title,
        url: source.url,
        publishedAt: new Date(),
        source: source.name,
        relatedCoins: [],
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
