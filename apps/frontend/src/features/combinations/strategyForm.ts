import type {
  StrategyCatalog,
  StrategyCatalogEntry,
} from '@crypto-strategy-lab/shared';
import { canonicalStrategyVersionId } from '@crypto-strategy-lab/shared/strategy';

export function catalogEntries(
  catalog: StrategyCatalog,
): StrategyCatalogEntry[] {
  const strategies = catalog.strategies;
  if (strategies !== undefined && strategies.length > 0) return strategies;
  return (catalog.strategyIds ?? []).map((id) => ({
    id,
    paramsSchema: { type: 'object', properties: {} },
  }));
}

export function createDefaultParameterValues(
  entry: StrategyCatalogEntry,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entry.paramsSchema.properties).map(([name, parameter]) => [
      name,
      parameter.default === undefined ? '' : String(parameter.default),
    ]),
  );
}

export function resolveParameters(
  values: Readonly<Record<string, string>>,
  entry: StrategyCatalogEntry | undefined,
): Record<string, number | string> | null {
  if (entry === undefined) return {};
  const resolved: Record<string, number | string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (value.trim().length === 0) continue;
    const definition = entry.paramsSchema.properties[name];
    if (definition === undefined) continue;
    if (definition.type === 'integer' || definition.type === 'number') {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return null;
      if (definition.type === 'integer' && !Number.isInteger(numericValue)) {
        return null;
      }
      if (
        definition.minimum !== undefined &&
        numericValue < definition.minimum
      ) {
        return null;
      }
      if (
        definition.maximum !== undefined &&
        numericValue > definition.maximum
      ) {
        return null;
      }
      resolved[name] = numericValue;
    } else {
      resolved[name] = value;
    }
  }
  return resolved;
}

export function strategyVersionKey(
  strategyId: string,
  params: Readonly<Record<string, number | string>>,
  entry: StrategyCatalogEntry | undefined,
): string {
  const effectiveParams: Record<string, number | string> = {};
  for (const [name, parameter] of Object.entries(
    entry?.paramsSchema.properties ?? {},
  )) {
    const value = params[name];
    if (value !== undefined) {
      effectiveParams[name] = value;
    } else if (parameter.default !== undefined) {
      effectiveParams[name] = parameter.default;
    }
  }
  return canonicalStrategyVersionId(strategyId, effectiveParams);
}
