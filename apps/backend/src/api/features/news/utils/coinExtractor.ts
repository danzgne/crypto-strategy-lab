export const KNOWN_COINS = [
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
] as const;

export const COIN_MAP: Record<string, string> = {
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

export function extractRelatedCoins(
  tags: string[],
  title: string,
  content: string,
): string[] {
  const detected = new Set<string>();
  const combined = `${tags.join(' ')} ${title} ${content}`.toUpperCase();

  for (const keyword of KNOWN_COINS) {
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
