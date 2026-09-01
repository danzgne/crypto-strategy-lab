import type { Candle, MarketKey } from '../marketData/candle';
import type { Tick } from '../marketData/tick';
import type { Signal, StrategyParamsSchema } from '../strategy/types';
import type { LeaderboardSnapshot } from '../leaderboard/types';

export interface MarketDataTransportStatus {
  status: 'ready';
  service: 'market-data-transport';
  source?: string;
  serverTime: string;
}

export interface MarketDataPing {
  requestId: string;
  clientSentAt: string;
}

export interface MarketDataPong extends MarketDataPing {
  serverReceivedAt: string;
  source?: string;
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

export interface MarketHistoryRequest extends MarketKey {
  chartId: string;
  beforeOpenTime: number;
  limit?: number;
}

export interface MarketHistorySnapshot extends MarketKey {
  chartId: string;
  candles: Candle[];
  hasMore: boolean;
}

export interface MarketCandleUpdate extends MarketKey {
  candle: Candle;
}

export interface MarketSubscriptionStatus extends MarketKey {
  status: 'LIVE' | 'RECONNECTING' | 'STALE';
  detail?: string;
}

export interface MarketTicksSubscribeRequest {
  pair: string;
  limit?: number;
}

export interface MarketTicksUnsubscribeRequest {
  pair: string;
}

export interface MarketTicksSnapshot {
  pair: string;
  ticks: Tick[];
}

export interface MarketTickUpdate {
  pair: string;
  tick: Tick;
}

interface StrategySubscribeRequestBase extends MarketKey {
  chartId: string;
  limit?: number;
  params?: unknown;
}

export interface SingleStrategySubscribeRequest extends StrategySubscribeRequestBase {
  strategyId: string;
  params?: unknown;
  composite?: never;
}

export interface CompositeStrategySubscribeRequest extends StrategySubscribeRequestBase {
  strategyId: 'composite';
  composite: CompositeStrategyRequest;
}

export type StrategySubscribeRequest =
  SingleStrategySubscribeRequest | CompositeStrategySubscribeRequest;

export interface StrategyUnsubscribeRequest extends MarketKey {
  chartId: string;
  strategyId: string;
}

export interface CompositeStrategyMemberRequest {
  strategyId: string;
  params?: unknown;
  weight?: number;
}

export interface CompositeStrategyRequest {
  mode: 'majority' | 'weighted';
  members: CompositeStrategyMemberRequest[];
  threshold?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface StrategyCatalogEntry {
  id: string;
  paramsSchema: StrategyParamsSchema;
  requiresParams?: boolean;
}

export interface StrategyCatalog {
  strategies: StrategyCatalogEntry[];
  strategyIds?: string[];
}

export type StrategyErrorPhase = 'validation' | 'evaluation';

export interface StrategyErrorEvent extends MarketKey {
  chartId: string;
  strategyId: string;
  phase: StrategyErrorPhase;
  message: string;
}

export interface StrategySignalUpdate extends MarketKey {
  candle: Candle;
  indicators: Readonly<Record<string, number>>;
  signal: Signal;
}

export interface StrategySignalSnapshot extends MarketKey {
  chartId: string;
  strategyId: string;
  signals: StrategySignalUpdate[];
}

export interface ServerToClientEvents {
  'market-data:status': (status: MarketDataTransportStatus) => void;
  'market:snapshot': (snapshot: MarketSnapshot) => void;
  'market:history': (snapshot: MarketHistorySnapshot) => void;
  'market:candle': (update: MarketCandleUpdate) => void;
  'market:status': (status: MarketSubscriptionStatus) => void;
  'market:ticks:snapshot': (snapshot: MarketTicksSnapshot) => void;
  'market:tick': (update: MarketTickUpdate) => void;
  'strategy:catalog': (catalog: StrategyCatalog) => void;
  'strategy:snapshot': (snapshot: StrategySignalSnapshot) => void;
  'strategy:signal': (update: StrategySignalUpdate) => void;
  'strategy:error': (error: StrategyErrorEvent) => void;
  'leaderboard:updated': (snapshot: LeaderboardSnapshot) => void;
}

export interface ClientToServerEvents {
  'market-data:ping': (
    ping: MarketDataPing,
    acknowledge: (pong: MarketDataPong) => void,
  ) => void;
  'market:subscribe': (request: MarketSubscribeRequest) => void;
  'market:history:request': (request: MarketHistoryRequest) => void;
  'market:unsubscribe': (request: MarketUnsubscribeRequest) => void;
  'market:ticks:subscribe': (request: MarketTicksSubscribeRequest) => void;
  'market:ticks:unsubscribe': (request: MarketTicksUnsubscribeRequest) => void;
  'strategy:catalog:request': () => void;
  'strategy:subscribe': (request: StrategySubscribeRequest) => void;
  'strategy:unsubscribe': (request: StrategyUnsubscribeRequest) => void;
}

export type InterServerEvents = Record<never, never>;

export interface SocketData {
  requestId?: string;
}
