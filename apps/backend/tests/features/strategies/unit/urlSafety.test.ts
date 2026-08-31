import { describe, expect, it, vi } from 'vitest';

import {
  assertSafeUrl,
  isPublicAddress,
  UnsafeUrlError,
} from '@/api/features/strategies/generation/urlSafety';

describe('isPublicAddress', () => {
  it('rejects IPv4 loopback', () => {
    expect(isPublicAddress('127.0.0.1')).toBe(false);
  });

  it('rejects IPv4 private ranges', () => {
    expect(isPublicAddress('10.1.2.3')).toBe(false);
    expect(isPublicAddress('172.16.0.5')).toBe(false);
    expect(isPublicAddress('192.168.1.1')).toBe(false);
  });

  it('rejects the link-local metadata address', () => {
    expect(isPublicAddress('169.254.169.254')).toBe(false);
  });

  it('rejects IPv6 loopback and link-local and unique-local', () => {
    expect(isPublicAddress('::1')).toBe(false);
    expect(isPublicAddress('fe80::1')).toBe(false);
    expect(isPublicAddress('fd00::1')).toBe(false);
  });

  it('rejects an IPv4-mapped IPv6 address smuggling a private IPv4', () => {
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false);
  });

  it('accepts an ordinary public IPv4 address', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
  });

  it('accepts an ordinary public IPv6 address', () => {
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
});

describe('assertSafeUrl', () => {
  it('accepts an https URL that resolves to a public address', async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34' }]);
    await expect(
      assertSafeUrl(new URL('https://example.com/strategy'), { lookup }),
    ).resolves.toBeUndefined();
  });

  it('accepts a plain http URL', async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34' }]);
    await expect(
      assertSafeUrl(new URL('http://example.com/strategy'), { lookup }),
    ).resolves.toBeUndefined();
  });

  it('rejects a non-http(s) scheme without resolving DNS', async () => {
    const lookup = vi.fn();
    await expect(
      assertSafeUrl(new URL('file:///etc/passwd'), { lookup }),
    ).rejects.toThrow(UnsafeUrlError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects the literal hostname "localhost"', async () => {
    const lookup = vi.fn();
    await expect(
      assertSafeUrl(new URL('http://localhost:5432/'), { lookup }),
    ).rejects.toThrow(UnsafeUrlError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects a hostname that resolves to a private address', async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: '10.0.0.5' }]);
    await expect(
      assertSafeUrl(new URL('http://internal.example.com/'), { lookup }),
    ).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects a hostname when any resolved address is private', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue([
        { address: '93.184.216.34' },
        { address: '169.254.169.254' },
      ]);
    await expect(
      assertSafeUrl(new URL('http://multi-homed.example.com/'), { lookup }),
    ).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects a hostname with no DNS records', async () => {
    const lookup = vi.fn().mockResolvedValue([]);
    await expect(
      assertSafeUrl(new URL('http://nowhere.invalid/'), { lookup }),
    ).rejects.toThrow(UnsafeUrlError);
  });
});
