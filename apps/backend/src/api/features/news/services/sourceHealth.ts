import type { CrawlStatus } from '@crypto-strategy-lab/shared';

export interface LastAttemptSummary {
  status: CrawlStatus;
  crawledAt: string;
}

// Health, not the admin's Enabled switch: within twice the interval, one skipped tick isn't an outage.
export function isSourceHealthy(
  lastAttempt: LastAttemptSummary | null | undefined,
  refreshIntervalMinutes: number,
  now: Date,
): boolean {
  if (!lastAttempt || lastAttempt.status !== 'SUCCESS') return false;

  const ageMs = now.getTime() - new Date(lastAttempt.crawledAt).getTime();
  return ageMs <= 2 * refreshIntervalMinutes * 60_000;
}
