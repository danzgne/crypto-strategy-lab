export interface BaseStrategyParams {
  stopLoss?: number;
  takeProfit?: number;
}

export function resolveRiskParams(
  source: BaseStrategyParams,
  target: BaseStrategyParams,
  strategyPrefix: string,
): void {
  if (source.stopLoss !== undefined) {
    if (
      !Number.isFinite(source.stopLoss) ||
      source.stopLoss < 0 ||
      source.stopLoss >= 1
    ) {
      throw new Error(
        `${strategyPrefix} stopLoss must be finite and within [0, 1)`,
      );
    }
    target.stopLoss = source.stopLoss;
  }
  if (source.takeProfit !== undefined) {
    if (
      !Number.isFinite(source.takeProfit) ||
      source.takeProfit < 0 ||
      source.takeProfit >= 1
    ) {
      throw new Error(
        `${strategyPrefix} takeProfit must be finite and within [0, 1)`,
      );
    }
    target.takeProfit = source.takeProfit;
  }
}
