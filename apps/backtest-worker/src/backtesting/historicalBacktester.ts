import type {
  Candle,
  SignalAction,
  StrategyContext,
} from '@crypto-strategy-lab/shared';
import { TIMEFRAME_INTERVAL_MS } from '@crypto-strategy-lab/shared';
import type {
  SimulatedTrade,
  TradeDirection,
} from '@crypto-strategy-lab/shared/backtest';
import type { Strategy } from '@crypto-strategy-lab/strategy-engine';

import type { BacktestInput, BacktestSimulation, Backtester } from './types';

const EMPTY_SENTIMENT = {
  negative: 0,
  neutral: 0,
  positive: 0,
  sampleSize: 0,
  score: 0,
} as const;

interface Position {
  direction: TradeDirection;
  entryTime: number;
  investment: number;
  quantity: number;
  rawEntryPrice: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  entryTransactionCost: number;
  entrySlippage: number;
}

interface ExitInstruction {
  basePrice: number;
  reason: SimulatedTrade['exitReason'];
}

export class HistoricalBacktester implements Backtester {
  public run(input: BacktestInput): BacktestSimulation {
    validateInput(input);
    const candles = input.candles
      .slice()
      .sort((left, right) => left.openTime - right.openTime);
    validateCandles(candles, input);

    const slippageRate = input.slippage / 10_000;
    const selectedCandles = candles.filter(
      (candle) =>
        candle.openTime >= input.startTime && candle.openTime < input.endTime,
    );
    if (selectedCandles.length === 0) {
      throw new Error('Backtest range contains no candles');
    }

    const selectedOpenTimes = new Set(
      selectedCandles.map(({ openTime }) => openTime),
    );
    const trades: SimulatedTrade[] = [];
    let equity = input.initialInvestment;
    let position: Position | null = null;
    let pendingAction: SignalAction = 'HOLD';

    for (const [index, candle] of candles.entries()) {
      const isSelected = selectedOpenTimes.has(candle.openTime);

      if (isSelected) {
        position = this.executePendingAction(
          position,
          pendingAction,
          candle,
          equity,
          input,
          slippageRate,
          trades,
        );
        equity = position?.investment ?? equity;
        if (position === null && trades.length > 0) {
          equity = equityAfterLastTrade(trades, equity);
        }
        const riskExit =
          position === null ? null : findRiskExit(position, candle);
        if (riskExit !== null && position !== null) {
          const closed = closePosition(
            position,
            candle,
            riskExit,
            input,
            slippageRate,
          );
          trades.push(closed.trade);
          equity = Math.max(0, equity + closed.trade.profit);
          position = null;
        }

        const isFinalSelectedCandle =
          candle.openTime ===
          selectedCandles[selectedCandles.length - 1]!.openTime;
        if (isFinalSelectedCandle && position !== null) {
          const closed = closePosition(
            position,
            candle,
            { basePrice: candle.close, reason: 'FINAL_CANDLE' },
            input,
            slippageRate,
            candle.closeTime,
          );
          trades.push(closed.trade);
          equity = Math.max(0, equity + closed.trade.profit);
          position = null;
        }
      }

      // Every closed candle, including warm-up candles, is analyzed exactly
      // once. A signal produced by a warm-up candle can execute at the first
      // selected candle's open, which preserves the next-open rule.
      const signal = analyzeCandle(input.strategy, candles, index, input);
      pendingAction = signal.action;

      if (index === candles.length - 1) break;
    }

    return { finalEquity: equity, trades };
  }

  private executePendingAction(
    current: Position | null,
    action: SignalAction,
    candle: Candle,
    equity: number,
    input: BacktestInput,
    slippageRate: number,
    trades: SimulatedTrade[],
  ): Position | null {
    if (action === 'HOLD' || equity <= 0) return current;
    const requestedDirection = action === 'BUY' ? 'LONG' : 'SHORT';
    if (current?.direction === requestedDirection) return current;

    let nextPosition = current;
    if (nextPosition !== null) {
      const closed = closePosition(
        nextPosition,
        candle,
        { basePrice: candle.open, reason: 'SIGNAL' },
        input,
        slippageRate,
      );
      trades.push(closed.trade);
      const nextEquity = Math.max(0, equity + closed.trade.profit);
      if (nextEquity <= 0) return null;
      nextPosition = null;
      equity = nextEquity;
    }

    return openPosition(
      requestedDirection,
      candle,
      equity,
      input.strategy,
      input,
      slippageRate,
    );
  }
}

