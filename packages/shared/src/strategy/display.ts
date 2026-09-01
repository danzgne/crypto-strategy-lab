export function formatStrategyType(strategyId: string): string {
  const knownLabel = KNOWN_STRATEGY_LABELS[strategyId.toLowerCase()];
  if (knownLabel !== undefined) return knownLabel;
  return strategyId.replaceAll(/[-_]+/g, ' ').toUpperCase();
}

export interface StrategyDisplay {
  name: string;
  members: { strategyId: string; label: string }[];
}

export function formatStrategyDisplay(
  strategyKind: 'singular' | 'composite',
  params: unknown,
  fallback: string,
): StrategyDisplay {
  if (strategyKind === 'singular') {
    return { members: [], name: fallback };
  }
  return formatCompositeStrategyDisplay(params, fallback);
}

export function formatCompositeStrategyDisplay(
  params: unknown,
  fallback = 'Composite Strategy',
): StrategyDisplay {
  const members =
    isRecord(params) && Array.isArray(params.members)
      ? params.members.flatMap((member) => {
          if (!isRecord(member) || typeof member.strategyId !== 'string') {
            return [];
          }
          return [
            {
              label: formatStrategyType(member.strategyId),
              strategyId: member.strategyId,
            },
          ];
        })
      : [];

  return {
    members,
    name:
      members.length > 0
        ? members.map(({ label }) => label).join(' + ')
        : fallback,
  };
}

const KNOWN_STRATEGY_LABELS: Readonly<Record<string, string>> = {
  bb: 'Bollinger',
  bollinger: 'Bollinger',
  'bollinger-bands': 'Bollinger',
  ma: 'MA',
  macd: 'MACD',
  rsi: 'RSI',
  sr: 'S/R',
  'support-resistance': 'S/R',
  wyckoff: 'Wyckoff',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
