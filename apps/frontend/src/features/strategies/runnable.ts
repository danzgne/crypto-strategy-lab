import type {
  CompositeStrategyRequest,
  LibraryBuiltin,
  LibraryEntry,
  StrategyParamsSchema,
} from '@crypto-strategy-lab/shared';
import { formatStrategyType } from '@crypto-strategy-lab/shared/strategy';

export interface RunnableOption {
  value: string;
  label: string;
  strategyId: string;
  paramsSchema?: StrategyParamsSchema;
  params?: Record<string, unknown>;
  composite?: CompositeStrategyRequest;
  strategyVersionId?: string;
}

export function builtinRunOption(builtin: LibraryBuiltin): RunnableOption {
  return {
    value: `builtin:${builtin.strategyId}`,
    label: formatStrategyType(builtin.strategyId),
    strategyId: builtin.strategyId,
    paramsSchema: builtin.paramsSchema,
  };
}

export function entryRunOption(entry: LibraryEntry): RunnableOption {
  const label = `Saved · ${entry.name}`;
  if (entry.kind === 'composite') {
    return {
      value: `entry:${entry.id}`,
      label,
      strategyId: 'composite',
      ...(entry.latestVersion.composite === undefined
        ? {}
        : { composite: entry.latestVersion.composite }),
      strategyVersionId: entry.latestVersion.id,
    };
  }
  return {
    value: `entry:${entry.id}`,
    label,
    strategyId: entry.strategyId,
    params: entry.latestVersion.params ?? {},
    strategyVersionId: entry.latestVersion.id,
  };
}

export function runnableEntries(
  builtins: readonly LibraryBuiltin[],
  entries: readonly LibraryEntry[],
): RunnableOption[] {
  return [
    ...builtins.map(builtinRunOption),
    ...entries.filter((entry) => entry.archivedAt === null).map(entryRunOption),
  ];
}
