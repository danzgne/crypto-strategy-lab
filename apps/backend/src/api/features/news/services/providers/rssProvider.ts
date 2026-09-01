import { XMLParser } from 'fast-xml-parser';
import type {
  NewsProviderType,
  NewsSource,
  RawNewsItem,
} from '@crypto-strategy-lab/shared';
import type { NewsProvider } from '../interfaces/newsProvider.interface';

import { stripHtml } from '@/utils/htmlSanitizer';
import { extractRelatedCoins } from '../../utils/coinExtractor';

export class RssNewsProvider implements NewsProvider {
  public readonly providerType: NewsProviderType = 'RSS';
  private readonly parser: XMLParser;

  public constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      isArray: (name) =>
        name === 'item' || name === 'entry' || name === 'category',
    });
  }

  public async fetchNews(source: NewsSource): Promise<RawNewsItem[]> {
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'CryptoStrategyLab-NewsCrawler/1.0',
        Accept:
          'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch RSS feed from ${source.url}: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const xmlText = await response.text();
    return this.parseXml(xmlText, source.name);
  }

  public parseXml(xmlText: string, defaultSourceName: string): RawNewsItem[] {
    const trimmed = xmlText.trim();
    if (
      trimmed.startsWith('<!DOCTYPE html') ||
      trimmed.startsWith('<!doctype html') ||
      /<html[\s>]/i.test(trimmed)
    ) {
      throw new Error(
        'Nội dung nhận được là trang Web (HTML), không phải RSS/Atom XML hợp lệ. Vui lòng đổi loại nguồn sang "Website" hoặc kiểm tra lại đường dẫn RSS.',
      );
    }

    const parsed = this.parser.parse(xmlText);
    const items: RawNewsItem[] = [];

    // Check RSS 2.0 structure: rss.channel.item
    if (parsed.rss?.channel?.item) {
      const rawItems = Array.isArray(parsed.rss.channel.item)
        ? parsed.rss.channel.item
        : [parsed.rss.channel.item];

      for (const item of rawItems) {
        const parsedItem = this.mapRssItem(item, defaultSourceName);
        if (parsedItem) {
          items.push(parsedItem);
        }
      }
      return items;
    }

    // Check Atom structure: feed.entry
    if (parsed.feed?.entry) {
      const rawEntries = Array.isArray(parsed.feed.entry)
        ? parsed.feed.entry
        : [parsed.feed.entry];

      for (const entry of rawEntries) {
        const parsedItem = this.mapAtomEntry(entry, defaultSourceName);
        if (parsedItem) {
          items.push(parsedItem);
        }
      }
      return items;
    }

    if (!parsed.rss && !parsed.feed) {
      throw new Error(
        'Không tìm thấy cấu trúc RSS hoặc Atom feed hợp lệ trong nội dung XML trả về.',
      );
    }

    return items;
  }

  private mapRssItem(
    item: Record<string, unknown>,
    defaultSourceName: string,
  ): RawNewsItem | null {
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    let link = '';

    if (typeof item.link === 'string') {
      link = item.link.trim();
    } else if (item.link && typeof item.link === 'object') {
      const linkObj = item.link as Record<string, unknown>;
      link =
        typeof linkObj['#text'] === 'string' ? linkObj['#text'].trim() : '';
    }

    if (
      !link &&
      typeof item.guid === 'string' &&
      item.guid.startsWith('http')
    ) {
      link = item.guid.trim();
    }

    if (!title || !link) {
      return null;
    }

    const rawContent =
      (typeof item['content:encoded'] === 'string' &&
        item['content:encoded']) ||
      (typeof item.description === 'string' && item.description) ||
      (typeof item['content'] === 'string' && item['content']) ||
      title;

    const content = stripHtml(rawContent).slice(0, 2000);

    let pubDate = new Date();
    const rawDate =
      (typeof item.pubDate === 'string' && item.pubDate) ||
      (typeof item['dc:date'] === 'string' && item['dc:date']);

    if (rawDate) {
      const parsedDate = new Date(rawDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        pubDate = parsedDate;
      }
    }

    const categories: string[] = [];
    if (item.category) {
      const rawCats = Array.isArray(item.category)
        ? item.category
        : [item.category];
      for (const cat of rawCats) {
        if (typeof cat === 'string') {
          categories.push(cat);
        } else if (cat && typeof cat === 'object') {
          const catObj = cat as Record<string, unknown>;
          if (typeof catObj['#text'] === 'string') {
            categories.push(catObj['#text']);
          }
        }
      }
    }

    const relatedCoins = extractRelatedCoins(categories, title, content);

    return {
      title,
      content,
      url: link,
      publishedAt: pubDate,
      source: defaultSourceName,
      relatedCoins,
    };
  }

  private mapAtomEntry(
    entry: Record<string, unknown>,
    defaultSourceName: string,
  ): RawNewsItem | null {
    const title = typeof entry.title === 'string' ? entry.title.trim() : '';
    let link = '';

    if (typeof entry.link === 'string') {
      link = entry.link.trim();
    } else if (Array.isArray(entry.link)) {
      const altLink = entry.link.find(
        (l) =>
          l &&
          typeof l === 'object' &&
          ((l as Record<string, unknown>)['@_rel'] === 'alternate' ||
            !(l as Record<string, unknown>)['@_rel']) &&
          typeof (l as Record<string, unknown>)['@_href'] === 'string',
      );
      if (altLink && typeof altLink === 'object') {
        link = (
          (altLink as Record<string, unknown>)['@_href'] as string
        ).trim();
      } else {
        for (const l of entry.link) {
          if (typeof l === 'string' && l.trim()) {
            link = l.trim();
            break;
          } else if (l && typeof l === 'object') {
            const lObj = l as Record<string, unknown>;
            if (typeof lObj['@_href'] === 'string' && lObj['@_href'].trim()) {
              link = lObj['@_href'].trim();
              break;
            } else if (
              typeof lObj['#text'] === 'string' &&
              lObj['#text'].trim()
            ) {
              link = lObj['#text'].trim();
              break;
            }
          }
        }
      }
    } else if (entry.link && typeof entry.link === 'object') {
      const linkObj = entry.link as Record<string, unknown>;
      if (typeof linkObj['@_href'] === 'string') {
        link = linkObj['@_href'].trim();
      } else if (typeof linkObj['#text'] === 'string') {
        link = linkObj['#text'].trim();
      }
    }

    if (!link && typeof entry.id === 'string' && entry.id.startsWith('http')) {
      link = entry.id.trim();
    }

    if (!title || !link) {
      return null;
    }

    const rawContent =
      (typeof entry.summary === 'string' && entry.summary) ||
      (typeof entry.content === 'string' && entry.content) ||
      title;

    const content = stripHtml(rawContent).slice(0, 2000);

    let pubDate = new Date();
    const rawDate =
      (typeof entry.published === 'string' && entry.published) ||
      (typeof entry.updated === 'string' && entry.updated);

    if (rawDate) {
      const parsedDate = new Date(rawDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        pubDate = parsedDate;
      }
    }

    const categories: string[] = [];
    if (entry.category) {
      const rawCats = Array.isArray(entry.category)
        ? entry.category
        : [entry.category];
      for (const cat of rawCats) {
        if (
          typeof cat === 'object' &&
          cat &&
          typeof (cat as Record<string, unknown>)['@_term'] === 'string'
        ) {
          categories.push((cat as Record<string, unknown>)['@_term'] as string);
        }
      }
    }

    const relatedCoins = extractRelatedCoins(categories, title, content);

    return {
      title,
      content,
      url: link,
      publishedAt: pubDate,
      source: defaultSourceName,
      relatedCoins,
    };
  }
}
