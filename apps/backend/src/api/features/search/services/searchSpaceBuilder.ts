import type {
  EnabledStrategyDescriptor,
  Pair,
  SearchSpace,
  StrategySearchParamDomain,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import { StrategyRegistry } from '@crypto-strategy-lab/strategy-engine';

export interface BuildSearchSpaceOptions {
  pair: Pair;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  enabledStrategyIds?: readonly string[];
  paramDomains?: Readonly<
    Record<string, Readonly<Record<string, StrategySearchParamDomain>>>
  >;
  permittedCombinationModes?: readonly ('majority' | 'weighted')[];
  initialInvestment?: string;
  transactionCost?: string;
  slippage?: string;
}

export function assertSearchSpaceBacktestable(searchSpace: SearchSpace): void {
  const liveOnlyIds = searchSpace.enabledStrategies
    .filter((descriptor) => StrategyRegistry.get(descriptor.id)?.liveOnly)
    .map((descriptor) => descriptor.id);

  if (liveOnlyIds.length > 0) {
    throw new Error(
      `Live-only strategies cannot be used in historical search: ${liveOnlyIds.join(', ')}`,
    );
  }
}

export function buildSearchSpace(
  options: BuildSearchSpaceOptions,
): SearchSpace {
  const allIds = StrategyRegistry.list();
  const selectedIds =
    options.enabledStrategyIds ??
    allIds.filter((id) => StrategyRegistry.get(id)?.liveOnly !== true);

  const enabledStrategies: EnabledStrategyDescriptor[] = [];

  for (const id of selectedIds) {
    const factory = StrategyRegistry.get(id);
    if (!factory) continue;

    const schema = factory.paramsSchema;
    const customDomains = options.paramDomains?.[id];

    enabledStrategies.push({
      id,
      paramDomains: customDomains,
      paramsSchema: schema,
      timeframe: options.timeframe,
    });
  }

  const searchSpace: SearchSpace = {
    enabledStrategies,
    endTime: options.endTime,
    initialInvestment: options.initialInvestment ?? '10000',
    pair: options.pair,
    permittedCombinationModes: options.permittedCombinationModes ?? [
      'majority',
      'weighted',
    ],
    slippage: options.slippage ?? '5',
    startTime: options.startTime,
    timeframe: options.timeframe,
    transactionCost: options.transactionCost ?? '0.0008',
  };

  assertSearchSpaceBacktestable(searchSpace);
  return searchSpace;
}
