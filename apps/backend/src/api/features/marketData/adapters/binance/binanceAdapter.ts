import type {
  Candle,
  CandleQuery,
  CandleUpdateMetadata,
  MarketKey,
  Pair,
  Tick,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import { normalizeCandleLimit } from '@crypto-strategy-lab/shared/market-data';

import type {
  CloseExchangeStream,
  ExchangeAdapter,
  ExchangeStreamHandlers,
  ExchangeTradeStreamHandlers,
} from '../../application/interfaces/exchangeAdapter.interface';

const DEFAULT_REST_BASE_URL = 'https://api.binance.com';
const DEFAULT_WEBSOCKET_BASE_URL = 'wss://stream.binance.com:9443/stream';
const BINANCE_TIMEFRAMES: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
};

const TIMEFRAME_BY_BINANCE_INTERVAL = new Map(
  Object.entries(BINANCE_TIMEFRAMES).map(([timeframe, interval]) => [
    interval,
    timeframe as Timeframe,
  ]),
);

type BinanceKlineRow = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  ...unknown[],
];

interface BinanceWebSocket {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((error: unknown) => void) | null;
  onclose: (() => void) | null;
  onopen: (() => void) | null;
  close(): void;
}

interface BinanceAdapterOptions {
  fetch?: typeof globalThis.fetch;
  createWebSocket?: (url: string) => BinanceWebSocket;
  restBaseUrl?: string;
  websocketBaseUrl?: string;
}

interface BinanceKlineMessage {
  data?: {
    e?: unknown;
    E?: unknown;
    s?: unknown;
    t?: unknown;
    p?: unknown;
    q?: unknown;
    T?: unknown;
    m?: unknown;
    k?: {
      t?: unknown;
      T?: unknown;
      s?: unknown;
      i?: unknown;
      o?: unknown;
      c?: unknown;
      h?: unknown;
      l?: unknown;
      v?: unknown;
      x?: unknown;
    };
  };
}

export class BinanceAdapter implements ExchangeAdapter {
  private readonly fetchImplementation: typeof globalThis.fetch;

  private readonly createWebSocket: (url: string) => BinanceWebSocket;

  private readonly restBaseUrl: string;

  private readonly websocketBaseUrl: string;

  public constructor({
    fetch: fetchImplementation = globalThis.fetch.bind(globalThis),
    createWebSocket = defaultWebSocketFactory,
    restBaseUrl = DEFAULT_REST_BASE_URL,
    websocketBaseUrl = DEFAULT_WEBSOCKET_BASE_URL,
  }: BinanceAdapterOptions = {}) {
    this.fetchImplementation = fetchImplementation;
    this.createWebSocket = createWebSocket;
    this.restBaseUrl = restBaseUrl.replace(/\/$/, '');
    this.websocketBaseUrl = websocketBaseUrl.replace(/\/$/, '');
  }

  public async fetchCandles(query: CandleQuery): Promise<Candle[]> {
    const url = new URL(`${this.restBaseUrl}/api/v3/klines`);
    url.searchParams.set('symbol', query.pair.toUpperCase());
    url.searchParams.set('interval', BINANCE_TIMEFRAMES[query.timeframe]);
    url.searchParams.set('limit', String(normalizeCandleLimit(query.limit)));

    if (query.startTime !== undefined) {
      url.searchParams.set('startTime', String(query.startTime));
    }
    if (query.endTime !== undefined) {
      url.searchParams.set('endTime', String(query.endTime));
    }

    const response = await this.fetchImplementation(url.toString());
    if (!response.ok) {
      throw new Error(
        `Binance candle request failed with HTTP ${response.status}`,
      );
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Binance candle response was not an array');
    }

    return payload.map((row, index) =>
      normalizeRestKline(row, query.pair, query.timeframe, index),
    );
  }

  public openKlineStream(
    keys: readonly MarketKey[],
    handlers: ExchangeStreamHandlers,
  ): CloseExchangeStream {
    const uniqueKeys = uniqueMarketKeys(keys);
    if (uniqueKeys.length === 0) {
      return () => undefined;
    }

    const streams = uniqueKeys
      .map(
        ({ pair, timeframe }) =>
          `${pair.toLowerCase()}@kline_${BINANCE_TIMEFRAMES[timeframe]}`,
      )
      .join('/');
    const separator = this.websocketBaseUrl.includes('?') ? '&' : '?';
    const socket = this.createWebSocket(
      `${this.websocketBaseUrl}${separator}streams=${streams}`,
    );

    socket.onopen = () => handlers.onStatus?.('LIVE');
    socket.onerror = (error) => handlers.onError?.(error);
    socket.onclose = () => handlers.onStatus?.('RECONNECTING');
    socket.onmessage = (event) => {
      const message = parseMessage(event.data);
      const data = message?.data;
      if (data?.e !== 'kline' || data.k === undefined) return;

      const kline = data.k;
      const pair = stringValue(kline.s ?? data.s).toUpperCase();
      const timeframe = TIMEFRAME_BY_BINANCE_INTERVAL.get(stringValue(kline.i));
      if (timeframe === undefined || pair.length === 0) return;

      handlers.onCandle(
        normalizeKline(
          pair,
          timeframe,
          kline.t,
          kline.T,
          kline.o,
          kline.h,
          kline.l,
          kline.c,
          kline.v,
          kline.x,
        ),
        normalizeUpdateMetadata(data.E),
      );
    };

    return () => socket.close();
  }

