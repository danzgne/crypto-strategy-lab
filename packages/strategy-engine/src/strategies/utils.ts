export interface BaseStrategyParams {
  stopLoss?: number;
  takeProfit?: number;
}

export function resolveRiskParams(
  source: BaseStrategyParams,
  target: BaseStrategyParams,
  strategyPrefix: string
): void {
  if (source.stopLoss !== undefined) {
    if (!Number.isFinite(source.stopLoss) || source.stopLoss < 0) {
      throw new Error(`${strategyPrefix} stopLoss must be a non-negative number`);
    }
    target.stopLoss = source.stopLoss;
  }
  if (source.takeProfit !== undefined) {
    if (!Number.isFinite(source.takeProfit) || source.takeProfit < 0) {
      throw new Error(`${strategyPrefix} takeProfit must be a non-negative number`);
    }
    target.takeProfit = source.takeProfit;
  }
}
