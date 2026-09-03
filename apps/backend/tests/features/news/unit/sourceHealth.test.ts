import { describe, it, expect } from 'vitest';
import { isSourceHealthy } from '@/api/features/news/services/sourceHealth';

describe('isSourceHealthy', () => {
  const now = new Date('2026-09-02T15:00:00.000Z');
  const refreshIntervalMinutes = 3;

  it('is healthy when the last attempt succeeded within the refresh interval', () => {
    expect(
      isSourceHealthy(
        { status: 'SUCCESS', crawledAt: '2026-09-02T14:58:30.000Z' },
        refreshIntervalMinutes,
        now,
      ),
    ).toBe(true);
  });

  it('tolerates one skipped tick: healthy up to twice the refresh interval', () => {
    expect(
      isSourceHealthy(
        { status: 'SUCCESS', crawledAt: '2026-09-02T14:54:30.000Z' },
        refreshIntervalMinutes,
        now,
      ),
    ).toBe(true);
  });

  it('is unhealthy once the last success is older than twice the refresh interval', () => {
    expect(
      isSourceHealthy(
        { status: 'SUCCESS', crawledAt: '2026-09-02T14:53:00.000Z' },
        refreshIntervalMinutes,
        now,
      ),
    ).toBe(false);
  });

  it('is unhealthy when the most recent attempt failed, even if recent', () => {
    expect(
      isSourceHealthy(
        { status: 'FAILURE', crawledAt: '2026-09-02T14:59:59.000Z' },
        refreshIntervalMinutes,
        now,
      ),
    ).toBe(false);
  });

  it('is unhealthy when there has never been an attempt', () => {
    expect(isSourceHealthy(null, refreshIntervalMinutes, now)).toBe(false);
  });
});
