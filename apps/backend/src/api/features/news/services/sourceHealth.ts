import type { CrawlStatus } from '@crypto-strategy-lab/shared';

export interface LastAttemptSummary {
  status: CrawlStatus;
  crawledAt: string;
}

/**
 * Health, not the admin's Enabled switch: a Source is active when its most recent
 * crawl attempt succeeded within twice its configured refresh interval, so one
 * skipped tick is not read as an outage.
 */
export function isSourceHealthy(
  lastAttempt: LastAttemptSummary | null | undefined,
  refreshIntervalMinutes: number,
  now: Date,
): boolean {
  if (!lastAttempt || lastAttempt.status !== 'SUCCESS') return false;

  const ageMs = now.getTime() - new Date(lastAttempt.crawledAt).getTime();
  return ageMs <= 2 * refreshIntervalMinutes * 60_000;
}
