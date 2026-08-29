import type { AppLogger } from '@/utils/logger';
import type { NewsCrawlerInterface } from '../interfaces/newsCrawler.interface';

interface NewsSchedulerDependencies {
  crawler: NewsCrawlerInterface;
  logger: AppLogger;
  initialIntervalMinutes?: number;
  autoStart?: boolean;
}

export class NewsScheduler {
  private readonly crawler: NewsCrawlerInterface;
  private readonly logger: AppLogger;
  private intervalMinutes: number;
  private timer: NodeJS.Timeout | null = null;
  private isCrawling = false;

  public constructor({
    crawler,
    logger,
    initialIntervalMinutes = 3,
    autoStart = false,
  }: NewsSchedulerDependencies) {
    this.crawler = crawler;
    this.logger = logger;
    this.intervalMinutes = Math.max(1, Math.min(5, initialIntervalMinutes));

    if (autoStart) {
      this.start();
    }
  }

  public getIntervalMinutes(): number {
    return this.intervalMinutes;
  }

  public setIntervalMinutes(minutes: number): void {
    const validMinutes = Math.max(1, Math.min(5, minutes));
    this.intervalMinutes = validMinutes;
    this.logger.info(
      { intervalMinutes: this.intervalMinutes },
      'Updated news crawl scheduler interval',
    );

    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  public start(): void {
    if (this.timer) {
      return;
    }

    this.logger.info(
      { intervalMinutes: this.intervalMinutes },
      'Starting news crawl scheduler',
    );

    // Run first crawl asynchronously on start
    void this.tick();

    const intervalMs = this.intervalMinutes * 60 * 1000;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('Stopped news crawl scheduler');
    }
  }

  public async tick(): Promise<void> {
    if (this.isCrawling) {
      this.logger.debug(
        'Skipping news crawl tick: previous crawl is still running',
      );
      return;
    }

    this.isCrawling = true;
    try {
      await this.crawler.crawlAllActiveSources();
    } catch (error) {
      this.logger.error({ err: error }, 'Error in scheduled news crawl tick');
    } finally {
      this.isCrawling = false;
    }
  }
}
