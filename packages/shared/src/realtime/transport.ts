import type { Candle, MarketKey } from '../marketData/candle';
import type { Signal } from '../strategy/types';

export interface MarketDataTransportStatus {
  status: 'ready';
  service: 'market-data-transport';
  serverTime: string;
}

export interface MarketDataPing {
  requestId: string;
  clientSentAt: string;
}

export interface MarketDataPong extends MarketDataPing {
  serverReceivedAt: string;
}

export interface MarketSubscribeRequest extends MarketKey {
  chartId: string;
  limit?: number;
}

export interface MarketUnsubscribeRequest extends MarketKey {
  chartId: string;
}

export interface MarketSnapshot extends MarketKey {
  chartId: string;
  candles: Candle[];
}

export interface MarketCandleUpdate extends MarketKey {
  candle: Candle;
}

export interface MarketSubscriptionStatus extends MarketKey {
  status: 'LIVE' | 'RECONNECTING' | 'STALE';
  detail?: string;
}

export interface StrategySubscribeRequest extends MarketKey {
  chartId: string;
  strategyId: string;
}

export type StrategyUnsubscribeRequest = StrategySubscribeRequest;

export interface StrategyCatalog {
  strategyIds: string[];
}

export interface StrategySignalUpdate extends MarketKey {
  candle: Candle;
  indicators: Readonly<Record<string, number>>;
  signal: Signal;
}

export interface ServerToClientEvents {
  'market-data:status': (status: MarketDataTransportStatus) => void;
  'market:snapshot': (snapshot: MarketSnapshot) => void;
  'market:candle': (update: MarketCandleUpdate) => void;
  'market:status': (status: MarketSubscriptionStatus) => void;
  'strategy:catalog': (catalog: StrategyCatalog) => void;
  'strategy:signal': (update: StrategySignalUpdate) => void;
}

export interface ClientToServerEvents {
  'market-data:ping': (
    ping: MarketDataPing,
    acknowledge: (pong: MarketDataPong) => void,
  ) => void;
  'market:subscribe': (request: MarketSubscribeRequest) => void;
  'market:unsubscribe': (request: MarketUnsubscribeRequest) => void;
  'strategy:catalog:request': () => void;
  'strategy:subscribe': (request: StrategySubscribeRequest) => void;
  'strategy:unsubscribe': (request: StrategyUnsubscribeRequest) => void;
}

export type InterServerEvents = Record<never, never>;

export interface SocketData {
  requestId?: string;
}
