export const UNAMBIGUOUS_COINS: Record<string, string> = {
  BITCOIN: 'BTC',
  BTC: 'BTC',
  ETHEREUM: 'ETH',
  ETH: 'ETH',
  SOLANA: 'SOL',
  SOL: 'SOL',
  BNB: 'BNB',
  BINANCE: 'BNB',
  XRP: 'XRP',
  RIPPLE: 'XRP',
  DOGE: 'DOGE',
  DOGECOIN: 'DOGE',
  CARDANO: 'ADA',
  ADA: 'ADA',
  AVALANCHE: 'AVAX',
  AVAX: 'AVAX',
  SHIB: 'SHIB',
  SHIBA: 'SHIBA',
  PEPE: 'PEPE',
  SUI: 'SUI',
};

export const AMBIGUOUS_COINS: Record<
  string,
  { canonical: string; fullNames: string[]; ticker: string }
> = {
  NEAR: {
    canonical: 'NEAR',
    fullNames: ['NEAR PROTOCOL', 'NEAR FOUNDATION'],
    ticker: 'NEAR',
  },
  DOT: {
    canonical: 'DOT',
    fullNames: ['POLKADOT'],
    ticker: 'DOT',
  },
  LINK: {
    canonical: 'LINK',
    fullNames: ['CHAINLINK'],
    ticker: 'LINK',
  },
  APT: {
    canonical: 'APT',
    fullNames: ['APTOS'],
    ticker: 'APT',
  },
};

export function extractRelatedCoins(
  tags: string[],
  title: string,
  content: string,
): string[] {
  const detected = new Set<string>();
  const normalizedTags = tags.map((t) => t.toUpperCase().trim());
  const combinedText = `${title} ${content}`;
  const upperText = combinedText.toUpperCase();

  // 1. Check tags directly for any coin symbol or full name
  for (const tag of normalizedTags) {
    if (UNAMBIGUOUS_COINS[tag]) {
      detected.add(UNAMBIGUOUS_COINS[tag]!);
    }
    for (const [key, conf] of Object.entries(AMBIGUOUS_COINS)) {
      if (tag === key || conf.fullNames.includes(tag)) {
        detected.add(conf.canonical);
      }
    }
  }

  // 2. Check unambiguous coins across title and content with word boundary
  for (const [keyword, canonical] of Object.entries(UNAMBIGUOUS_COINS)) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(upperText)) {
      detected.add(canonical);
    }
  }

  // 3. For ambiguous coins, match full name, cashtag ($NEAR), or explicit uppercase symbol surrounded by crypto context
  for (const conf of Object.values(AMBIGUOUS_COINS)) {
    // Check full name (e.g. "Chainlink", "Polkadot", "Near Protocol", "Aptos")
    for (const fullName of conf.fullNames) {
      const nameRegex = new RegExp(`\\b${fullName}\\b`, 'i');
      if (nameRegex.test(upperText)) {
        detected.add(conf.canonical);
        break;
      }
    }

    // Check $TICKER (e.g. "$LINK", "$DOT", "$NEAR", "$APT")
    const cashtagRegex = new RegExp(`\\$${conf.ticker}\\b`, 'i');
    if (cashtagRegex.test(combinedText)) {
      detected.add(conf.canonical);
    }
  }

  return Array.from(detected);
}
