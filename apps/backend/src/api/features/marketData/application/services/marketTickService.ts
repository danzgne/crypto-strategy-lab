import type { Pair, Tick, TickQuery } from '@crypto-strategy-lab/shared';
import {
  MAX_TICK_LIMIT,
  normalizeTickLimit,
} from '@crypto-strategy-lab/shared';

import type { AppLogger } from '../../../../../utils/logger';
import { createAppLogger } from '../../../../../utils/logger';
import type {
  CloseExchangeStream,
  ExchangeAdapter,
  ExchangeStreamStatus,
  ExchangeTradeStreamHandlers,
} from '../interfaces/exchangeAdapter.interface';

const DEFAULT_RECONNECT_POLICY = {
  initialDelayMs: 500,
  maxDelayMs: 30_000,
} as const;

export type MarketTickListener = (tick: Tick) => void;
export type MarketTickStatusListener = (status: ExchangeStreamStatus) => void;

export interface MarketTickSubscriptionHandlers {
  onTick?: MarketTickListener;
  onStatus?: MarketTickStatusListener;
}

export interface MarketTickSubscription {
  ticks: Tick[];
  unsubscribe(): Promise<void>;
}

export interface MarketTickReconnectPolicy {
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export interface MarketTickServiceDependencies {
  exchangeAdapter: ExchangeAdapter;
  logger?: AppLogger;
  reconnectPolicy?: MarketTickReconnectPolicy;
}

interface ActiveTickState {
  pair: Pair;
  ticks: Tick[];
  tradeIds: Set<string>;
  tickListeners: Set<MarketTickListener>;
  statusListeners: Set<MarketTickStatusListener>;
  referenceCount: number;
  ready: boolean;
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
  closeStream: CloseExchangeStream | undefined;
}

export class MarketTickService {
  private readonly exchangeAdapter: ExchangeAdapter;

  private readonly logger: AppLogger;

  private readonly reconnectPolicy: {
    initialDelayMs: number;
    maxDelayMs: number;
  };

  private readonly activeStates = new Map<string, ActiveTickState>();

  public constructor({
    exchangeAdapter,
    logger = createAppLogger({
      service: 'market-tick-service',
      enabled: false,
    }),
    reconnectPolicy = {},
  }: MarketTickServiceDependencies) {
    this.exchangeAdapter = exchangeAdapter;
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
  }

  public async subscribe(
    query: TickQuery,
    handlers: MarketTickSubscriptionHandlers = {},
  ): Promise<MarketTickSubscription> {
    const normalizedQuery = normalizeQuery(query);
    let state = this.activeStates.get(normalizedQuery.pair);

    if (state === undefined) {
      state = this.createState(normalizedQuery.pair);
      this.activeStates.set(normalizedQuery.pair, state);
    }

    if (handlers.onTick !== undefined) {
      state.tickListeners.add(handlers.onTick);
    }
    if (handlers.onStatus !== undefined) {
      state.statusListeners.add(handlers.onStatus);
    }
    state.referenceCount += 1;

    try {
      await state.initialization;
    } catch (error) {
      if (handlers.onTick !== undefined) {
        state.tickListeners.delete(handlers.onTick);
      }
      if (handlers.onStatus !== undefined) {
        state.statusListeners.delete(handlers.onStatus);
      }
      state.referenceCount -= 1;
      await this.removeStateIfUnused(state, normalizedQuery.pair);
      throw error;
    }

    const ticks = state.ticks.slice(0, normalizeTickLimit(query.limit));
    let unsubscribed = false;
    return {
      ticks,
      unsubscribe: async () => {
        if (unsubscribed) return;
        unsubscribed = true;
        if (handlers.onTick !== undefined) {
          state.tickListeners.delete(handlers.onTick);
        }
        if (handlers.onStatus !== undefined) {
          state.statusListeners.delete(handlers.onStatus);
        }
        state.referenceCount -= 1;
        await this.removeStateIfUnused(state, normalizedQuery.pair);
      },
    };
  }

  public async close(): Promise<void> {
    const states = [...this.activeStates.values()];
    this.activeStates.clear();
    await Promise.all(states.map((state) => this.disposeState(state)));
  }

  private createState(pair: Pair): ActiveTickState {
    const state: ActiveTickState = {
      pair,
      ticks: [],
      tradeIds: new Set<string>(),
      tickListeners: new Set<MarketTickListener>(),
      statusListeners: new Set<MarketTickStatusListener>(),
      referenceCount: 0,
      ready: false,
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
      closeStream: undefined,
    };

    state.initialization = this.initializeState(state);
    return state;
  }

  private async initializeState(state: ActiveTickState): Promise<void> {
    if (this.exchangeAdapter.openTradeStream === undefined) {
      state.ready = true;
      this.updateStatus(state, 'STALE');
      return;
    }

    try {
      const stream = await this.openStream(state);
      if (state.disposed) {
        await this.stopStream(state, stream);
        return;
      }
      state.closeStream = stream;
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
    } catch (error) {
      if (state.disposed) return;
      state.ready = true;
      state.streamConnected = false;
      state.recoveryRequested = true;
      this.logger.error(
        { err: error, pair: state.pair },
        'Market tick stream initialization failed',
      );
      this.updateStatus(state, 'STALE');
      this.scheduleRecovery(state);
    }
  }

