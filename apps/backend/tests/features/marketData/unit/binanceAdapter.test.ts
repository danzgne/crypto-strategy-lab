import { afterEach, describe, expect, it, vi } from 'vitest';

import { BinanceAdapter } from '../../../../src/api/features/marketData/adapters/binance/binanceAdapter';

class FakeWebSocket {
  public onmessage: ((event: { data: string }) => void) | null = null;

  public onerror: ((event: unknown) => void) | null = null;

  public onclose: (() => void) | null = null;

  public onopen: (() => void) | null = null;

  public readonly close = vi.fn();
}

describe('BinanceAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('normalizes Binance REST klines into canonical candles', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T00:02:00.000Z'));
    const fetchCandles = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        [
          1_756_000_000_000,
          '100.10',
          '101.25',
          '99.75',
          '100.90',
          '12.50',
          1_756_000_059_999,
          '1250.00',
          42,
          '6.25',
          '625.00',
          '0',
        ],
      ],
    });
    const adapter = new BinanceAdapter({
      fetch: fetchCandles,
      restBaseUrl: 'https://binance.test',
    });

    await expect(
      adapter.fetchCandles({ pair: 'BTCUSDT', timeframe: '1m', limit: 1 }),
    ).resolves.toEqual([
      {
        pair: 'BTCUSDT',
        timeframe: '1m',
        openTime: 1_756_000_000_000,
        closeTime: 1_756_000_059_999,
        open: 100.1,
        high: 101.25,
        low: 99.75,
        close: 100.9,
        volume: 12.5,
        isClosed: true,
      },
    ]);
    expect(fetchCandles).toHaveBeenCalledWith(
      'https://binance.test/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=1',
    );
  });

  it('normalizes kline stream messages and hides the Binance envelope', async () => {
    const socket = new FakeWebSocket();
    const createWebSocket = vi.fn(() => socket);
    const onCandle = vi.fn();
    const adapter = new BinanceAdapter({
      createWebSocket,
      websocketBaseUrl: 'wss://binance.test/stream',
    });

    const close = await adapter.openKlineStream(
      [{ pair: 'BTCUSDT', timeframe: '5m' }],
      { onCandle },
    );

    socket.onmessage?.({
      data: JSON.stringify({
        stream: 'btcusdt@kline_5m',
        data: {
          e: 'kline',
          E: 1_756_000_300_123,
          s: 'BTCUSDT',
          k: {
            t: 1_756_000_000_000,
            T: 1_756_000_299_999,
            s: 'BTCUSDT',
            i: '5m',
            o: '100.10',
            c: '100.90',
            h: '101.25',
            l: '99.75',
            v: '12.50',
            x: false,
          },
        },
      }),
    });

    expect(createWebSocket).toHaveBeenCalledWith(
      'wss://binance.test/stream?streams=btcusdt@kline_5m',
    );
    expect(onCandle).toHaveBeenCalledWith(
      {
        pair: 'BTCUSDT',
        timeframe: '5m',
        openTime: 1_756_000_000_000,
        closeTime: 1_756_000_299_999,
        open: 100.1,
        high: 101.25,
        low: 99.75,
        close: 100.9,
        volume: 12.5,
        isClosed: false,
      },
      { exchangeEventTime: 1_756_000_300_123 },
    );

    close();
    expect(socket.close).toHaveBeenCalledOnce();
  });
});
