import type {
  Candle,
  CandleQuery,
  DomainEventEnvelope,
  DomainEventName,
  Pair,
  StrategyContext,
  StrategySignalUpdate,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import { marketKey } from '@crypto-strategy-lab/shared';
import {
  StrategyRegistry,
  type Strategy,
} from '@crypto-strategy-lab/strategy-engine';
import {
  DEFAULT_CANDLE_LIMIT,
  MAX_CANDLE_LIMIT,
  normalizeCandleLimit,
} from '@crypto-strategy-lab/shared/market-data';

import type {
  MarketDataService,
  MarketDataSubscription,
} from '../../marketData/application/services/marketDataService';

const EMPTY_SENTIMENT = {
  positive: 0,
  neutral: 0,
  negative: 0,
  score: 0,
  sampleSize: 0,
} as const;

export interface StrategyDomainEventBus {
  subscribe<TName extends DomainEventName>(
    name: TName,
    handler: (event: DomainEventEnvelope<TName>) => void,
  ): () => void;
}

export interface StrategySubscriptionRequest {
  strategyId: string;
  pair: Pair;
  timeframe: Timeframe;
  limit?: number;
}

export type StrategySignalListener = (update: StrategySignalUpdate) => void;

export interface StrategySubscription {
  history: StrategySignalUpdate[];
  unsubscribe(): Promise<void>;
}

interface ActiveStrategyState {
  strategyId: string;
  pair: Pair;
  timeframe: Timeframe;
  historyLimit: number;
  key: string;
  strategy: Strategy;
  candles: Candle[];
  signalHistory: StrategySignalUpdate[];
  listeners: Set<StrategySignalListener>;
  evaluatedOpenTimes: Set<number>;
  pendingClosedOpenTimes: Set<number>;
  ready: boolean;
  marketSubscription?: MarketDataSubscription;
  initialization: Promise<void>;
}

export interface StrategyLiveServiceDependencies {
  marketDataService: MarketDataService;
  eventBus: StrategyDomainEventBus;
}

export class StrategyLiveService {
  private readonly marketDataService: MarketDataService;

  private readonly activeStrategies = new Map<string, ActiveStrategyState>();

  private readonly unsubscribeFromCandleClosed: () => void;

  public constructor({
    marketDataService,
    eventBus,
  }: StrategyLiveServiceDependencies) {
    this.marketDataService = marketDataService;
    this.unsubscribeFromCandleClosed = eventBus.subscribe(
      'CandleClosed',
      (event) => this.handleCandleClosed(event),
    );
  }

  public async subscribe(
    request: StrategySubscriptionRequest,
    listener: StrategySignalListener,
  ): Promise<StrategySubscription> {
    const strategyId = request.strategyId;
    const pair = request.pair.toUpperCase();
    const key = strategyKey(strategyId, pair, request.timeframe);
    let state = this.activeStrategies.get(key);

    if (state === undefined) {
      const strategy = StrategyRegistry.create(strategyId);
      const historyLimit = Math.min(
        MAX_CANDLE_LIMIT,
        Math.max(
          strategy.requiredHistory,
          normalizeCandleLimit(request.limit ?? DEFAULT_CANDLE_LIMIT),
        ),
      );
      state = this.createState(
        strategyId,
        pair,
        request.timeframe,
        strategy,
        historyLimit,
      );
      this.activeStrategies.set(key, state);
      state.initialization = this.initializeState(state);
    }

    state.listeners.add(listener);
    try {
      await state.initialization;
    } catch (error) {
      state.listeners.delete(listener);
      if (this.activeStrategies.get(key) === state) {
        this.activeStrategies.delete(key);
      }
      throw error;
    }

    let active = true;
    return {
      history: state.signalHistory.slice(),
      unsubscribe: async () => {
        if (!active) return;
        active = false;
        state?.listeners.delete(listener);
        if (state?.listeners.size !== 0) return;
        if (this.activeStrategies.get(key) === state) {
          this.activeStrategies.delete(key);
        }
        await state?.marketSubscription?.unsubscribe();
      },
    };
  }

  public async close(): Promise<void> {
    this.unsubscribeFromCandleClosed();
    const states = [...this.activeStrategies.values()];
    this.activeStrategies.clear();
    await Promise.all(
      states.map((state) => state.marketSubscription?.unsubscribe()),
    );
  }

  private createState(
    strategyId: string,
    pair: Pair,
    timeframe: Timeframe,
    strategy: Strategy,
    historyLimit: number,
  ): ActiveStrategyState {
    return {
      strategyId,
      pair,
      timeframe,
      historyLimit,
      key: strategyKey(strategyId, pair, timeframe),
      strategy,
      candles: [],
      signalHistory: [],
      listeners: new Set(),
      evaluatedOpenTimes: new Set(),
      pendingClosedOpenTimes: new Set(),
      ready: false,
      initialization: Promise.resolve(),
    };
  }

  private async initializeState(state: ActiveStrategyState): Promise<void> {
    const query: CandleQuery = {
      pair: state.pair,
      timeframe: state.timeframe,
      limit: state.historyLimit,
    };
    const subscription = await this.marketDataService.subscribe(query, {
      onCandle: (candle) => this.recordClosedCandle(state, candle),
    });
    state.marketSubscription = subscription;
    const initialCandles = await this.loadInitialCandles(
      state,
      subscription.candles.filter((candle) => candle.isClosed),
    );
    state.candles = mergeCandles([], initialCandles, state.historyLimit);
    state.ready = true;

    for (const candle of state.candles) {
      if (candle.isClosed) {
        this.evaluateClosedCandle(state, candle.openTime, false);
      }
    }

    const pendingOpenTimes = [...state.pendingClosedOpenTimes].sort(
      (left, right) => left - right,
    );
    state.pendingClosedOpenTimes.clear();
    for (const openTime of pendingOpenTimes) {
      this.evaluateClosedCandle(state, openTime);
    }
  }

  private async loadInitialCandles(
    state: ActiveStrategyState,
    initialCandles: Candle[],
  ): Promise<Candle[]> {
    let candles = mergeCandles([], initialCandles, state.historyLimit);
    while (candles.length > 0 && candles.length < state.historyLimit) {
      const oldestCandle = candles.at(0);
      if (oldestCandle === undefined) break;
      const olderCandles = await this.marketDataService.loadHistoryBefore(
        {
          pair: state.pair,
          timeframe: state.timeframe,
          limit: state.historyLimit,
        },
        oldestCandle.openTime,
      );
      if (olderCandles.length === 0) break;
      const nextCandles = mergeCandles(
        candles,
        olderCandles,
        state.historyLimit,
      );
      if (nextCandles.length === candles.length) break;
      candles = nextCandles;
      if (olderCandles.length < state.historyLimit) break;
    }
    return candles;
  }

  private recordClosedCandle(state: ActiveStrategyState, candle: Candle): void {
    if (!candle.isClosed) return;
    state.candles = mergeCandles(state.candles, [candle], state.historyLimit);
  }

  private handleCandleClosed(event: DomainEventEnvelope<'CandleClosed'>): void {
    const { timeframe, openTime } = event.payload;
    const pair = event.payload.pair.toUpperCase();
    for (const state of this.activeStrategies.values()) {
      if (state.pair !== pair || state.timeframe !== timeframe) continue;
      if (!state.ready) {
        state.pendingClosedOpenTimes.add(openTime);
        continue;
      }
      this.evaluateClosedCandle(state, openTime);
    }
  }

  private evaluateClosedCandle(
    state: ActiveStrategyState,
    openTime: number,
    notifyListeners = true,
  ): StrategySignalUpdate | undefined {
    if (state.evaluatedOpenTimes.has(openTime)) return;
    const candleIndex = state.candles.findIndex(
      (candidate) => candidate.openTime === openTime,
    );
    if (candleIndex < 0) return;
    const candle = state.candles[candleIndex];
    if (candle === undefined) return;

    const context: StrategyContext = {
      candles: state.candles
        .slice(0, candleIndex + 1)
        .slice(-state.strategy.requiredHistory),
      pair: state.pair,
      timeframe: state.timeframe,
      sentiment: EMPTY_SENTIMENT,
    };
    const signal = state.strategy.analyze(context);
    state.evaluatedOpenTimes.add(openTime);
    const update: StrategySignalUpdate = {
      pair: state.pair,
      timeframe: state.timeframe,
      candle,
      indicators: signal.indicators ?? {},
      signal,
    };
    state.signalHistory = upsertSignalHistory(
      state.signalHistory,
      update,
      Math.min(MAX_CANDLE_LIMIT, state.historyLimit),
    );
    if (notifyListeners) {
      for (const listener of state.listeners) listener(update);
    }
    return update;
  }
}

function strategyKey(
  strategyId: string,
  pair: Pair,
  timeframe: Timeframe,
): string {
  return `${strategyId}:${marketKey({ pair, timeframe })}`;
}

function mergeCandles(
  current: Candle[],
  additions: Candle[],
  limit: number,
): Candle[] {
  const byOpenTime = new Map(
    current.map((candle) => [candle.openTime, candle]),
  );
  for (const candle of additions) byOpenTime.set(candle.openTime, candle);
  return [...byOpenTime.values()]
    .sort((left, right) => left.openTime - right.openTime)
    .slice(-limit);
}

function upsertSignalHistory(
  history: StrategySignalUpdate[],
  update: StrategySignalUpdate,
  limit: number,
): StrategySignalUpdate[] {
  const byOpenTime = new Map(
    history.map((signal) => [signal.candle.openTime, signal]),
  );
  byOpenTime.set(update.candle.openTime, update);
  return [...byOpenTime.values()]
    .sort((left, right) => left.candle.openTime - right.candle.openTime)
    .slice(-Math.max(1, limit));
}
