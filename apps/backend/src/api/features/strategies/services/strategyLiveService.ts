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
}

export type StrategySignalListener = (update: StrategySignalUpdate) => void;

export interface StrategySubscription {
  unsubscribe(): Promise<void>;
}

interface ActiveStrategyState {
  strategyId: string;
  pair: Pair;
  timeframe: Timeframe;
  key: string;
  strategy: Strategy;
  candles: Candle[];
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
      state = this.createState(strategyId, pair, request.timeframe, strategy);
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
  ): ActiveStrategyState {
    return {
      strategyId,
      pair,
      timeframe,
      key: strategyKey(strategyId, pair, timeframe),
      strategy,
      candles: [],
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
      limit: state.strategy.requiredHistory,
    };
    const subscription = await this.marketDataService.subscribe(query, {
      onCandle: (candle) => this.recordClosedCandle(state, candle),
    });
    state.marketSubscription = subscription;
    state.candles = mergeCandles(
      state.candles,
      subscription.candles.filter((candle) => candle.isClosed),
      state.strategy.requiredHistory,
    );
    state.ready = true;

    const pendingOpenTimes = [...state.pendingClosedOpenTimes].sort(
      (left, right) => left - right,
    );
    state.pendingClosedOpenTimes.clear();
    for (const openTime of pendingOpenTimes) {
      this.evaluateClosedCandle(state, openTime);
    }
  }

  private recordClosedCandle(state: ActiveStrategyState, candle: Candle): void {
    if (!candle.isClosed) return;
    state.candles = mergeCandles(
      state.candles,
      [candle],
      state.strategy.requiredHistory,
    );
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
  ): void {
    if (state.evaluatedOpenTimes.has(openTime)) return;
    const candle = state.candles.find(
      (candidate) => candidate.openTime === openTime,
    );
    if (candle === undefined) return;

    const context: StrategyContext = {
      candles: state.candles.slice(-state.strategy.requiredHistory),
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
    for (const listener of state.listeners) listener(update);
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
