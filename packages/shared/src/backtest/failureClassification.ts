import type { JobFailureCategory } from '../queue/types';

export const INITIAL_RETRY_DELAY_MS = 1_000;
export const MAX_RETRY_DELAY_MS = 5 * 60 * 1_000; // 5 minutes

export interface RetryDelayOptions {
  baseMs?: number;
  maxMs?: number;
  random?: () => number;
}

/**
 * Calculates exponential backoff with jitter beginning at 1 second and capped at 5 minutes.
 *
 * For attempt/retryCount 1: ~1000ms (+ jitter)
 * For attempt/retryCount 2: ~2000ms (+ jitter)
 * For attempt/retryCount 3: ~4000ms (+ jitter)
 * Capped at 300,000ms (5 minutes).
 */
export function calculateRetryDelayMs(
  retryCount: number,
  options: RetryDelayOptions = {},
): number {
  const baseMs = Math.max(100, options.baseMs ?? INITIAL_RETRY_DELAY_MS);
  const maxMs = Math.max(baseMs, options.maxMs ?? MAX_RETRY_DELAY_MS);
  const random = options.random ?? Math.random;

  const exponent = Math.max(0, retryCount - 1);
  const rawBase = baseMs * Math.pow(2, exponent);
  const clampedBase = Math.min(maxMs, rawBase);

  // Add up to 20% proportional jitter, never exceeding maxMs
  const jitterRange = Math.floor(clampedBase * 0.2);
  const jitter = jitterRange > 0 ? Math.floor(random() * jitterRange) : 0;

  return Math.min(maxMs, clampedBase + jitter);
}

export function computeNextEligibleAt(
  retryCount: number,
  options: RetryDelayOptions & { now?: number } = {},
): Date {
  const now = options.now ?? Date.now();
  const delayMs = calculateRetryDelayMs(retryCount, options);
  return new Date(now + delayMs);
}

const PERMANENT_ERROR_NAMES = new Set([
  'InvalidConfigError',
  'InvalidDatasetSnapshotError',
  'UnsupportedExecutionInputError',
]);

const PERMANENT_PATTERNS = [
  /dataset snapshot/i,
  /stored composite strategy definition is invalid/i,
  /strategy .* not (found|registered|applicable|backtestable)/i,
  /unsupported execution input/i,
  /invalid configuration/i,
  /invalid strategy/i,
  /backtest range/i,
  /historical candles/i,
  /backtest candles/i,
  /initial investment/i,
  /transaction cost/i,
  /slippage/i,
];

/**
 * Classifies an error into TRANSIENT or PERMANENT.
 * - Database/network timeout, worker interruption, and lease interruption are TRANSIENT.
 * - Invalid configuration, invalid or missing Dataset Snapshot, and unsupported execution input are PERMANENT.
 * - Unknown or unexpected runtime errors default to TRANSIENT so they can be retried up to max attempts.
 */
export function classifyError(error: unknown): JobFailureCategory {
  if (error === null || typeof error !== 'object') {
    return 'TRANSIENT';
  }

  const candidate = error as {
    failureCategory?: unknown;
    name?: unknown;
    message?: unknown;
  };

  if (candidate.failureCategory === 'PERMANENT') {
    return 'PERMANENT';
  }
  if (candidate.failureCategory === 'TRANSIENT') {
    return 'TRANSIENT';
  }

  if (
    typeof candidate.name === 'string' &&
    PERMANENT_ERROR_NAMES.has(candidate.name)
  ) {
    return 'PERMANENT';
  }

  const message =
    typeof candidate.message === 'string' ? candidate.message : '';

  for (const pattern of PERMANENT_PATTERNS) {
    if (pattern.test(message)) {
      return 'PERMANENT';
    }
  }

  return 'TRANSIENT';
}