function analyzeCandle(
  strategy: Strategy,
  candles: readonly Candle[],
  index: number,
  input: BacktestInput,
) {
  const context: StrategyContext = {
    candles:
      strategy.requiredHistory === 0
        ? []
        : candles.slice(0, index + 1).slice(-strategy.requiredHistory),
    pair: input.pair,
    timeframe: input.timeframe,
    sentiment: EMPTY_SENTIMENT,
  };
  const signal = strategy.analyze(context);
  if (
    signal.action !== 'BUY' &&
    signal.action !== 'SELL' &&
    signal.action !== 'HOLD'
  ) {
    throw new Error(
      `Strategy returned unsupported signal action: ${String(signal.action)}`,
    );
  }
  return signal;
}

function openPosition(
  direction: TradeDirection,
  candle: Candle,
  equity: number,
  strategy: Strategy,
  input: BacktestInput,
  slippageRate: number,
): Position {
  const rawEntryPrice = candle.open;
  const entryPrice = adjustEntryPrice(rawEntryPrice, direction, slippageRate);
  const quantity = equity / entryPrice;
  const risk = readRiskParams(strategy);
  const stopLoss =
    risk.stopLoss === undefined || risk.stopLoss === 0
      ? null
      : direction === 'LONG'
        ? entryPrice * (1 - risk.stopLoss)
        : entryPrice * (1 + risk.stopLoss);
  const takeProfit =
    risk.takeProfit === undefined || risk.takeProfit === 0
      ? null
      : direction === 'LONG'
        ? entryPrice * (1 + risk.takeProfit)
        : entryPrice * (1 - risk.takeProfit);
  const entryTransactionCost = entryPrice * quantity * input.transactionCost;
  const entrySlippage = Math.abs(entryPrice - rawEntryPrice) * quantity;

  return {
    direction,
    entryTime: candle.openTime,
    investment: equity,
    quantity,
    rawEntryPrice,
    entryPrice,
    stopLoss,
    takeProfit,
    entryTransactionCost,
    entrySlippage,
  };
}

function findRiskExit(
  position: Position,
  candle: Candle,
): ExitInstruction | null {
  if (position.direction === 'LONG') {
    if (position.stopLoss !== null && candle.open < position.stopLoss) {
      return { basePrice: candle.open, reason: 'STOP_LOSS' };
    }
    if (position.takeProfit !== null && candle.open > position.takeProfit) {
      return { basePrice: candle.open, reason: 'TAKE_PROFIT' };
    }
    if (position.stopLoss !== null && candle.low <= position.stopLoss) {
      return { basePrice: position.stopLoss, reason: 'STOP_LOSS' };
    }
    if (position.takeProfit !== null && candle.high >= position.takeProfit) {
      return { basePrice: position.takeProfit, reason: 'TAKE_PROFIT' };
    }
    return null;
  }

  if (position.stopLoss !== null && candle.open > position.stopLoss) {
    return { basePrice: candle.open, reason: 'STOP_LOSS' };
  }
  if (position.takeProfit !== null && candle.open < position.takeProfit) {
    return { basePrice: candle.open, reason: 'TAKE_PROFIT' };
  }
  if (position.stopLoss !== null && candle.high >= position.stopLoss) {
    return { basePrice: position.stopLoss, reason: 'STOP_LOSS' };
  }
  if (position.takeProfit !== null && candle.low <= position.takeProfit) {
    return { basePrice: position.takeProfit, reason: 'TAKE_PROFIT' };
  }
  return null;
}

function closePosition(
  position: Position,
  candle: Candle,
  instruction: ExitInstruction,
  input: BacktestInput,
  slippageRate: number,
  exitTime = candle.openTime,
): { trade: SimulatedTrade } {
  const exitPrice = adjustExitPrice(
    instruction.basePrice,
    position.direction,
    slippageRate,
  );
  const grossProfit =
    position.direction === 'LONG'
      ? (instruction.basePrice - position.rawEntryPrice) * position.quantity
      : (position.rawEntryPrice - instruction.basePrice) * position.quantity;
  const exitTransactionCost =
    exitPrice * position.quantity * input.transactionCost;
  const exitSlippage =
    Math.abs(exitPrice - instruction.basePrice) * position.quantity;
  const transactionCost = position.entryTransactionCost + exitTransactionCost;
  const slippage = position.entrySlippage + exitSlippage;
  const profit = grossProfit - transactionCost - slippage;

  return {
    trade: {
      direction: position.direction,
      entryPrice: position.entryPrice,
      entryTime: position.entryTime,
      exitPrice,
      exitReason: instruction.reason,
      exitTime,
      investment: position.investment,
      pair: input.pair,
      profit,
      slippage,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      transactionCost,
    },
  };
}

