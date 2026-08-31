import { createHash } from 'node:crypto';

export function computeStrategyVersionTag(
  strategyId: string,
  resolvedParams: unknown,
): string {
  const canonical = `${JSON.stringify(strategyId)}:${canonicalize(resolvedParams)}`;
  return createHash('sha256').update(canonical).digest('hex');
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${canonicalize(entryValue)}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
