import { BlockList, isIP } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';

export class UnsafeUrlError extends Error {}

const PRIVATE_ADDRESSES = new BlockList();
PRIVATE_ADDRESSES.addSubnet('0.0.0.0', 8, 'ipv4');
PRIVATE_ADDRESSES.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_ADDRESSES.addSubnet('100.64.0.0', 10, 'ipv4');
PRIVATE_ADDRESSES.addSubnet('127.0.0.0', 8, 'ipv4');
PRIVATE_ADDRESSES.addSubnet('169.254.0.0', 16, 'ipv4');
PRIVATE_ADDRESSES.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_ADDRESSES.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE_ADDRESSES.addSubnet('::1', 128, 'ipv6');
PRIVATE_ADDRESSES.addSubnet('fe80::', 10, 'ipv6');
PRIVATE_ADDRESSES.addSubnet('fc00::', 7, 'ipv6');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return !PRIVATE_ADDRESSES.check(address, 'ipv4');
  }
  if (version === 6) {
    const mapped = extractIpv4MappedAddress(address);
    if (mapped !== null) return isPublicAddress(mapped);
    return !PRIVATE_ADDRESSES.check(address, 'ipv6');
  }
  return false;
}

function extractIpv4MappedAddress(address: string): string | null {
  const match = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (match?.[1] === undefined) return null;
  return isIP(match[1]) === 4 ? match[1] : null;
}

export interface AssertSafeUrlDependencies {
  lookup?:
    ((hostname: string) => Promise<readonly LookupAddress[]>) | undefined;
}

export async function assertSafeUrl(
  url: URL,
  { lookup = defaultLookup }: AssertSafeUrlDependencies = {},
): Promise<void> {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeUrlError(`Refusing to fetch URL scheme "${url.protocol}"`);
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost') {
    throw new UnsafeUrlError('Refusing to fetch the "localhost" hostname');
  }

  const addresses = await lookup(hostname);
  if (addresses.length === 0) {
    throw new UnsafeUrlError(
      `Host "${hostname}" did not resolve to any address`,
    );
  }
  for (const { address } of addresses) {
    if (!isPublicAddress(address)) {
      throw new UnsafeUrlError(
        `Host "${hostname}" resolves to a non-public address`,
      );
    }
  }
}

async function defaultLookup(
  hostname: string,
): Promise<readonly LookupAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}
