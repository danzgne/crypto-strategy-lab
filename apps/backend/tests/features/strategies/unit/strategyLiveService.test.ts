import type { Candle } from '@crypto-strategy-lab/shared';
import { describe, expect, it } from 'vitest';

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
