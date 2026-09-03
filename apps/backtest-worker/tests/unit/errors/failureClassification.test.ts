import { describe, expect, it } from 'vitest';
import {
  calculateRetryDelayMs,
  classifyError,
  computeNextEligibleAt,
  INITIAL_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
} from '@crypto-strategy-lab/shared';

describe('classifyError', () => {
  it('classifies explicit PERMANENT errors', () => {
    class InvalidConfigError extends Error {
      override name = 'InvalidConfigError';
    }
    class InvalidDatasetSnapshotError extends Error {
      override name = 'InvalidDatasetSnapshotError';
    }
    class UnsupportedExecutionInputError extends Error {
      override name = 'UnsupportedExecutionInputError';
    }
    class UnsupportedVersionError extends Error {
      override name = 'UnsupportedVersionError';
    }

    expect(classifyError(new InvalidConfigError('bad params'))).toBe(
      'PERMANENT',
    );
    expect(
      classifyError(new InvalidDatasetSnapshotError('missing snapshot')),
    ).toBe('PERMANENT');
    expect(
      classifyError(new UnsupportedExecutionInputError('not applicable')),
    ).toBe('PERMANENT');
    expect(
      classifyError(
        new UnsupportedVersionError('UNSUPPORTED_VERSION: bad version'),
      ),
    ).toBe('PERMANENT');
  });

  it('classifies messages matching permanent patterns', () => {
    expect(
      classifyError(
        new Error('Backtest job has no immutable dataset snapshot'),
      ),
    ).toBe('PERMANENT');
    expect(
      classifyError(new Error('Strategy ma not applicable to BTCUSDT on 1m')),
    ).toBe('PERMANENT');
    expect(
      classifyError(
        new Error('Stored composite strategy definition is invalid'),
      ),
    ).toBe('PERMANENT');
    expect(
      classifyError(new Error('Strategy unknown not found in registry')),
    ).toBe('PERMANENT');
  });

  it('classifies explicit TRANSIENT errors and operational interruptions', () => {
    class JobLeaseLostError extends Error {
      override name = 'JobLeaseLostError';
    }

    expect(classifyError(new JobLeaseLostError('lost lease'))).toBe(
      'TRANSIENT',
    );
    expect(classifyError(new Error('Database connection timeout'))).toBe(
      'TRANSIENT',
    );
    expect(
      classifyError(new Error('Network timeout reaching PostgreSQL')),
    ).toBe('TRANSIENT');
    expect(
      classifyError(new Error('Worker interrupted during execution')),
    ).toBe('TRANSIENT');
    expect(classifyError(new Error('Random unexpected glitch'))).toBe(
      'TRANSIENT',
    );
  });

  it('handles non-error objects gracefully', () => {
    expect(classifyError(null)).toBe('TRANSIENT');
    expect(classifyError(undefined)).toBe('TRANSIENT');
    expect(classifyError('string error')).toBe('TRANSIENT');
    expect(classifyError({ failureCategory: 'PERMANENT' })).toBe('PERMANENT');
    expect(classifyError({ failureCategory: 'TRANSIENT' })).toBe('TRANSIENT');
  });
});

describe('calculateRetryDelayMs', () => {
  it('begins at approximately 1 second on retry 1 and stays under cap', () => {
    const fixedRandom = () => 0;
    const delay1 = calculateRetryDelayMs(1, { random: fixedRandom });
    expect(delay1).toBe(INITIAL_RETRY_DELAY_MS); // 1000ms

    const delay2 = calculateRetryDelayMs(2, { random: fixedRandom });
    expect(delay2).toBe(2_000); // 2000ms

    const delay3 = calculateRetryDelayMs(3, { random: fixedRandom });
    expect(delay3).toBe(4_000); // 4000ms
  });

  it('applies jitter within range', () => {
    const maxRandom = () => 0.999;
    const delay = calculateRetryDelayMs(1, { random: maxRandom });
    expect(delay).toBeGreaterThanOrEqual(1000);
    expect(delay).toBeLessThanOrEqual(1200);
  });

  it('never exceeds the 5-minute cap', () => {
    const hugeRetry = 20;
    const delay = calculateRetryDelayMs(hugeRetry);
    expect(delay).toBeLessThanOrEqual(MAX_RETRY_DELAY_MS);
    expect(delay).toBe(MAX_RETRY_DELAY_MS);
  });

  it('computes next eligible date accurately', () => {
    const now = 1_700_000_000_000;
    const nextDate = computeNextEligibleAt(1, { now, random: () => 0 });
    expect(nextDate.getTime()).toBe(now + 1_000);
  });
});
