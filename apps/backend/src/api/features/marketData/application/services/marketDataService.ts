import type {
  AnyDomainEvent,
  Candle,
  CandleQuery,
  CandleUpdateMetadata,
  MarketKey,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import { createDomainEvent, marketKey } from '@crypto-strategy-lab/shared';
import {
  DEFAULT_CANDLE_LIMIT,
  MAX_CANDLE_LIMIT,
  normalizeCandleLimit,
} from '@crypto-strategy-lab/shared/market-data';

import type { AppLogger } from '../../../../../utils/logger';
import { createAppLogger } from '../../../../../utils/logger';
import type { CandleRepository } from '../interfaces/candleRepository.interface';
import {
  NOOP_DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '../interfaces/domainEventPublisher.interface';
import type {
  CloseExchangeStream,
  ExchangeAdapter,
  ExchangeStreamHandlers,
  ExchangeStreamStatus,
} from '../interfaces/exchangeAdapter.interface';

export {
  DEFAULT_CANDLE_LIMIT,
  MAX_CANDLE_LIMIT,
} from '@crypto-strategy-lab/shared/market-data';

const CANDLE_INTERVAL_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

const DEFAULT_RECONNECT_POLICY = {
  initialDelayMs: 500,
  maxDelayMs: 30_000,
} as const;

export type MarketDataCandleListener = (candle: Candle) => void;
export type MarketDataStatusListener = (status: ExchangeStreamStatus) => void;

export interface MarketDataSubscriptionHandlers {
  onCandle?: MarketDataCandleListener;
  onStatus?: MarketDataStatusListener;
}

export interface MarketDataSubscription {
  candles: Candle[];
  unsubscribe(): Promise<void>;
}

export interface MarketDataReconnectPolicy {
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export interface MarketDataServiceDependencies {
  exchangeAdapter: ExchangeAdapter;
  candleRepository: CandleRepository;
  eventPublisher?: DomainEventPublisher;
  logger?: AppLogger;
  reconnectPolicy?: MarketDataReconnectPolicy;
  now?: () => number;
}

interface CandleUpdate {
  candle: Candle;
  metadata: CandleUpdateMetadata;
}

interface ActiveMarketDataState extends MarketKey {
  candles: Map<number, Candle>;
  closedOpenTimes: Set<number>;
  bufferedUpdates: CandleUpdate[];
  recoveryBufferedUpdates: CandleUpdate[];
  candleListeners: Set<MarketDataCandleListener>;
  statusListeners: Set<MarketDataStatusListener>;
  referenceCount: number;
  ready: boolean;
  closeStream: CloseExchangeStream | undefined;
  initialization: Promise<void>;
  status: ExchangeStreamStatus;
  streamGeneration: number;
  streamConnected: boolean;
  reconnectAttempt: number;
  reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  recoveryPromise: Promise<void> | undefined;
  recoveryRequested: boolean;
  recovering: boolean;
  disposed: boolean;
  updateQueue: Promise<void>;
}

export class MarketDataService {
  private readonly exchangeAdapter: ExchangeAdapter;

  private readonly candleRepository: CandleRepository;

  private readonly eventPublisher: DomainEventPublisher;

  private readonly logger: AppLogger;

  private readonly reconnectPolicy: {
    initialDelayMs: number;
    maxDelayMs: number;
  };

  private readonly now: () => number;

  private readonly activeStates = new Map<string, ActiveMarketDataState>();

  public constructor({
    exchangeAdapter,
    candleRepository,
    eventPublisher = NOOP_DOMAIN_EVENT_PUBLISHER,
    logger = createAppLogger({
      service: 'market-data-service',
      enabled: false,
    }),
    reconnectPolicy = {},
    now = () => Date.now(),
  }: MarketDataServiceDependencies) {
    this.exchangeAdapter = exchangeAdapter;
    this.candleRepository = candleRepository;
    this.eventPublisher = eventPublisher;
    this.logger = logger;
    this.reconnectPolicy = {
      initialDelayMs: Math.max(
        0,
        reconnectPolicy.initialDelayMs ??
          DEFAULT_RECONNECT_POLICY.initialDelayMs,
      ),
      maxDelayMs: Math.max(
        0,
        reconnectPolicy.maxDelayMs ?? DEFAULT_RECONNECT_POLICY.maxDelayMs,
      ),
    };
    this.now = now;
  }

  public async subscribe(
    query: CandleQuery,
    handlers: MarketDataSubscriptionHandlers | MarketDataCandleListener = {},
  ): Promise<MarketDataSubscription> {
    const normalizedQuery = normalizeQuery(query);
    const key = marketKey(normalizedQuery);
    let state = this.activeStates.get(key);

    if (state === undefined) {
      state = this.createState(normalizedQuery);
      this.activeStates.set(key, state);
    }

    const normalizedHandlers = normalizeHandlers(handlers);
    const candleListener =
      normalizedHandlers.onCandle === undefined
        ? undefined
        : (candle: Candle) => normalizedHandlers.onCandle?.(candle);
    const statusListener =
      normalizedHandlers.onStatus === undefined
        ? undefined
        : (status: ExchangeStreamStatus) =>
            normalizedHandlers.onStatus?.(status);
    if (candleListener !== undefined) state.candleListeners.add(candleListener);
    if (statusListener !== undefined) state.statusListeners.add(statusListener);
    state.referenceCount += 1;

    try {
      await state.initialization;
    } catch (error) {
      if (candleListener !== undefined) {
        state.candleListeners.delete(candleListener);
      }
      if (statusListener !== undefined) {
        state.statusListeners.delete(statusListener);
      }
      state.referenceCount -= 1;
      await this.removeStateIfUnused(state, key);
      throw error;
    }

    const candles = getSnapshot(state, normalizedQuery.limit);
    let unsubscribed = false;
    return {
      candles,
      unsubscribe: async () => {
        if (unsubscribed) return;
        unsubscribed = true;
        if (candleListener !== undefined) {
          state.candleListeners.delete(candleListener);
        }
        if (statusListener !== undefined) {
          state.statusListeners.delete(statusListener);
        }
        state.referenceCount -= 1;
        await this.removeStateIfUnused(state, key);
      },
    };
  }

  public async loadHistoryBefore(
    query: CandleQuery,
    beforeOpenTime: number,
  ): Promise<Candle[]> {
    if (!Number.isFinite(beforeOpenTime)) {
      throw new Error('History boundary must be a finite timestamp');
    }

    const normalizedBeforeOpenTime = Math.trunc(beforeOpenTime);
    const normalizedQuery = normalizeQuery({
      ...query,
      endTime: normalizedBeforeOpenTime - 1,
    });
    const candles = (await this.fetchCandles(normalizedQuery))
      .filter((candle) => candle.openTime < normalizedBeforeOpenTime)
      .sort((left, right) => left.openTime - right.openTime);
    const state = this.activeStates.get(marketKey(normalizedQuery));

    if (state === undefined) {
      for (const candle of candles) {
        if (candle.isClosed) {
          await this.candleRepository.upsertClosed(candle);
        }
      }
      return candles;
    }

    await this.enqueueUpdate(state, async () => {
      for (const candle of candles) {
        assertMatchingKey(state, candle);
        state.candles.set(candle.openTime, candle);
      }
      this.rebuildClosedOpenTimes(state);
      for (const candle of candles) {
        if (candle.isClosed) {
          await this.candleRepository.upsertClosed(candle);
        }
      }
      this.trimState(state);
    });

    return candles;
  }

  public async close(): Promise<void> {
    const states = [...this.activeStates.values()];
    this.activeStates.clear();
    await Promise.all(states.map((state) => this.disposeState(state)));
  }

  private createState(query: CandleQuery): ActiveMarketDataState {
    const state: ActiveMarketDataState = {
      pair: query.pair,
      timeframe: query.timeframe,
      candles: new Map<number, Candle>(),
      closedOpenTimes: new Set<number>(),
      bufferedUpdates: [],
      recoveryBufferedUpdates: [],
      candleListeners: new Set<MarketDataCandleListener>(),
      statusListeners: new Set<MarketDataStatusListener>(),
      referenceCount: 0,
      ready: false,
      closeStream: undefined,
      initialization: Promise.resolve(),
      status: 'RECONNECTING',
      streamGeneration: 0,
      streamConnected: false,
      reconnectAttempt: 0,
      reconnectTimer: undefined,
      recoveryPromise: undefined,
      recoveryRequested: false,
      recovering: false,
      disposed: false,
      updateQueue: Promise.resolve(),
    };

    state.initialization = this.initializeState(state, query);
    return state;
  }

  private async initializeState(
    state: ActiveMarketDataState,
    query: CandleQuery,
  ): Promise<void> {
    const streamPromise = this.openStream(state);
    const historyPromise = this.fetchCandles(query);
    const [streamResult, historyResult] = await Promise.allSettled([
      streamPromise,
      historyPromise,
    ]);
    if (streamResult.status === 'rejected') {
      throw streamResult.reason;
    }
    if (historyResult.status === 'rejected') {
      await this.stopStream(state, streamResult.value);
      throw historyResult.reason;
    }

    if (state.disposed) {
      await this.stopStream(state, streamResult.value);
      return;
    }

    state.closeStream = streamResult.value;
    await this.mergeInitialCandles(state, historyResult.value);

    while (state.bufferedUpdates.length > 0) {
      const bufferedUpdates = state.bufferedUpdates.splice(
        0,
        state.bufferedUpdates.length,
      );
      for (const update of bufferedUpdates) {
        await this.applyLiveCandle(state, update.candle, update.metadata);
      }
    }

    state.ready = true;
    if (state.recoveryRequested || !state.streamConnected) {
      this.updateStatus(
        state,
        state.status === 'STALE' ? 'STALE' : 'RECONNECTING',
      );
      this.scheduleRecovery(state);
    } else {
      this.updateStatus(state, 'LIVE');
    }
  }

  private openStream(
    state: ActiveMarketDataState,
  ): Promise<CloseExchangeStream> {
    const generation = state.streamGeneration + 1;
    state.streamGeneration = generation;
    state.streamConnected = true;

    const handlers: ExchangeStreamHandlers = {
      onCandle: (candle, metadata = {}) => {
        if (!this.isCurrentStream(state, generation)) return;
        if (!state.ready) {
          state.bufferedUpdates.push({ candle, metadata });
          return;
        }
        if (state.recovering) {
          state.recoveryBufferedUpdates.push({ candle, metadata });
          return;
        }
        return this.enqueueUpdate(state, () =>
          this.applyLiveCandle(state, candle, metadata),
        );
      },
      onError: (error) => {
        if (!this.isCurrentStream(state, generation)) return;
        state.streamConnected = false;
        this.logger.error(
          { err: error, pair: state.pair, timeframe: state.timeframe },
          'Market data exchange stream failed',
        );
        this.markStreamUnavailable(state, 'RECONNECTING');
      },
      onStatus: (status) => {
        if (!this.isCurrentStream(state, generation)) return;
        this.handleStreamStatus(state, status);
      },
    };

    return Promise.resolve()
      .then(() =>
        this.exchangeAdapter.openKlineStream(
          [{ pair: state.pair, timeframe: state.timeframe }],
          handlers,
        ),
      )
      .catch((error: unknown) => {
        if (this.isCurrentStream(state, generation)) {
          state.streamConnected = false;
        }
        throw error;
      });
  }

  private async fetchCandles(query: CandleQuery): Promise<Candle[]> {
    const normalizedQuery = normalizeQuery(query);
    if (
      normalizedQuery.startTime === undefined ||
      normalizedQuery.endTime === undefined
    ) {
      return this.exchangeAdapter.fetchCandles(normalizedQuery);
    }

    const interval = CANDLE_INTERVAL_MS[normalizedQuery.timeframe];
    const expectedBars =
      Math.floor(
        (normalizedQuery.endTime - normalizedQuery.startTime) / interval,
      ) + 1;
    if (expectedBars <= (normalizedQuery.limit ?? DEFAULT_CANDLE_LIMIT)) {
      return this.exchangeAdapter.fetchCandles(normalizedQuery);
    }

    const candlesByOpenTime = new Map<number, Candle>();
    let nextStartTime = normalizedQuery.startTime;
    while (nextStartTime <= normalizedQuery.endTime) {
      const batch = await this.exchangeAdapter.fetchCandles({
        ...normalizedQuery,
        limit: MAX_CANDLE_LIMIT,
        startTime: nextStartTime,
      });
      if (batch.length === 0) break;

      let lastOpenTime = nextStartTime - interval;
      for (const candle of batch) {
        assertMatchingKey(normalizedQuery, candle);
        if (
          candle.openTime < normalizedQuery.startTime ||
          candle.openTime > normalizedQuery.endTime
        ) {
          continue;
        }
        candlesByOpenTime.set(candle.openTime, candle);
        lastOpenTime = Math.max(lastOpenTime, candle.openTime);
      }

      if (lastOpenTime < nextStartTime) {
        throw new Error('Candle history batch did not advance');
      }
      nextStartTime = lastOpenTime + interval;
    }

    return [...candlesByOpenTime.values()].sort(
      (left, right) => left.openTime - right.openTime,
    );
  }

  private async mergeInitialCandles(
    state: ActiveMarketDataState,
    candles: Candle[],
  ): Promise<void> {
    const historyByOpenTime = new Map<number, Candle>();
    for (const candle of candles) {
      assertMatchingKey(state, candle);
      historyByOpenTime.set(candle.openTime, candle);
    }

    for (const candle of historyByOpenTime.values()) {
      state.candles.set(candle.openTime, candle);
    }
    this.rebuildClosedOpenTimes(state);
    for (const candle of state.candles.values()) {
      if (candle.isClosed) {
        await this.candleRepository.upsertClosed(candle);
      }
    }
    this.trimState(state);
  }

  private async applyLiveCandle(
    state: ActiveMarketDataState,
    candle: Candle,
    metadata: CandleUpdateMetadata,
  ): Promise<void> {
    assertMatchingKey(state, candle);
    const previous = state.candles.get(candle.openTime);
    if (previous?.isClosed === true) return;

    state.candles.set(candle.openTime, candle);
    let isFirstClosedUpdate = false;
    if (candle.isClosed) {
      isFirstClosedUpdate = !state.closedOpenTimes.has(candle.openTime);
      state.closedOpenTimes.add(candle.openTime);
      if (isFirstClosedUpdate) {
        await this.candleRepository.upsertClosed(candle);
      }
    } else {
      this.publishDomainEvent(
        createDomainEvent('MarketPriceUpdated', {
          pair: candle.pair,
          timeframe: candle.timeframe,
          openTime: candle.openTime,
          price: String(candle.close),
          exchangeEventTime: metadata.exchangeEventTime ?? this.now(),
        }),
      );
    }

    this.trimState(state);
    for (const listener of state.candleListeners) listener(candle);
    if (candle.isClosed && isFirstClosedUpdate) {
      this.publishDomainEvent(
        createDomainEvent('CandleClosed', {
          pair: candle.pair,
          timeframe: candle.timeframe,
          openTime: candle.openTime,
          closeTime: candle.closeTime,
        }),
      );
    }
  }

  private async mergeRecoveredCandles(
    state: ActiveMarketDataState,
    candles: Candle[],
  ): Promise<void> {
    const uniqueCandles = new Map<number, Candle>();
    for (const candle of candles) {
      assertMatchingKey(state, candle);
      uniqueCandles.set(candle.openTime, candle);
    }

    for (const candle of [...uniqueCandles.values()].sort(
      (left, right) => left.openTime - right.openTime,
    )) {
      const previous = state.candles.get(candle.openTime);
      if (previous !== undefined && candlesEqual(previous, candle)) {
        continue;
      }

      state.candles.set(candle.openTime, candle);
      let isFirstClosedUpdate = false;
      if (candle.isClosed) {
        isFirstClosedUpdate = !state.closedOpenTimes.has(candle.openTime);
        state.closedOpenTimes.add(candle.openTime);
        await this.candleRepository.upsertClosed(candle);
      } else {
        this.publishDomainEvent(
          createDomainEvent('MarketPriceUpdated', {
            pair: candle.pair,
            timeframe: candle.timeframe,
            openTime: candle.openTime,
            price: String(candle.close),
            exchangeEventTime: this.now(),
          }),
        );
      }

      this.trimState(state);
      for (const listener of state.candleListeners) listener(candle);
      if (candle.isClosed && isFirstClosedUpdate) {
        this.publishDomainEvent(
          createDomainEvent('CandleClosed', {
            pair: candle.pair,
            timeframe: candle.timeframe,
            openTime: candle.openTime,
            closeTime: candle.closeTime,
          }),
        );
      }
    }
  }

  private handleStreamStatus(
    state: ActiveMarketDataState,
    status: ExchangeStreamStatus,
  ): void {
    if (status === 'LIVE') {
      state.streamConnected = true;
      if (!state.recovering) {
        state.recoveryRequested = false;
        state.reconnectAttempt = 0;
        this.updateStatus(state, 'LIVE');
      }
      return;
    }

    state.streamConnected = false;
    this.markStreamUnavailable(state, status);
  }

  private markStreamUnavailable(
    state: ActiveMarketDataState,
    status: 'RECONNECTING' | 'STALE',
  ): void {
    if (state.disposed) return;
    state.recoveryRequested = true;
    this.updateStatus(state, status);
    if (state.ready) this.scheduleRecovery(state);
  }

  private scheduleRecovery(state: ActiveMarketDataState): void {
    if (
      state.disposed ||
      state.referenceCount === 0 ||
      !state.ready ||
      state.reconnectTimer !== undefined ||
      state.recoveryPromise !== undefined
    ) {
      return;
    }

    const delay = Math.min(
      this.reconnectPolicy.maxDelayMs,
      this.reconnectPolicy.initialDelayMs * 2 ** state.reconnectAttempt,
    );
    state.reconnectAttempt += 1;
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = undefined;
      const recoveryPromise = this.recoverState(state);
      state.recoveryPromise = recoveryPromise;
      void recoveryPromise
        .catch((error: unknown) => {
          if (state.disposed) return;
          this.logger.error(
            { err: error, pair: state.pair, timeframe: state.timeframe },
            'Market data stream recovery failed',
          );
          state.recoveryBufferedUpdates = [];
          state.recovering = false;
          state.recoveryRequested = true;
          this.updateStatus(state, 'STALE');
        })
        .finally(() => {
          if (state.recoveryPromise === recoveryPromise) {
            state.recoveryPromise = undefined;
          }
          if (state.recoveryRequested) this.scheduleRecovery(state);
        });
    }, delay);
  }

  private async recoverState(state: ActiveMarketDataState): Promise<void> {
    if (state.disposed || state.referenceCount === 0) return;

    state.recovering = true;
    state.recoveryRequested = false;
    this.updateStatus(state, 'RECONNECTING');
    let reconciled = false;
    let recoveryStream: CloseExchangeStream | undefined;

    try {
      await state.updateQueue;
      await this.stopStream(state);
      if (state.disposed || state.referenceCount === 0) return;

      const interval = CANDLE_INTERVAL_MS[state.timeframe];
      const lastClosedOpenTime =
        state.closedOpenTimes.size > 0
          ? Math.max(...state.closedOpenTimes)
          : Math.max(...state.candles.keys(), 0);
      const startTime = Math.max(0, lastClosedOpenTime - interval);
      const endTime = Math.max(startTime, this.now());
      const query: CandleQuery = {
        pair: state.pair,
        timeframe: state.timeframe,
        limit: MAX_CANDLE_LIMIT,
        startTime,
        endTime,
      };

      const streamPromise = this.openStream(state);
      const historyPromise = this.fetchCandles(query);
      const [streamResult, historyResult] = await Promise.allSettled([
        streamPromise,
        historyPromise,
      ]);
      if (streamResult.status === 'rejected') {
        throw streamResult.reason;
      }
      recoveryStream = streamResult.value;
      state.closeStream = recoveryStream;
      if (historyResult.status === 'rejected') {
        throw historyResult.reason;
      }
      if (historyResult.value.length === 0) {
        throw new Error('Market data recovery returned no candles');
      }
      if (state.disposed || state.referenceCount === 0) {
        return;
      }
      assertContiguousRecovery(
        state,
        historyResult.value,
        lastClosedOpenTime,
        endTime,
        interval,
      );

      if (!state.streamConnected || state.recoveryRequested) {
        throw new Error('Market data stream closed during recovery');
      }
      await this.enqueueUpdate(state, async () => {
        await this.mergeRecoveredCandles(state, historyResult.value);
        const bufferedUpdates = state.recoveryBufferedUpdates.splice(
          0,
          state.recoveryBufferedUpdates.length,
        );
        for (const update of bufferedUpdates) {
          await this.applyLiveCandle(state, update.candle, update.metadata);
        }
      });
      if (!state.streamConnected || state.recoveryRequested) {
        throw new Error('Market data stream closed during recovery');
      }

      state.recoveryRequested = false;
      state.reconnectAttempt = 0;
      reconciled = true;
      this.updateStatus(state, 'LIVE');
    } finally {
      if (
        !reconciled &&
        recoveryStream !== undefined &&
        state.closeStream === recoveryStream
      ) {
        await this.stopStream(state, recoveryStream);
      }
      if (!reconciled) {
        state.recoveryBufferedUpdates = [];
      }
      state.recovering = false;
    }
  }

  private async enqueueUpdate(
    state: ActiveMarketDataState,
    update: () => Promise<void>,
  ): Promise<void> {
    const next = state.updateQueue.then(update, update);
    state.updateQueue = next.catch(() => undefined);
    return next;
  }

  private async stopStream(
    state: ActiveMarketDataState,
    streamToClose = state.closeStream,
  ): Promise<void> {
    if (streamToClose === undefined) return;
    state.streamGeneration += 1;
    state.streamConnected = false;
    if (state.closeStream === streamToClose) state.closeStream = undefined;
    await streamToClose();
  }

  private async removeStateIfUnused(
    state: ActiveMarketDataState,
    key: string,
  ): Promise<void> {
    if (state.referenceCount > 0 || this.activeStates.get(key) !== state) {
      return;
    }
    this.activeStates.delete(key);
    await this.disposeState(state);
  }

  private async disposeState(state: ActiveMarketDataState): Promise<void> {
    if (state.disposed) return;
    state.disposed = true;
    if (state.reconnectTimer !== undefined) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = undefined;
    }
    state.recoveryBufferedUpdates = [];
    await this.stopStream(state);
    await state.initialization.catch(() => undefined);
    await state.recoveryPromise?.catch(() => undefined);
  }

  private publishDomainEvent(event: AnyDomainEvent): void {
    this.eventPublisher.publish(event);
  }

  private updateStatus(
    state: ActiveMarketDataState,
    status: ExchangeStreamStatus,
  ): void {
    if (state.disposed) return;
    state.status = status;
    for (const listener of state.statusListeners) listener(status);
  }

  private isCurrentStream(
    state: ActiveMarketDataState,
    generation: number,
  ): boolean {
    return !state.disposed && state.streamGeneration === generation;
  }

  private rebuildClosedOpenTimes(state: ActiveMarketDataState): void {
    state.closedOpenTimes = new Set(
      [...state.candles.values()]
        .filter((candle) => candle.isClosed)
        .map((candle) => candle.openTime),
    );
  }

  private trimState(state: ActiveMarketDataState): void {
    const candles = [...state.candles.values()]
      .sort((left, right) => left.openTime - right.openTime)
      .slice(-MAX_CANDLE_LIMIT);
    state.candles = new Map(candles.map((candle) => [candle.openTime, candle]));
    this.rebuildClosedOpenTimes(state);
  }
}

