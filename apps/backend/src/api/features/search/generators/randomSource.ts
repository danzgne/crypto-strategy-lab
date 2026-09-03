import { randomInt } from 'node:crypto';
import type { RandomSource } from '@crypto-strategy-lab/shared';

const MAX_SIGNED_INT32 = 0x7fffffff;

export function createSearchRunSeed(): number {
  return randomInt(0, MAX_SIGNED_INT32);
}

// Murmur3-style finalizer mix, so each ordinal draws from its own independent deterministic stream.
export function deriveOrdinalSeed(seed: number, ordinal: number): number {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (ordinal >>> 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class MathRandomSource implements RandomSource {
  public random(): number {
    return Math.random();
  }
}

/**
 * Deterministic 32-bit Mulberry32 PRNG.
 * Produces identical floating-point values in [0, 1) for a given seed.
 */
export class SeededRandomSource implements RandomSource {
  private state: number;

  public constructor(seed: number = 1337) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 1;
    }
  }

  public random(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }
}
