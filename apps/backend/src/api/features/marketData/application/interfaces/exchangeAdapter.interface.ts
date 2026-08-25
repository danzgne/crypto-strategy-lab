import type {
  Candle,
  CandleQuery,
  CandleUpdateMetadata,
  MarketKey,
} from '@crypto-strategy-lab/shared';

export type ExchangeStreamStatus = 'LIVE' | 'RECONNECTING' | 'STALE';

export interface ExchangeStreamHandlers {
  onCandle(candle: Candle, metadata?: CandleUpdateMetadata): void;
  onError?(error: unknown): void;
  onStatus?(status: ExchangeStreamStatus): void;
}

export type CloseExchangeStream = () => void | Promise<void>;

export interface ExchangeAdapter {
  fetchCandles(query: CandleQuery): Promise<Candle[]>;
  openKlineStream(
    keys: readonly MarketKey[],
    handlers: ExchangeStreamHandlers,
  ): Promise<CloseExchangeStream> | CloseExchangeStream;
}
