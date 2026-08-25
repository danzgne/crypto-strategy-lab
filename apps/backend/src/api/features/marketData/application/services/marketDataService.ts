import type {
  AnyDomainEvent,
  Candle,
  CandleQuery,
  CandleUpdateMetadata,
  MarketKey,
} from '@crypto-strategy-lab/shared';
import { createDomainEvent, marketKey } from '@crypto-strategy-lab/shared';
import {
  DEFAULT_CANDLE_LIMIT,
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

export interface MarketDataServiceDependencies {
  exchangeAdapter: ExchangeAdapter;
  candleRepository: CandleRepository;
  eventPublisher?: DomainEventPublisher;
  logger?: AppLogger;
}

interface CandleUpdate {
  candle: Candle;
  metadata: CandleUpdateMetadata;
}

interface ActiveMarketDataState extends MarketKey {
  candles: Map<number, Candle>;
  closedOpenTimes: Set<number>;
  bufferedUpdates: CandleUpdate[];
  candleListeners: Set<MarketDataCandleListener>;
  statusListeners: Set<MarketDataStatusListener>;
  referenceCount: number;
  ready: boolean;
  closeStream?: CloseExchangeStream;
  initialization: Promise<void>;
  status: ExchangeStreamStatus;
}

export class MarketDataService {
  private readonly exchangeAdapter: ExchangeAdapter;

  private readonly candleRepository: CandleRepository;

  private readonly eventPublisher: DomainEventPublisher;

  private readonly logger: AppLogger;

  private readonly activeStates = new Map<string, ActiveMarketDataState>();

  public constructor({
    exchangeAdapter,
    candleRepository,
    eventPublisher = NOOP_DOMAIN_EVENT_PUBLISHER,
    logger = createAppLogger({
      service: 'market-data-service',
      enabled: false,
    }),
  }: MarketDataServiceDependencies) {
    this.exchangeAdapter = exchangeAdapter;
    this.candleRepository = candleRepository;
    this.eventPublisher = eventPublisher;
    this.logger = logger;
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
      this.removeStateIfUnused(state, key);
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

  public async close(): Promise<void> {
    const states = [...this.activeStates.values()];
    this.activeStates.clear();
    await Promise.all(
      states.map(async (state) => {
        await state.closeStream?.();
      }),
    );
  }

  private createState(query: CandleQuery): ActiveMarketDataState {
    const state: ActiveMarketDataState = {
      pair: query.pair,
      timeframe: query.timeframe,
      candles: new Map<number, Candle>(),
      closedOpenTimes: new Set<number>(),
      bufferedUpdates: [],
      candleListeners: new Set<MarketDataCandleListener>(),
      statusListeners: new Set<MarketDataStatusListener>(),
      referenceCount: 0,
      ready: false,
      initialization: Promise.resolve(),
      status: 'RECONNECTING' as ExchangeStreamStatus,
    };

    const handlers: ExchangeStreamHandlers = {
      onCandle: (candle, metadata = {}) => {
        if (!state.ready) {
          state.bufferedUpdates.push({ candle, metadata });
          return;
        }
        return this.applyLiveCandle(state, candle, metadata);
      },
      onError: (error) => {
        this.logger.error(
          { err: error, pair: state.pair, timeframe: state.timeframe },
          'Market data exchange stream failed',
        );
        this.updateStatus(state, 'STALE');
      },
      onStatus: (status) => this.updateStatus(state, status),
    };

    const streamPromise = Promise.resolve().then(() =>
      this.exchangeAdapter.openKlineStream([query], handlers),
    );
    const historyPromise = Promise.resolve().then(() =>
      this.exchangeAdapter.fetchCandles(query),
    );
    state.initialization = this.initializeState(
      state,
      streamPromise,
      historyPromise,
    );
    return state;
  }

  private async initializeState(
    state: ActiveMarketDataState,
    streamPromise: Promise<CloseExchangeStream>,
    historyPromise: Promise<Candle[]>,
  ): Promise<void> {
    const [streamResult, historyResult] = await Promise.allSettled([
      streamPromise,
      historyPromise,
    ]);
    if (streamResult.status === 'rejected') {
      throw streamResult.reason;
    }
    if (historyResult.status === 'rejected') {
      await streamResult.value();
      throw historyResult.reason;
    }
    state.closeStream = streamResult.value;
    const history = historyResult.value;

    const historyByOpenTime = new Map<number, Candle>();
    for (const candle of history) {
      assertMatchingKey(state, candle);
      historyByOpenTime.set(candle.openTime, candle);
    }
    for (const candle of historyByOpenTime.values()) {
      state.candles.set(candle.openTime, candle);
      if (candle.isClosed) {
        state.closedOpenTimes.add(candle.openTime);
        await this.candleRepository.upsertClosed(candle);
      }
    }

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
    this.updateStatus(state, 'LIVE');
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
    if (candle.isClosed) {
      const isFirstClosedUpdate = !state.closedOpenTimes.has(candle.openTime);
      state.closedOpenTimes.add(candle.openTime);
      if (isFirstClosedUpdate) {
        await this.candleRepository.upsertClosed(candle);
        this.publishDomainEvent(
          createDomainEvent('CandleClosed', {
            pair: candle.pair,
            timeframe: candle.timeframe,
            openTime: candle.openTime,
            closeTime: candle.closeTime,
          }),
        );
      }
    } else {
      this.publishDomainEvent(
        createDomainEvent('MarketPriceUpdated', {
          pair: candle.pair,
          timeframe: candle.timeframe,
          openTime: candle.openTime,
          price: String(candle.close),
          exchangeEventTime: metadata.exchangeEventTime ?? Date.now(),
        }),
      );
    }

    for (const listener of state.candleListeners) listener(candle);
  }

  private publishDomainEvent(event: AnyDomainEvent): void {
    this.eventPublisher.publish(event);
  }

  private updateStatus(
    state: ActiveMarketDataState,
    status: ExchangeStreamStatus,
  ): void {
    state.status = status;
    for (const listener of state.statusListeners) listener(status);
  }

  private async removeStateIfUnused(
    state: ActiveMarketDataState,
    key: string,
  ): Promise<void> {
    if (state.referenceCount > 0 || this.activeStates.get(key) !== state) {
      return;
    }
    this.activeStates.delete(key);
    await state.closeStream?.();
  }
}

function normalizeQuery(query: CandleQuery): CandleQuery {
  const normalized: CandleQuery = {
    pair: query.pair.toUpperCase(),
    timeframe: query.timeframe,
  };
  normalized.limit = normalizeCandleLimit(query.limit);
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
    .slice(-limit);
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
