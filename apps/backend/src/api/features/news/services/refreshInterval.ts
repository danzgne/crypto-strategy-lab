export const CRAWL_INTERVAL_SETTING_KEY = 'news.crawl_interval_minutes';
export const DEFAULT_REFRESH_INTERVAL_MINUTES = 3;

export function parseRefreshIntervalMinutes(
  raw: string | null | undefined,
): number {
  const parsed = raw === null || raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 1
    ? parsed
    : DEFAULT_REFRESH_INTERVAL_MINUTES;
}
