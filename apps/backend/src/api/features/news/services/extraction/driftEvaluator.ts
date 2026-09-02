import type { DriftVerdict } from '@crypto-strategy-lab/shared';

export interface DriftAttemptSample {
  itemsFound: number;
  emptyFieldRate: number;
  malformedFieldRate: number;
}

const MIN_ATTEMPTS = 3;
const MIN_ITEMS = 10;

/**
 * Pure decision function: given the validation metrics of every attempt that has
 * applied the currently ACTIVE template version since it was activated, decides
 * whether drift has crossed the threshold. Never fetches, never persists.
 *
 * An attempt whose item-container selector matched zero nodes still counts as one
 * fully-empty sample (weight 1, not 0) toward both the item-weighted mean and the
 * minimum-sample gate below, so a total-match failure cannot hide behind a "no
 * sample yet" reading and stall out the minimum-item requirement forever.
 */
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
