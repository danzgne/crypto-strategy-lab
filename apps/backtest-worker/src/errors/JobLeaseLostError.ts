export class JobLeaseLostError extends Error {
  public constructor(jobId: string) {
    super(`Backtest job lease was lost for ${jobId}`);
    this.name = 'JobLeaseLostError';
  }
}
