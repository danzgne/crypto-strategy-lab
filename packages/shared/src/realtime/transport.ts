import type { Candle, Pair, Timeframe } from '../marketData/candle';

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

export interface MarketSubscribeRequest {
  chartId: string;
  pair: Pair;
  timeframe: Timeframe;
  limit?: number;
}

export interface MarketUnsubscribeRequest {
  chartId: string;
  pair: Pair;
  timeframe: Timeframe;
}

export interface MarketSnapshot {
  chartId: string;
  pair: Pair;
  timeframe: Timeframe;
  candles: Candle[];
}

export interface MarketCandleUpdate {
  pair: Pair;
  timeframe: Timeframe;
  candle: Candle;
}

export interface MarketSubscriptionStatus {
  pair: Pair;
  timeframe: Timeframe;
  status: 'LIVE' | 'RECONNECTING' | 'STALE';
  detail?: string;
}

export interface ServerToClientEvents {
  'market-data:status': (status: MarketDataTransportStatus) => void;
  'market:snapshot': (snapshot: MarketSnapshot) => void;
  'market:candle': (update: MarketCandleUpdate) => void;
  'market:status': (status: MarketSubscriptionStatus) => void;
}

export interface ClientToServerEvents {
  'market-data:ping': (
    ping: MarketDataPing,
    acknowledge: (pong: MarketDataPong) => void,
  ) => void;
  'market:subscribe': (request: MarketSubscribeRequest) => void;
  'market:unsubscribe': (request: MarketUnsubscribeRequest) => void;
}

export type InterServerEvents = Record<never, never>;

export interface SocketData {
  requestId?: string;
}
