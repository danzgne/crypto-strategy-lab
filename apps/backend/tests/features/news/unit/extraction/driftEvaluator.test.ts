import { describe, it, expect } from 'vitest';
import { evaluateDrift } from '@/api/features/news/services/extraction/driftEvaluator';

const THRESHOLD = 0.1;

describe('evaluateDrift', () => {
  it('reports insufficient data with fewer than 3 attempts', () => {
    const verdict = evaluateDrift(
      [
        { itemsFound: 10, emptyFieldRate: 0.5, malformedFieldRate: 0 },
        { itemsFound: 10, emptyFieldRate: 0.5, malformedFieldRate: 0 },
      ],
      THRESHOLD,
    );
    expect(verdict.status).toBe('INSUFFICIENT_DATA');
    expect(verdict.combinedRate).toBeNull();
  });

  it('reports insufficient data with 3+ attempts but fewer than 10 items', () => {
    const verdict = evaluateDrift(
      [
        { itemsFound: 2, emptyFieldRate: 1, malformedFieldRate: 0 },
        { itemsFound: 2, emptyFieldRate: 1, malformedFieldRate: 0 },
        { itemsFound: 2, emptyFieldRate: 1, malformedFieldRate: 0 },
      ],
      THRESHOLD,
    );
    expect(verdict.status).toBe('INSUFFICIENT_DATA');
    expect(verdict.sampleAttempts).toBe(3);
    expect(verdict.sampleItems).toBe(6);
  });

  it('does not fire when the combined rate is at or under the threshold', () => {
    const verdict = evaluateDrift(
      [
        { itemsFound: 10, emptyFieldRate: 0.03, malformedFieldRate: 0.02 },
        { itemsFound: 10, emptyFieldRate: 0.03, malformedFieldRate: 0.02 },
        { itemsFound: 10, emptyFieldRate: 0.03, malformedFieldRate: 0.02 },
      ],
      THRESHOLD,
    );
    expect(verdict.status).toBe('OK');
    expect(verdict.combinedRate).toBeCloseTo(0.05);
  });

  it('fires when the combined error rate crosses the threshold', () => {
    const verdict = evaluateDrift(
      [
        { itemsFound: 10, emptyFieldRate: 0.09, malformedFieldRate: 0.05 },
        { itemsFound: 10, emptyFieldRate: 0.09, malformedFieldRate: 0.05 },
        { itemsFound: 10, emptyFieldRate: 0.09, malformedFieldRate: 0.05 },
      ],
      THRESHOLD,
    );
    expect(verdict.status).toBe('DRIFTED');
    expect(verdict.combinedRate).toBeCloseTo(0.14);
  });

  it('treats a combined rate exactly at the threshold as not drifted', () => {
    const verdict = evaluateDrift(
      [
        { itemsFound: 10, emptyFieldRate: 0.1, malformedFieldRate: 0 },
        { itemsFound: 10, emptyFieldRate: 0.1, malformedFieldRate: 0 },
        { itemsFound: 10, emptyFieldRate: 0.1, malformedFieldRate: 0 },
      ],
      THRESHOLD,
    );
    expect(verdict.status).toBe('OK');
  });

  it('weights an attempt whose selector matched zero items as one fully-empty sample, not as absent evidence', () => {
    const verdict = evaluateDrift(
      [
        { itemsFound: 0, emptyFieldRate: 1, malformedFieldRate: 0 },
        { itemsFound: 0, emptyFieldRate: 1, malformedFieldRate: 0 },
        { itemsFound: 0, emptyFieldRate: 1, malformedFieldRate: 0 },
        { itemsFound: 0, emptyFieldRate: 1, malformedFieldRate: 0 },
        { itemsFound: 0, emptyFieldRate: 1, malformedFieldRate: 0 },
        { itemsFound: 0, emptyFieldRate: 1, malformedFieldRate: 0 },
        { itemsFound: 0, emptyFieldRate: 1, malformedFieldRate: 0 },
        { itemsFound: 0, emptyFieldRate: 1, malformedFieldRate: 0 },
        { itemsFound: 0, emptyFieldRate: 1, malformedFieldRate: 0 },
        { itemsFound: 0, emptyFieldRate: 1, malformedFieldRate: 0 },
      ],
      THRESHOLD,
    );
    expect(verdict.status).toBe('DRIFTED');
    expect(verdict.sampleItems).toBe(10);
    expect(verdict.combinedRate).toBeCloseTo(1);
  });

  it('item-weights the combined rate across attempts of different sizes', () => {
    const verdict = evaluateDrift(
      [
        { itemsFound: 18, emptyFieldRate: 0, malformedFieldRate: 0 },
        { itemsFound: 1, emptyFieldRate: 1, malformedFieldRate: 0 },
        { itemsFound: 1, emptyFieldRate: 1, malformedFieldRate: 0 },
      ],
      THRESHOLD,
    );
    expect(verdict.sampleItems).toBe(20);
    expect(verdict.combinedRate).toBeCloseTo(0.1);
    expect(verdict.status).toBe('OK');
  });
});
