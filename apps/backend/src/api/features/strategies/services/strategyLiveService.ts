import type {
  Candle,
  CandleQuery,
  CompositeStrategyRequest,
  DomainEventEnvelope,
  DomainEventName,
  Pair,
  SentimentAggregate,
  StrategyContext,
  StrategySignalUpdate,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import { marketKey } from '@crypto-strategy-lab/shared';
import {
  assertStrategyApplicable,
  CombinationEngine,
  StrategyRegistry,
  strategyVersionIdentity,
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
import type { AppLogger } from '@/utils/logger';

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
    handler: (event: DomainEventEnvelope<TName>) => void | Promise<void>,
  ): () => void;
}

export interface StrategySubscriptionRequest {
  strategyId: string;
  pair: Pair;
  timeframe: Timeframe;
  limit?: number;
  params?: unknown;
  composite?: CompositeStrategyRequest;
}

export type StrategySignalListener = (update: StrategySignalUpdate) => void;

export type StrategyErrorListener = (error: Error) => void;

export interface StrategySubscription {
  history: StrategySignalUpdate[];
  unsubscribe(): Promise<void>;
}

export interface SentimentAggregateReader {
  getAggregate(pair: Pair): Promise<SentimentAggregate>;
}

interface ActiveStrategyState {
  strategyId: string;
  pair: Pair;
  timeframe: Timeframe;
  historyLimit: number;
  key: string;
  versionId: string;
  strategy: Strategy;
  candles: Candle[];
  signalHistory: StrategySignalUpdate[];
  listeners: Set<StrategySignalListener>;
  evaluatedOpenTimes: Set<number>;
  pendingClosedOpenTimes: Set<number>;
  errorListeners: Set<StrategyErrorListener>;
  ready: boolean;
  sentiment: SentimentAggregate;
  marketSubscription?: MarketDataSubscription;
  initialization: Promise<void>;
}

export interface StrategyLiveServiceDependencies {
  marketDataService: MarketDataService;
  eventBus: StrategyDomainEventBus;
  combinationEngine?: CombinationEngine;
  sentimentAggregateReader?: SentimentAggregateReader;
  logger?: AppLogger;
}

export class StrategyLiveService {
  private readonly marketDataService: MarketDataService;

  private readonly combinationEngine: CombinationEngine;

  private readonly sentimentAggregateReader:
    SentimentAggregateReader | undefined;

  private readonly logger: AppLogger | undefined;

  private sentimentRefreshPromise: Promise<void> | undefined;

  private readonly activeStrategies = new Map<string, ActiveStrategyState>();

  private readonly unsubscribeFromCandleClosed: () => void;

  private readonly unsubscribeFromSentimentAnalyzed: () => void;

  public constructor({
    marketDataService,
    eventBus,
    combinationEngine = new CombinationEngine(),
    sentimentAggregateReader,
    logger,
  }: StrategyLiveServiceDependencies) {
    this.marketDataService = marketDataService;
    this.combinationEngine = combinationEngine;
    this.sentimentAggregateReader = sentimentAggregateReader;
    this.logger = logger;
    this.unsubscribeFromCandleClosed = eventBus.subscribe(
      'CandleClosed',
      (event) => this.handleCandleClosed(event),
    );
    this.unsubscribeFromSentimentAnalyzed = eventBus.subscribe(
      'SentimentAnalyzed',
      () => this.refreshActiveSentiment(),
    );
  }

  public async subscribe(
    request: StrategySubscriptionRequest,
    listener: StrategySignalListener,
    errorListener?: StrategyErrorListener,
  ): Promise<StrategySubscription> {
    const strategyId = request.strategyId;
    const pair = request.pair.toUpperCase();
    const { strategy, versionId } = this.createStrategy(
      request,
      pair,
      request.timeframe,
    );
    const key = strategyKey(strategyId, versionId, pair, request.timeframe);
    let state = this.activeStrategies.get(key);

    if (state === undefined) {
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
        versionId,
      );
      this.activeStrategies.set(key, state);
      state.initialization = this.initializeState(state);
    }

