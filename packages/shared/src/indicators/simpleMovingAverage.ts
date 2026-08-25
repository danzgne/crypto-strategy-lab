export function simpleMovingAverage(
  values: readonly number[],
  period: number,
): number | undefined {
  if (period <= 0 || values.length < period) return undefined;

  const window = values.slice(-period);
  const sum = window.reduce((total, value) => total + value, 0);
  return sum / period;
}