function adjustEntryPrice(
  price: number,
  direction: TradeDirection,
  slippageRate: number,
): number {
  return direction === 'LONG'
    ? price * (1 + slippageRate)
    : price * (1 - slippageRate);
}

function adjustExitPrice(
  price: number,
  direction: TradeDirection,
  slippageRate: number,
): number {
  return direction === 'LONG'
    ? price * (1 - slippageRate)
    : price * (1 + slippageRate);
}

function readRiskParams(strategy: Strategy): {
  stopLoss?: number;
  takeProfit?: number;
} {
  const candidate = strategy as Strategy & {
    stopLoss?: unknown;
    takeProfit?: unknown;
  };
  const params = isRecord(strategy.params) ? strategy.params : {};
  const stopLoss = resolveRiskValue(
    candidate.stopLoss ?? params['stopLoss'],
    'stopLoss',
  );
  const takeProfit = resolveRiskValue(
    candidate.takeProfit ?? params['takeProfit'],
    'takeProfit',
  );
  return {
    ...(stopLoss === undefined ? {} : { stopLoss }),
    ...(takeProfit === undefined ? {} : { takeProfit }),
  };
}

function resolveRiskValue(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value >= 1
  ) {
    throw new Error(`${name} must be finite and within [0, 1)`);
  }
  return value;
}

function equityAfterLastTrade(
  trades: readonly SimulatedTrade[],
  fallback: number,
): number {
  const last = trades.at(-1);
  return last === undefined
    ? fallback
    : Math.max(0, last.investment + last.profit);
}

function validateInput(input: BacktestInput): void {
  if (
    !Number.isFinite(input.initialInvestment) ||
    input.initialInvestment <= 0
  ) {
    throw new Error('Initial investment must be a finite positive number');
  }
  if (
    !Number.isFinite(input.transactionCost) ||
    input.transactionCost < 0 ||
    input.transactionCost >= 1
  ) {
    throw new Error('Transaction cost must be a finite ratio in [0, 1)');
  }
  if (
    !Number.isInteger(input.slippage) ||
    input.slippage < 0 ||
    input.slippage >= 10_000
  ) {
    throw new Error(
      'Slippage must be an integer number of basis points in [0, 10000)',
    );
  }
  const interval = TIMEFRAME_INTERVAL_MS[input.timeframe];
  if (
    !Number.isSafeInteger(input.startTime) ||
    !Number.isSafeInteger(input.endTime) ||
    input.startTime < 0 ||
    input.endTime <= input.startTime ||
    input.startTime % interval !== 0 ||
    input.endTime % interval !== 0
  ) {
    throw new Error('Backtest range must have a finite end after its start');
  }
  if (
    !Number.isInteger(input.strategy.requiredHistory) ||
    input.strategy.requiredHistory < 0
  ) {
    throw new Error('Strategy requiredHistory must be a non-negative integer');
  }
}

function validateCandles(
  candles: readonly Candle[],
  input: BacktestInput,
): void {
  if (candles.length === 0)
    throw new Error('Backtest requires historical candles');
  for (const [index, candle] of candles.entries()) {
    if (
      candle.pair !== input.pair ||
      candle.timeframe !== input.timeframe ||
      !candle.isClosed ||
      !Number.isFinite(candle.open) ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      !Number.isFinite(candle.close) ||
      !Number.isFinite(candle.volume) ||
      candle.open <= 0 ||
      candle.high <= 0 ||
      candle.low <= 0 ||
      candle.close <= 0
    ) {
      throw new Error(
        'Backtest candles must be closed and match the requested market',
      );
    }
    const previous = candles[index - 1];
    if (previous !== undefined) {
      if (candle.openTime <= previous.openTime) {
        throw new Error('Backtest candles must be strictly ordered');
      }
      if (
        candle.openTime - previous.openTime !==
        TIMEFRAME_INTERVAL_MS[input.timeframe]
      ) {
        throw new Error('Backtest candles must be contiguous');
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