function normalizeQuery(query: CandleQuery): CandleQuery {
  const normalized: CandleQuery = {
    pair: query.pair.toUpperCase(),
    timeframe: query.timeframe,
    limit: normalizeCandleLimit(query.limit),
  };
  if (query.startTime !== undefined) normalized.startTime = query.startTime;
  if (query.endTime !== undefined) normalized.endTime = query.endTime;
  return normalized;
}

function normalizeHandlers(
  handlers: MarketDataSubscriptionHandlers | MarketDataCandleListener,
): MarketDataSubscriptionHandlers {
  return typeof handlers === 'function' ? { onCandle: handlers } : handlers;
}

function getSnapshot(
  state: ActiveMarketDataState,
  limit = DEFAULT_CANDLE_LIMIT,
): Candle[] {
  return [...state.candles.values()]
    .sort((left, right) => left.openTime - right.openTime)
    .slice(-normalizeCandleLimit(limit));
}

function assertMatchingKey(state: MarketKey, candle: Candle): void {
  if (
    candle.pair.toUpperCase() !== state.pair ||
    candle.timeframe !== state.timeframe
  ) {
    throw new Error(
      `Candle key ${candle.pair}:${candle.timeframe} does not match ${state.pair}:${state.timeframe}`,
    );
  }
}

function candlesEqual(left: Candle, right: Candle): boolean {
  return (
    left.pair === right.pair &&
    left.timeframe === right.timeframe &&
    left.openTime === right.openTime &&
    left.closeTime === right.closeTime &&
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close &&
    left.volume === right.volume &&
    left.isClosed === right.isClosed
  );
}

function assertContiguousRecovery(
  state: ActiveMarketDataState,
  recoveredCandles: Candle[],
  lastClosedOpenTime: number,
  endTime: number,
  interval: number,
): void {
  const availableOpenTimes = new Set([
    ...state.candles.keys(),
    ...recoveredCandles.map((candle) => candle.openTime),
  ]);
  const lastExpectedOpenTime =
    lastClosedOpenTime +
    Math.floor((endTime - lastClosedOpenTime) / interval) * interval;

  for (
    let openTime = lastClosedOpenTime;
    openTime <= lastExpectedOpenTime;
    openTime += interval
  ) {
    if (!availableOpenTimes.has(openTime)) {
      throw new Error(`Market data recovery has a gap at ${openTime}`);
    }
  }
}
