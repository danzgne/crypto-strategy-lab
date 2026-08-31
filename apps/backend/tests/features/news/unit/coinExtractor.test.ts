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

  it('does not falsely extract ambiguous coins from common English words', () => {
    const coins = extractRelatedCoins(
      [],
      'Price is near all-time high, click link for details',
      'A red dot appeared on the chart with an apt observation.',
    );
    expect(coins).toEqual([]);
  });

  it('correctly extracts ambiguous coins when using full name, cashtag, or tags', () => {
    const coins1 = extractRelatedCoins(
      [],
      'Chainlink and Polkadot partnership',
      'Near Protocol is expanding with Aptos support.',
    );
    expect(coins1).toContain('LINK');
    expect(coins1).toContain('DOT');
    expect(coins1).toContain('NEAR');
    expect(coins1).toContain('APT');

    const coins2 = extractRelatedCoins(
      ['DOT', 'NEAR'],
      'Daily crypto roundup',
      'Looking at $LINK and $APT performance.',
    );
    expect(coins2).toContain('DOT');
    expect(coins2).toContain('NEAR');
    expect(coins2).toContain('LINK');
    expect(coins2).toContain('APT');
  });
});
