import { describe, expect, it } from 'vitest';

import { computeCandidateFingerprint } from '@/api/features/search/services/fingerprint';

describe('computeCandidateFingerprint', () => {
  it('computes identical fingerprint regardless of parameter key order', () => {
    const hash1 = computeCandidateFingerprint(
      ['ma'],
      [{ fast: 20, slow: 50 }],
      null,
    );
    const hash2 = computeCandidateFingerprint(
      ['ma'],
      [{ slow: 50, fast: 20 }],
      null,
    );
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('computes different fingerprints for different parameter values', () => {
    const hash1 = computeCandidateFingerprint(
      ['ma'],
      [{ fast: 20, slow: 50 }],
      null,
    );
    const hash2 = computeCandidateFingerprint(
      ['ma'],
      [{ fast: 10, slow: 50 }],
      null,
    );
    expect(hash1).not.toBe(hash2);
  });

  it('includes combinationConfig in the fingerprint calculation', () => {
    const single = computeCandidateFingerprint(
      ['ma', 'rsi'],
      [{ fast: 20 }, { period: 14 }],
      { mode: 'majority' },
    );
    const weighted = computeCandidateFingerprint(
      ['ma', 'rsi'],
      [{ fast: 20 }, { period: 14 }],
      { mode: 'weighted', threshold: 0.3, weights: [0.5, 0.5] },
    );
    expect(single).not.toBe(weighted);
  });
});
