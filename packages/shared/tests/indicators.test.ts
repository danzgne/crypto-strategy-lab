import { describe, expect, it } from 'vitest';
import { calculateBollingerBands, calculateRSI, simpleMovingAverage } from '../src/indicators';

describe('Indicators', () => {
  describe('simpleMovingAverage', () => {
    it('calculates correctly', () => {
      expect(simpleMovingAverage([1, 2, 3, 4, 5], 3)).toBe(4);
    });
  });

  describe('calculateRSI', () => {
    it('returns undefined if not enough data', () => {
      expect(calculateRSI([100], 14)).toBeUndefined();
    });

    it('calculates RSI correctly', () => {
      const closes = [
        44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
        45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28
      ];
      const rsi = calculateRSI(closes, 14);
      expect(rsi).toBeCloseTo(70.46, 1);
    });
  });

  describe('calculateBollingerBands', () => {
    it('returns undefined if not enough data', () => {
      expect(calculateBollingerBands([100], 20, 2)).toBeUndefined();
    });

    it('calculates BB correctly', () => {
      const closes = [10, 10, 10, 10, 10];
      const bb = calculateBollingerBands(closes, 5, 2);
      expect(bb?.middle).toBe(10);
      expect(bb?.upper).toBe(10);
      expect(bb?.lower).toBe(10);
      
      const closes2 = [2, 4, 4, 4, 5, 5, 7, 9];
      const bb2 = calculateBollingerBands(closes2, 4, 2);
      expect(bb2?.middle).toBe(6.5);
      expect(bb2?.upper).toBeCloseTo(9.816, 2);
      expect(bb2?.lower).toBeCloseTo(3.183, 2);
    });
  });
});
