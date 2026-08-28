import { simpleMovingAverage } from './simpleMovingAverage';

export function calculateBollingerBands(
  closes: number[],
  period: number,
  stdDevMultiplier: number,
): { upper: number; lower: number; middle: number } | undefined {
  if (closes.length < period || period <= 0) {
    return undefined;
  }

  const periodCloses = closes.slice(-period);
  const middle = simpleMovingAverage(periodCloses, period);

  if (middle === undefined) {
    return undefined;
  }

  let varianceSum = 0;
  for (const close of periodCloses) {
    varianceSum += Math.pow(close - middle, 2);
  }
  const variance = varianceSum / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: middle + stdDev * stdDevMultiplier,
    lower: middle - stdDev * stdDevMultiplier,
    middle,
  };
}
