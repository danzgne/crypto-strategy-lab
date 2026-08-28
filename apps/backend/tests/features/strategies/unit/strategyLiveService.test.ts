import type { Candle } from '@crypto-strategy-lab/shared';
import { describe, expect, it, vi } from 'vitest';

import type { ExchangeAdapter } from '../../../../src/api/features/marketData/application/interfaces/exchangeAdapter.interface';
import { MarketDataService } from '../../../../src/api/features/marketData/application/services/marketDataService';
import { InMemoryDomainEventBus } from '../../../../src/events/inMemoryDomainEventBus';
import { StrategyLiveService } from '../../../../src/api/features/strategies/services/strategyLiveService';

const START_TIME = 1_756_000_000_000;

function makeCandle(index: number, close: number): Candle {
  const openTime = START_TIME + index * 60_000;
  return {
    pair: 'BTCUSDT',
    timeframe: '1m',
    openTime,
    closeTime: openTime + 59_999,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10 + index,
    isClosed: true,
  };
}

describe('StrategyLiveService', () => {
  it('returns indicator history for the existing closed candles on subscribe', async () => {
    const initialCandles = Array.from({ length: 60 }, (_, index) =>
      makeCandle(index, 10),
    );
    const eventBus = new InMemoryDomainEventBus();
    const marketDataService = new MarketDataService({
      exchangeAdapter: {
        fetchCandles: async () => initialCandles,
        openKlineStream: (_keys, _handlers) => () => undefined,
      },
      candleRepository: { upsertClosed: async () => undefined },
      eventPublisher: eventBus,
    });
    const strategyLiveService = new StrategyLiveService({
      eventBus,
      marketDataService,
    });

    const subscription = await strategyLiveService.subscribe(
      {
        strategyId: 'ma',
        pair: 'BTCUSDT',
        timeframe: '1m',
        limit: 60,
      },
      () => undefined,
    );

    expect(subscription.history).toHaveLength(60);
    expect(subscription.history.at(-1)).toMatchObject({
      candle: initialCandles.at(-1),
      indicators: { MA_20: 10, MA_50: 10 },
      signal: {
        action: 'HOLD',
        indicators: { MA_20: 10, MA_50: 10 },
      },
    });

    await subscription.unsubscribe();
    await strategyLiveService.close();
    await marketDataService.close();
  });

  it('backfills older candles before creating the indicator snapshot', async () => {
    const olderCandles = Array.from({ length: 10 }, (_, index) =>
      makeCandle(index, 10),
    );
    const recentCandles = Array.from({ length: 50 }, (_, index) =>
      makeCandle(index + 10, 10),
    );
    const loadHistoryBefore = vi.fn(async () => olderCandles);
    const marketDataService = {
      loadHistoryBefore,
      subscribe: vi.fn(async () => ({
        candles: recentCandles,
        unsubscribe: async () => undefined,
      })),
    } as unknown as MarketDataService;
    const strategyLiveService = new StrategyLiveService({
      eventBus: new InMemoryDomainEventBus(),
      marketDataService,
    });

    const subscription = await strategyLiveService.subscribe(
      {
        strategyId: 'ma',
        pair: 'BTCUSDT',
        timeframe: '1m',
        limit: 60,
      },
      () => undefined,
    );

    expect(loadHistoryBefore).toHaveBeenCalledOnce();
    expect(subscription.history).toHaveLength(60);
    expect(subscription.history.at(-1)).toMatchObject({
      candle: recentCandles.at(-1),
      indicators: { MA_20: 10, MA_50: 10 },
    });

    await subscription.unsubscribe();
    await strategyLiveService.close();
  });

  it('evaluates MA exactly once per closed candle and emits the combined signal payload', async () => {
    let streamHandlers:
      Parameters<ExchangeAdapter['openKlineStream']>[1] | undefined;
    const initialCandles = Array.from({ length: 50 }, (_, index) =>
      makeCandle(index, 10),
    );
    const eventBus = new InMemoryDomainEventBus();
    const service = new MarketDataService({
      exchangeAdapter: {
        fetchCandles: async () => initialCandles,
        openKlineStream: (_keys, handlers) => {
          streamHandlers = handlers;
          return () => undefined;
        },
      },
      candleRepository: { upsertClosed: async () => undefined },
      eventPublisher: eventBus,
    });
    const strategyLiveService = new StrategyLiveService({
      eventBus,
      marketDataService: service,
    });
    const updates: unknown[] = [];
    const subscription = await strategyLiveService.subscribe(
      { strategyId: 'ma', pair: 'BTCUSDT', timeframe: '1m' },
      (update) => updates.push(update),
    );

    const crossingCandle = makeCandle(50, 12);
    const result = streamHandlers?.onCandle(crossingCandle);
    await result;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const duplicateResult = streamHandlers?.onCandle(crossingCandle);
    await duplicateResult;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(updates).toEqual([
      {
        pair: 'BTCUSDT',
        timeframe: '1m',
        candle: crossingCandle,
        indicators: { MA_20: 10.1, MA_50: 10.04 },
        signal: {
          action: 'BUY',
          indicators: { MA_20: 10.1, MA_50: 10.04 },
        },
      },
    ]);

    await subscription.unsubscribe();
    await strategyLiveService.close();
    await service.close();
  });
});
