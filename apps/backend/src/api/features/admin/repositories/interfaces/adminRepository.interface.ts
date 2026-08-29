import type { NewsSource, NewsCrawlAttempt } from '@crypto-strategy-lab/shared';

export interface AdminRepositoryInterface {
  findNewsSources(): Promise<NewsSource[]>;
  findRecentCrawlLogs(limit?: number): Promise<NewsCrawlAttempt[]>;
}
