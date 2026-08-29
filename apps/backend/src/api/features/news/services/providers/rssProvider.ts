import { XMLParser } from 'fast-xml-parser';
import type {
  NewsProviderType,
  NewsSource,
  RawNewsItem,
} from '@crypto-strategy-lab/shared';
import type { NewsProvider } from '../interfaces/newsProvider.interface';

const KNOWN_COINS = [
  'BTC',
  'BITCOIN',
  'ETH',
  'ETHEREUM',
  'SOL',
  'SOLANA',
  'BNB',
  'XRP',
  'DOGE',
  'ADA',
  'CARDANO',
  'AVAX',
  'AVALANCHE',
  'LINK',
  'CHAINLINK',
  'DOT',
  'POLKADOT',
  'NEAR',
  'SUI',
  'APT',
  'PEPE',
  'SHIB',
];

const COIN_MAP: Record<string, string> = {
  BITCOIN: 'BTC',
  BTC: 'BTC',
  ETHEREUM: 'ETH',
  ETH: 'ETH',
  SOLANA: 'SOL',
  SOL: 'SOL',
  BNB: 'BNB',
  XRP: 'XRP',
  DOGE: 'DOGE',
  CARDANO: 'ADA',
  ADA: 'ADA',
  AVALANCHE: 'AVAX',
  AVAX: 'AVAX',
  CHAINLINK: 'LINK',
  LINK: 'LINK',
  POLKADOT: 'DOT',
  DOT: 'DOT',
  NEAR: 'NEAR',
  SUI: 'SUI',
  APT: 'APT',
  PEPE: 'PEPE',
  SHIB: 'SHIB',
};

import { stripHtml } from '../../utils/htmlSanitizer';

function extractRelatedCoins(
  tags: string[],
  title: string,
  content: string,
): string[] {
  const detected = new Set<string>();
  const combined = `${tags.join(' ')} ${title} ${content}`.toUpperCase();

  for (const keyword of KNOWN_COINS) {
    // Word boundary match
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(combined)) {
      const canonical = COIN_MAP[keyword];
      if (canonical) {
        detected.add(canonical);
      }
    }
  }

  return Array.from(detected);
}

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
    } else if (entry.link && typeof entry.link === 'object') {
      const linkObj = entry.link as Record<string, unknown>;
      if (typeof linkObj['@_href'] === 'string') {
        link = linkObj['@_href'].trim();
      } else if (typeof linkObj['#text'] === 'string') {
        link = linkObj['#text'].trim();
      }
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