  public openTradeStream(
    pairs: readonly Pair[],
    handlers: ExchangeTradeStreamHandlers,
  ): CloseExchangeStream {
    const uniquePairs = uniqueMarketPairs(pairs);
    if (uniquePairs.length === 0) {
      return () => undefined;
    }

    const streams = uniquePairs
      .map((pair) => `${pair.toLowerCase()}@trade`)
      .join('/');
    const separator = this.websocketBaseUrl.includes('?') ? '&' : '?';
    const socket = this.createWebSocket(
      `${this.websocketBaseUrl}${separator}streams=${streams}`,
    );

    socket.onopen = () => handlers.onStatus?.('LIVE');
    socket.onerror = (error) => handlers.onError?.(error);
    socket.onclose = () => handlers.onStatus?.('RECONNECTING');
    socket.onmessage = (event) => {
      const message = parseMessage(event.data);
      const data = message?.data;
      if (data?.e !== 'trade') return;

      const tick = normalizeTrade(data);
      if (tick !== null) handlers.onTick(tick);
    };

    return () => socket.close();
  }
}

function normalizeRestKline(
  row: unknown,
  pair: string,
  timeframe: Timeframe,
  index: number,
): Candle {
  if (!Array.isArray(row) || row.length < 7) {
    throw new Error(`Binance candle row ${index} was malformed`);
  }

  const [openTime, open, high, low, close, volume, closeTime] =
    row as BinanceKlineRow;
  return normalizeKline(
    pair,
    timeframe,
    openTime,
    closeTime,
    open,
    high,
    low,
    close,
    volume,
    Number(closeTime) <= Date.now(),
  );
}

function normalizeKline(
  pair: string,
  timeframe: Timeframe,
  openTime: unknown,
  closeTime: unknown,
  open: unknown,
  high: unknown,
  low: unknown,
  close: unknown,
  volume: unknown,
  isClosed: unknown,
): Candle {
  return {
    pair,
    timeframe,
    openTime: finiteNumber(openTime, 'openTime'),
    closeTime: finiteNumber(closeTime, 'closeTime'),
    open: finiteNumber(open, 'open'),
    high: finiteNumber(high, 'high'),
    low: finiteNumber(low, 'low'),
    close: finiteNumber(close, 'close'),
    volume: finiteNumber(volume, 'volume'),
    isClosed: Boolean(isClosed),
  };
}

function normalizeUpdateMetadata(
  exchangeEventTime: unknown,
): CandleUpdateMetadata {
  if (exchangeEventTime === undefined) return {};
  return { exchangeEventTime: finiteNumber(exchangeEventTime, 'event time') };
}

function normalizeTrade(
  data: NonNullable<BinanceKlineMessage['data']>,
): Tick | null {
  const pair = stringValue(data.s).toUpperCase();
  const tradeId = stringValue(data.t);
  if (
    pair.length === 0 ||
    tradeId.length === 0 ||
    typeof data.m !== 'boolean'
  ) {
    return null;
  }

  try {
    return {
      pair,
      tradeId,
      time: finiteNumber(data.T ?? data.E, 'trade time'),
      price: finiteNumber(data.p, 'trade price'),
      quantity: finiteNumber(data.q, 'trade quantity'),
      side: data.m === true ? 'SELL' : 'BUY',
    };
  } catch {
    return null;
  }
}

function finiteNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Binance ${field} was not a finite number`);
  }
  return number;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function parseMessage(data: unknown): BinanceKlineMessage | null {
  try {
    const text =
      typeof data === 'string'
        ? data
        : data instanceof ArrayBuffer
          ? new TextDecoder().decode(data)
          : '';
    if (text.length === 0) return null;
    const message: unknown = JSON.parse(text);
    return typeof message === 'object' && message !== null
      ? (message as BinanceKlineMessage)
      : null;
  } catch {
    return null;
  }
}

function uniqueMarketKeys(keys: readonly MarketKey[]): MarketKey[] {
  const seen = new Set<string>();
  return keys.filter((key) => {
    const normalized = `${key.pair.toUpperCase()}:${key.timeframe}`;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function uniqueMarketPairs(pairs: readonly Pair[]): Pair[] {
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const normalized = pair.toUpperCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function defaultWebSocketFactory(url: string): BinanceWebSocket {
  const constructor = (
    globalThis as typeof globalThis & {
      WebSocket?: new (url: string) => BinanceWebSocket;
    }
  ).WebSocket;
  if (constructor === undefined) {
    throw new Error('The Node runtime does not provide WebSocket support');
  }
  return new constructor(url) as unknown as BinanceWebSocket;
}
