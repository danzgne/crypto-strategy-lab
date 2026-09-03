import { cpus, freemem, hostname, totalmem } from 'node:os';

export interface MachineContext {
  hostname: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
}

export interface BenchmarkMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  lostJobs: number;
  duplicates: number;
  totalRetries: number;
  workerCount: number;
  datasetCandleCount: number;
  wallTimeSeconds: number;
  throughputJobsPerSecond: number;
  p95QueueWaitMs: number;
  p95ExecutionDurationMs: number;
  peakPostgresConnections: number;
  machineContext: MachineContext;
}

export function getMachineContext(): MachineContext {
  const cpuList = cpus();
  return {
    hostname: hostname(),
    cpuModel: cpuList[0]?.model ?? 'Unknown CPU',
    cpuCores: cpuList.length,
    totalMemoryMb: Math.round(totalmem() / (1024 * 1024)),
    freeMemoryMb: Math.round(freemem() / (1024 * 1024)),
  };
}

export function formatHumanReport(metrics: BenchmarkMetrics): string {
  const lines: string[] = [
    '================================================================================',
    '                        BACKTEST QUEUE BENCHMARK REPORT                         ',
    '================================================================================',
    `Campaign Size:         ${metrics.totalJobs.toLocaleString()} jobs`,
    `Completed:             ${metrics.completedJobs.toLocaleString()} (${((metrics.completedJobs / Math.max(1, metrics.totalJobs)) * 100).toFixed(1)}%)`,
    `Failed:                ${metrics.failedJobs.toLocaleString()}`,
    `Lost Jobs:             ${metrics.lostJobs.toLocaleString()}`,
    `Duplicates:            ${metrics.duplicates.toLocaleString()}`,
    `Retries/Failures:      ${metrics.totalRetries.toLocaleString()}`,
    '--------------------------------------------------------------------------------',
    `Active Workers:        ${metrics.workerCount}`,
    `Dataset Snapshot Size: ${metrics.datasetCandleCount} candles`,
    `Wall Time:             ${metrics.wallTimeSeconds.toFixed(2)}s`,
    `Throughput:            ${metrics.throughputJobsPerSecond.toFixed(2)} jobs/sec`,
    `P95 Queue Wait:        ${metrics.p95QueueWaitMs.toFixed(2)} ms`,
    `P95 Execution Duration:${metrics.p95ExecutionDurationMs.toFixed(2)} ms`,
    `Postgres Peak Conns:   ${metrics.peakPostgresConnections}`,
    '--------------------------------------------------------------------------------',
    'Machine Context:',
    `  Host:                ${metrics.machineContext.hostname}`,
    `  CPU:                 ${metrics.machineContext.cpuModel} (${metrics.machineContext.cpuCores} cores)`,
    `  Memory:              ${metrics.machineContext.freeMemoryMb} MB free / ${metrics.machineContext.totalMemoryMb} MB total`,
    '================================================================================',
  ];
  return lines.join('\n');
}

export function formatJsonReport(metrics: BenchmarkMetrics): string {
  return JSON.stringify(metrics, null, 2);
}
