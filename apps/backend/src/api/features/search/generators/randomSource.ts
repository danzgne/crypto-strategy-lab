import type { RandomSource } from '@crypto-strategy-lab/shared';

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
