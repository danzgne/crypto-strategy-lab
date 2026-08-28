import type { IJobQueue, Job } from '@crypto-strategy-lab/shared';
import type { AppLogger } from '../utils/logger';

export class BacktestWorker {
  private isRunning = false;
  private currentInterval = 1000; // 1s
  private readonly maxInterval = 10000; // 10s
  private readonly minInterval = 1000; // 1s

  constructor(
    private workerId: string,
    private queue: IJobQueue,
    private logger: AppLogger,
  ) {}

  public async start() {
    this.isRunning = true;
    this.logger.info({ workerId: this.workerId }, 'Backtest Worker started');
    this.loop();
  }

  public stop() {
    this.isRunning = false;
    this.logger.info({ workerId: this.workerId }, 'Backtest Worker stopping');
  }

  private async loop() {
    while (this.isRunning) {
      try {
        const job = await this.queue.claim(this.workerId);

        if (job) {
          // Reset interval when a job is found
          this.currentInterval = this.minInterval;
          this.logger.info({ jobId: job.id }, 'Claimed backtest job');

          await this.processJob(job);
        } else {
          // Escalating polling interval when queue is empty
          this.currentInterval = Math.min(
            this.currentInterval * 1.5,
            this.maxInterval,
          );
          await this.sleep(this.currentInterval);
        }
      } catch (error) {
        this.logger.error({ err: error }, 'Error in worker loop');
        await this.sleep(this.currentInterval);
      }
    }
  }

  private async processJob(job: Job) {
    try {
      // Stub simulation body
      this.logger.info({ jobId: job.id }, 'Running stub simulation...');
      await this.sleep(500); // Simulate some work
      this.logger.info({ jobId: job.id }, 'Simulation complete');

      await this.queue.complete(job.id, { return: 0.05, winRate: 0.55 });
      this.logger.info({ jobId: job.id }, 'Job marked COMPLETED');
    } catch (error) {
      this.logger.error({ err: error, jobId: job.id }, 'Simulation failed');
      await this.queue.fail(job.id, error as Error);
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
