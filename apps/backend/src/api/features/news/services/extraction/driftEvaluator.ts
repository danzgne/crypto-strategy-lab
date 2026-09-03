import type { DriftVerdict } from '@crypto-strategy-lab/shared';

export interface DriftAttemptSample {
  itemsFound: number;
  emptyFieldRate: number;
  malformedFieldRate: number;
}

const MIN_ATTEMPTS = 3;
const MIN_ITEMS = 10;

// A zero-match attempt counts as one fully-empty sample (weight 1, not 0) rather than
// zero weight, so total match failure can't stall the minimum-sample gate forever.
export function evaluateDrift(
  attempts: readonly DriftAttemptSample[],
  threshold: number,
): DriftVerdict {
  const sampleAttempts = attempts.length;
  let sampleItems = 0;
  let weightedErrorSum = 0;

  for (const attempt of attempts) {
    const weight = Math.max(attempt.itemsFound, 1);
    sampleItems += weight;
    weightedErrorSum +=
      weight * (attempt.emptyFieldRate + attempt.malformedFieldRate);
  }

  if (sampleAttempts < MIN_ATTEMPTS || sampleItems < MIN_ITEMS) {
    return {
      status: 'INSUFFICIENT_DATA',
      threshold,
      combinedRate: null,
      sampleAttempts,
      sampleItems,
    };
  }

  const combinedRate = weightedErrorSum / sampleItems;

  return {
    status: combinedRate > threshold ? 'DRIFTED' : 'OK',
    threshold,
    combinedRate,
    sampleAttempts,
    sampleItems,
  };
}
