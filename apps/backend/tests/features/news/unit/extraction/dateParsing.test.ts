import { describe, it, expect } from 'vitest';
import { parseTimestamp } from '@/api/features/news/services/extraction/dateParsing';

describe('parseTimestamp', () => {
  const now = new Date('2026-09-02T15:16:10.000Z');

  it('parses an ISO-8601 timestamp with a timezone offset', () => {
    const result = parseTimestamp('2026-09-02T14:45:03+01:00', now);
    expect(result.malformed).toBe(false);
    expect(result.date.toISOString()).toBe('2026-09-02T13:45:03.000Z');
  });

  it('parses an RFC-2822 timestamp', () => {
    const result = parseTimestamp('Wed, 02 Sep 2026 13:45:03 GMT', now);
    expect(result.malformed).toBe(false);
    expect(result.date.toISOString()).toBe('2026-09-02T13:45:03.000Z');
  });

  it('parses "N seconds ago" relative to now', () => {
    const result = parseTimestamp('52 seconds ago', now);
    expect(result.malformed).toBe(false);
    expect(result.date.toISOString()).toBe('2026-09-02T15:15:18.000Z');
  });

  it('parses "N mins ago"', () => {
    const result = parseTimestamp('31 mins ago', now);
    expect(result.malformed).toBe(false);
    expect(result.date.toISOString()).toBe('2026-09-02T14:45:10.000Z');
  });

  it('parses "N hours ago"', () => {
    const result = parseTimestamp('2 hours ago', now);
    expect(result.malformed).toBe(false);
    expect(result.date.toISOString()).toBe('2026-09-02T13:16:10.000Z');
  });

  it('parses "N days ago"', () => {
    const result = parseTimestamp('3 days ago', now);
    expect(result.malformed).toBe(false);
    expect(result.date.toISOString()).toBe('2026-08-30T15:16:10.000Z');
  });

  it('parses "yesterday"', () => {
    const result = parseTimestamp('yesterday', now);
    expect(result.malformed).toBe(false);
    expect(result.date.toISOString()).toBe('2026-09-01T15:16:10.000Z');
  });

  it('parses "just now" as the current time', () => {
    const result = parseTimestamp('just now', now);
    expect(result.malformed).toBe(false);
    expect(result.date.toISOString()).toBe(now.toISOString());
  });

  it('is case-insensitive for relative phrases', () => {
    const result = parseTimestamp('2 Hours Ago', now);
    expect(result.malformed).toBe(false);
  });

  it('treats an unparseable string as malformed and falls back to now', () => {
    const result = parseTimestamp('sometime soon-ish', now);
    expect(result.malformed).toBe(true);
    expect(result.date.toISOString()).toBe(now.toISOString());
  });

  it('treats a timestamp in the future as malformed and falls back to now', () => {
    const result = parseTimestamp('2026-09-03T00:00:00Z', now);
    expect(result.malformed).toBe(true);
    expect(result.date.toISOString()).toBe(now.toISOString());
  });

  it('treats an empty string as malformed', () => {
    const result = parseTimestamp('', now);
    expect(result.malformed).toBe(true);
  });
});
