import { describe, it, expect } from 'vitest';
import { extractRelatedCoins } from '@/api/features/news/utils/coinExtractor';

describe('coinExtractor', () => {
  it('extracts canonical coin symbols from title and content', () => {
    const coins = extractRelatedCoins(
      [],
      'Bitcoin and Ethereum Surge Today',
      'The market is bullish on BTC, ETH, and SOL.',
    );
    expect(coins).toContain('BTC');
    expect(coins).toContain('ETH');
    expect(coins).toContain('SOL');
    expect(coins).toHaveLength(3);
  });

  it('extracts coin symbols from tags', () => {
    const coins = extractRelatedCoins(
      ['SOLANA', 'DEFI'],
      'New Protocol Launched',
      'Some details',
    );
    expect(coins).toContain('SOL');
  });

  it('matches full coin names case-insensitively with word boundaries', () => {
    const coins = extractRelatedCoins(
      [],
      'Cardano and Avalanche update',
      'avalanche network',
    );
    expect(coins).toContain('ADA');
    expect(coins).toContain('AVAX');
  });

  it('returns empty array when no coins are mentioned', () => {
    const coins = extractRelatedCoins(
      [],
      'Stock market closes higher',
      'US economy grew 2%',
    );
    expect(coins).toEqual([]);
  });
});
