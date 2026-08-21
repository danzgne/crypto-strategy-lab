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

export interface ServerToClientEvents {
  'market-data:status': (status: MarketDataTransportStatus) => void;
}

export interface ClientToServerEvents {
  'market-data:ping': (
    ping: MarketDataPing,
    acknowledge: (pong: MarketDataPong) => void,
  ) => void;
}

export type InterServerEvents = Record<never, never>;

export interface SocketData {
  requestId?: string;
}
