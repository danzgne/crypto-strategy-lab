import type { StrategyParamsSchema } from '@crypto-strategy-lab/shared';

export function createDefaultParameterValues(
  schema: StrategyParamsSchema,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(schema.properties).map(([name, parameter]) => [
      name,
      parameter.default === undefined ? '' : String(parameter.default),
    ]),
  );
}

export function resolveParameters(
  values: Readonly<Record<string, string>>,
  schema: StrategyParamsSchema | undefined,
): Record<string, number | string> | null {
  if (schema === undefined) return {};
  const resolved: Record<string, number | string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (value.trim().length === 0) continue;
    const definition = schema.properties[name];
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
