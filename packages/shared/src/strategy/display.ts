export function formatStrategyType(strategyId: string): string {
  return strategyId.replaceAll(/[-_]+/g, ' ').toUpperCase();
}