    state.listeners.add(listener);
    if (errorListener !== undefined) state.errorListeners.add(errorListener);
    try {
      await state.initialization;
    } catch (error) {
      state.listeners.delete(listener);
      if (errorListener !== undefined) {
        state.errorListeners.delete(errorListener);
      }
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
        if (errorListener !== undefined) {
          state?.errorListeners.delete(errorListener);
        }
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
    this.unsubscribeFromSentimentAnalyzed();
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
    versionId: string,
  ): ActiveStrategyState {
    return {
      strategyId,
      pair,
      timeframe,
      historyLimit,
      key: strategyKey(strategyId, versionId, pair, timeframe),
      versionId,
      strategy,
      candles: [],
      signalHistory: [],
      listeners: new Set(),
      evaluatedOpenTimes: new Set(),
      pendingClosedOpenTimes: new Set(),
      errorListeners: new Set(),
      ready: false,
      sentiment: EMPTY_SENTIMENT,
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
    await this.refreshStateSentiment(state);
    state.ready = true;

    for (const candle of state.candles) {
      if (candle.isClosed) {
        this.evaluateClosedCandleSafely(state, candle.openTime, false);
      }
    }

    const pendingOpenTimes = [...state.pendingClosedOpenTimes].sort(
      (left, right) => left - right,
    );
    state.pendingClosedOpenTimes.clear();
    for (const openTime of pendingOpenTimes) {
      this.evaluateClosedCandleSafely(state, openTime);
    }
  }

  private evaluateClosedCandleSafely(
    state: ActiveStrategyState,
    openTime: number,
    notifyListeners = true,
    allowReevaluation = false,
  ): StrategySignalUpdate | undefined {
    try {
      return this.evaluateClosedCandle(
        state,
        openTime,
        notifyListeners,
        allowReevaluation,
      );
    } catch (error) {
      this.notifyEvaluationFailure(state, error);
      return undefined;
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

  private async refreshActiveSentiment(): Promise<void> {
    if (this.sentimentRefreshPromise !== undefined) {
      return this.sentimentRefreshPromise;
    }

    const refresh = Promise.all(
      [...this.activeStrategies.values()].map((state) =>
        this.refreshStateSentiment(state),
      ),
    );
    const settled = refresh.then(
      () => undefined,
      (error: unknown) => {
        this.logger?.warn(
          { err: error },
          'Active strategy sentiment refresh failed',
        );
      },
    );
    const pending = settled.finally(() => {
      if (this.sentimentRefreshPromise === pending) {
        this.sentimentRefreshPromise = undefined;
      }
    });
    this.sentimentRefreshPromise = pending;
    return pending;
  }

  private async refreshStateSentiment(
    state: ActiveStrategyState,
  ): Promise<void> {
    if (this.sentimentAggregateReader === undefined) return;
    try {
      const nextSentiment = await this.sentimentAggregateReader.getAggregate(
        state.pair,
      );
      const sentimentChanged = !sameSentiment(state.sentiment, nextSentiment);
      state.sentiment = nextSentiment;
      if (sentimentChanged && state.ready && state.strategy.liveOnly) {
        const latestClosedCandle = [...state.candles]
          .reverse()
          .find((candle) => candle.isClosed);
        if (latestClosedCandle !== undefined) {
          this.evaluateClosedCandleSafely(
            state,
            latestClosedCandle.openTime,
            true,
            true,
          );
        }
      }
    } catch (error) {
      // Keep the last known aggregate when analytics are temporarily unavailable.
      this.logger?.warn(
        { err: error, pair: state.pair },
        'Sentiment aggregate refresh failed; using last known value',
      );
    }
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
      try {
        this.evaluateClosedCandle(state, openTime);
      } catch (error) {
        this.notifyEvaluationFailure(state, error);
      }
    }
  }

  private evaluateClosedCandle(
    state: ActiveStrategyState,
    openTime: number,
    notifyListeners = true,
    allowReevaluation = false,
  ): StrategySignalUpdate | undefined {
    if (state.evaluatedOpenTimes.has(openTime) && !allowReevaluation) {
      return;
    }
    const candleIndex = state.candles.findIndex(
      (candidate) => candidate.openTime === openTime,
    );
    if (candleIndex < 0) return;
    const candle = state.candles[candleIndex];
    if (candle === undefined) return;
    const previousUpdate = state.signalHistory.find(
      (update) => update.candle.openTime === openTime,
    );

    const context: StrategyContext = {
      candles: state.candles
        .slice(0, candleIndex + 1)
        .slice(-state.strategy.requiredHistory),
      pair: state.pair,
      timeframe: state.timeframe,
      sentiment: state.sentiment,
    };
    state.evaluatedOpenTimes.add(openTime);
    const signal = state.strategy.analyze(context);
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
    if (notifyListeners && signalChanged(previousUpdate, update)) {
      for (const listener of state.listeners) listener(update);
    }
    return update;
  }

  private createStrategy(
    request: StrategySubscriptionRequest,
    pair: Pair,
    timeframe: Timeframe,
  ): {
    strategy: Strategy;
    versionId: string;
  } {
    if (request.composite !== undefined) {
      const members = request.composite.members.map((member) => {
        const strategy = StrategyRegistry.create(
          member.strategyId,
          member.params,
        );
        assertStrategyApplicable(strategy, pair, timeframe);
        return member.weight === undefined
          ? { strategy }
          : { strategy, weight: member.weight };
      });
      const composite = this.combinationEngine.assemble({
        members,
        mode: request.composite.mode,
        ...(request.composite.threshold === undefined
          ? {}
          : { threshold: request.composite.threshold }),
        ...(request.composite.stopLoss === undefined
          ? {}
          : { stopLoss: request.composite.stopLoss }),
        ...(request.composite.takeProfit === undefined
          ? {}
          : { takeProfit: request.composite.takeProfit }),
      });
      return { strategy: composite, versionId: composite.versionId };
    }

    const strategy = StrategyRegistry.create(
      request.strategyId,
      request.params,
    );
    assertStrategyApplicable(strategy, pair, timeframe);
    return { strategy, versionId: strategyVersionIdentity(strategy) };
  }

  private notifyEvaluationFailure(
    state: ActiveStrategyState,
    error: unknown,
  ): void {
    const failure =
      error instanceof Error ? error : new Error('Strategy evaluation failed');
    for (const listener of state.errorListeners) listener(failure);
  }
}

function strategyKey(
  strategyId: string,
  versionId: string,
  pair: Pair,
  timeframe: Timeframe,
): string {
  return `${strategyId}:${versionId}:${marketKey({ pair, timeframe })}`;
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

function sameSentiment(
  left: SentimentAggregate,
  right: SentimentAggregate,
): boolean {
  return (
    left.positive === right.positive &&
    left.neutral === right.neutral &&
    left.negative === right.negative &&
    left.score === right.score &&
    left.sampleSize === right.sampleSize
  );
}

function signalChanged(
  previous: StrategySignalUpdate | undefined,
  next: StrategySignalUpdate,
): boolean {
  return JSON.stringify(previous?.signal) !== JSON.stringify(next.signal);
}
