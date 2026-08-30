export function canonicalStrategyVersionId(
  strategyId: string,
  params: unknown,
): string {
  return `${canonicalizeValue(strategyId)}:${canonicalizeValue(params)}`;
}

export function canonicalizeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeValue(entry)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) => `${JSON.stringify(key)}:${canonicalizeValue(entry)}`,
      )
      .join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return JSON.stringify(String(value));
  }
  return JSON.stringify(value) ?? 'undefined';
}