  private openStream(state: ActiveTickState): Promise<CloseExchangeStream> {
    const generation = state.streamGeneration + 1;
    state.streamGeneration = generation;
    state.streamConnected = true;

    const handlers: ExchangeTradeStreamHandlers = {
      onTick: (tick) => {
        if (!this.isCurrentStream(state, generation)) return;
        if (!state.recovering) this.confirmStreamLive(state);
        this.recordTick(state, tick);
      },
      onError: (error) => {
        if (!this.isCurrentStream(state, generation)) return;
        state.streamConnected = false;
        this.logger.error(
          { err: error, pair: state.pair },
          'Market tick exchange stream failed',
        );
        this.markStreamUnavailable(state, 'RECONNECTING');
      },
      onStatus: (status) => {
        if (!this.isCurrentStream(state, generation)) return;
        if (status !== 'LIVE') state.streamGeneration += 1;
        this.handleStreamStatus(state, status);
      },
    };

    return Promise.resolve()
      .then(() =>
        this.exchangeAdapter.openTradeStream?.([state.pair], handlers),
      )
      .then((stream) => stream ?? (() => undefined))
      .catch((error: unknown) => {
        if (this.isCurrentStream(state, generation)) {
          state.streamConnected = false;
        }
        throw error;
      });
  }

  private handleStreamStatus(
    state: ActiveTickState,
    status: ExchangeStreamStatus,
  ): void {
    if (status === 'LIVE') {
      state.streamConnected = true;
      if (!state.recovering) {
        state.recoveryRequested = false;
        state.reconnectAttempt = 0;
        this.clearReconnectTimer(state);
        this.updateStatus(state, 'LIVE');
      }
      return;
    }

    state.streamConnected = false;
    this.markStreamUnavailable(state, status);
  }

  private markStreamUnavailable(
    state: ActiveTickState,
    status: 'RECONNECTING' | 'STALE',
  ): void {
    if (state.disposed) return;
    state.recoveryRequested = true;
    this.updateStatus(state, status);
    if (state.ready) this.scheduleRecovery(state);
  }

  private confirmStreamLive(state: ActiveTickState): void {
    if (state.streamConnected) return;
    state.streamConnected = true;
    state.recoveryRequested = false;
    state.reconnectAttempt = 0;
    this.clearReconnectTimer(state);
    this.updateStatus(state, 'LIVE');
  }

  private scheduleRecovery(state: ActiveTickState): void {
    if (
      state.disposed ||
      state.referenceCount === 0 ||
      !state.ready ||
      state.reconnectTimer !== undefined ||
      state.recoveryPromise !== undefined ||
      this.exchangeAdapter.openTradeStream === undefined
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
            { err: error, pair: state.pair },
            'Market tick stream recovery failed',
          );
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

  private async recoverState(state: ActiveTickState): Promise<void> {
    if (state.disposed || state.referenceCount === 0) return;

    state.recovering = true;
    state.recoveryRequested = false;
    this.updateStatus(state, 'RECONNECTING');
    let replacementStream: CloseExchangeStream | undefined;
    let recovered = false;

    try {
      await this.stopStream(state);
      if (state.disposed || state.referenceCount === 0) return;

      replacementStream = await this.openStream(state);
      if (state.disposed || state.referenceCount === 0) return;
      if (!state.streamConnected || state.recoveryRequested) {
        throw new Error('Market tick stream closed during recovery');
      }
      state.closeStream = replacementStream;
      state.reconnectAttempt = 0;
      state.recoveryRequested = false;
      recovered = true;
      this.updateStatus(state, 'LIVE');
    } finally {
      if (
        !recovered &&
        replacementStream !== undefined &&
        state.closeStream === replacementStream
      ) {
        await this.stopStream(state, replacementStream);
      }
      state.recovering = false;
    }
  }

  private recordTick(state: ActiveTickState, tick: Tick): void {
    if (tick.pair !== state.pair || state.tradeIds.has(tick.tradeId)) return;
    state.tradeIds.add(tick.tradeId);
    state.ticks = [tick, ...state.ticks]
      .sort((left, right) => right.time - left.time)
      .slice(0, MAX_TICK_LIMIT);
    if (state.tradeIds.size > MAX_TICK_LIMIT) {
      state.tradeIds = new Set(state.ticks.map(({ tradeId }) => tradeId));
    }
    for (const listener of state.tickListeners) listener(tick);
  }

  private async stopStream(
    state: ActiveTickState,
    streamToClose = state.closeStream,
  ): Promise<void> {
    if (streamToClose === undefined) return;
    state.streamGeneration += 1;
    state.streamConnected = false;
    if (state.closeStream === streamToClose) state.closeStream = undefined;
    await streamToClose();
  }

  private async removeStateIfUnused(
    state: ActiveTickState,
    pair: Pair,
  ): Promise<void> {
    if (state.referenceCount > 0 || this.activeStates.get(pair) !== state) {
      return;
    }
    this.activeStates.delete(pair);
    await this.disposeState(state);
  }

  private async disposeState(state: ActiveTickState): Promise<void> {
    if (state.disposed) return;
    state.disposed = true;
    this.clearReconnectTimer(state);
    await this.stopStream(state);
    await state.initialization.catch(() => undefined);
    await state.recoveryPromise?.catch(() => undefined);
  }

  private clearReconnectTimer(state: ActiveTickState): void {
    if (state.reconnectTimer === undefined) return;
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = undefined;
  }

  private updateStatus(
    state: ActiveTickState,
    status: ExchangeStreamStatus,
  ): void {
    if (state.disposed) return;
    state.status = status;
    for (const listener of state.statusListeners) listener(status);
  }

  private isCurrentStream(state: ActiveTickState, generation: number): boolean {
    return !state.disposed && state.streamGeneration === generation;
  }
}

function normalizeQuery(query: TickQuery): TickQuery {
  const pair = query.pair.trim().toUpperCase();
  if (pair.length === 0) throw new Error('Tick pair is required');
  return { pair, limit: normalizeTickLimit(query.limit) };
}
