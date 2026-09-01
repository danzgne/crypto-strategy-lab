import type { Candle } from '@crypto-strategy-lab/shared';
import { describe, expect, it, vi } from 'vitest';

import type { ExchangeAdapter } from '../../../../src/api/features/marketData/application/interfaces/exchangeAdapter.interface';
import { MarketDataService } from '../../../../src/api/features/marketData/application/services/marketDataService';
import { InMemoryDomainEventBus } from '../../../../src/events/inMemoryDomainEventBus';
import { StrategyLiveService } from '../../../../src/api/features/strategies/services/strategyLiveService';
import { StrategyRegistry } from '@crypto-strategy-lab/strategy-engine';

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
  it('assembles a weighted composite from registry-backed strategy versions', async () => {
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
        strategyId: 'composite',
        pair: 'BTCUSDT',
        timeframe: '1m',
        composite: {
          mode: 'weighted',
          members: [
            { strategyId: 'ma', params: { fast: 3, slow: 5 }, weight: 2 },
            { strategyId: 'rsi', params: { period: 2 }, weight: 1 },
          ],
          threshold: 0.3,
        },
      },
      () => undefined,
    );

    expect(subscription.history).toHaveLength(60);
    expect(subscription.history.at(-1)).toMatchObject({
      signal: { action: 'HOLD', strength: 0 },
    });

    await subscription.unsubscribe();
    await strategyLiveService.close();
    await marketDataService.close();
  });

  it('reports a live member evaluation failure without publishing a HOLD signal', async () => {
    const throwingStrategyId = 'throwing-composite-member';
    const safeStrategyId = 'safe-composite-member';
    const failure = new Error('composite member failed');
    const futureOpenTime = START_TIME + 60 * 60_000;
    const throwingAnalyze = vi.fn(
      ({ candles }: { candles: readonly Candle[] }) => {
        if (candles.at(-1)?.openTime === futureOpenTime) throw failure;
        return { action: 'HOLD' as const };
      },
    );
    const createFixtureStrategy = (
      id: string,
      analyze: typeof throwingAnalyze,
    ) => ({
      id,
      params: {},
      requiredHistory: 1,
      analyze,
    });
    StrategyRegistry.register(
      throwingStrategyId,
      Object.assign(
        () => createFixtureStrategy(throwingStrategyId, throwingAnalyze),
        { paramsSchema: { type: 'object' as const, properties: {} } },
      ),
    );
    StrategyRegistry.register(
      safeStrategyId,
      Object.assign(
        () =>
          createFixtureStrategy(
            safeStrategyId,
            vi.fn(() => ({ action: 'HOLD' as const })),
          ),
        { paramsSchema: { type: 'object' as const, properties: {} } },
      ),
    );

    let streamHandlers:
      Parameters<ExchangeAdapter['openKlineStream']>[1] | undefined;
    const initialCandles = Array.from({ length: 60 }, (_, index) =>
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
    const errors: Error[] = [];
    const subscription = await strategyLiveService.subscribe(
      {
        strategyId: 'composite',
        pair: 'BTCUSDT',
        timeframe: '1m',
        composite: {
          mode: 'weighted',
          members: [
            { strategyId: throwingStrategyId },
            { strategyId: safeStrategyId },
          ],
        },
      },
      (update) => updates.push(update),
      (error) => errors.push(error),
    );
    throwingAnalyze.mockClear();

    const futureCandle = makeCandle(60, 11);
    await streamHandlers?.onCandle(futureCandle);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(throwingAnalyze).toHaveBeenCalledOnce();
    expect(errors).toEqual([failure]);
    expect(updates).toEqual([]);

    await subscription.unsubscribe();
    await strategyLiveService.close();
    await service.close();
  });

  it('reports initial-history member evaluation failures without aborting subscription', async () => {
    const throwingStrategyId = 'initial-throwing-composite-member';
    const safeStrategyId = 'initial-safe-composite-member';
    const failure = new Error('initial composite member failed');
    const failedOpenTime = START_TIME + 59 * 60_000;
    const throwingAnalyze = vi.fn(
      ({ candles }: { candles: readonly Candle[] }) => {
        if (candles.at(-1)?.openTime === failedOpenTime) throw failure;
        return { action: 'HOLD' as const };
      },
    );
    const createFixtureStrategy = (
      id: string,
      analyze: typeof throwingAnalyze,
    ) => ({
      id,
      params: {},
      requiredHistory: 1,
      analyze,
    });
    StrategyRegistry.register(
      throwingStrategyId,
      Object.assign(
        () => createFixtureStrategy(throwingStrategyId, throwingAnalyze),
        { paramsSchema: { type: 'object' as const, properties: {} } },
      ),
    );
    StrategyRegistry.register(
      safeStrategyId,
      Object.assign(
        () =>
          createFixtureStrategy(
            safeStrategyId,
            vi.fn(() => ({ action: 'HOLD' as const })),
          ),
        { paramsSchema: { type: 'object' as const, properties: {} } },
      ),
    );

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
    const errors: Error[] = [];
    const subscription = await strategyLiveService.subscribe(
      {
        strategyId: 'composite',
        pair: 'BTCUSDT',
        timeframe: '1m',
        composite: {
          mode: 'weighted',
          members: [
            { strategyId: throwingStrategyId },
            { strategyId: safeStrategyId },
          ],
        },
      },
      () => undefined,
      (error) => errors.push(error),
    );

    expect(errors).toEqual([failure]);
    expect(subscription.history).toHaveLength(59);

    await subscription.unsubscribe();
    await strategyLiveService.close();
    await marketDataService.close();
  });

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

  it('constructs a RuleStrategy from authored params and evaluates it exactly like a hand-written strategy', async () => {
    let streamHandlers:
      Parameters<ExchangeAdapter['openKlineStream']>[1] | undefined;
    const initialCandles = Array.from({ length: 10 }, (_, index) =>
      makeCandle(index, 100),
    );
    const eventBus = new InMemoryDomainEventBus();
    const marketDataService = new MarketDataService({
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
      marketDataService,
    });
    const updates: unknown[] = [];
    const subscription = await strategyLiveService.subscribe(
      {
        strategyId: 'rule',
        pair: 'BTCUSDT',
        timeframe: '1m',
        params: {
          indicators: [{ name: 'RSI', period: 2 }],
          conditions: {
            long: [{ indicator: 'RSI', operator: '<', value: 30 }],
            short: [],
          },
          timeframe: '1m',
        },
      },
      (update) => updates.push(update),
    );

    const dropCandle = makeCandle(10, 50);
    await streamHandlers?.onCandle(dropCandle);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(updates).toEqual([
      {
        pair: 'BTCUSDT',
        timeframe: '1m',
        candle: dropCandle,
        indicators: { RSI: 0 },
        signal: { action: 'BUY', indicators: { RSI: 0 }, reason: 'RSI < 30' },
      },
    ]);

    await subscription.unsubscribe();
    await strategyLiveService.close();
    await marketDataService.close();
  });

  it('rejects a RuleStrategy subscription whose request timeframe does not match its declared timeframe', async () => {
    const eventBus = new InMemoryDomainEventBus();
    const marketDataService = new MarketDataService({
      exchangeAdapter: {
        fetchCandles: async () => [],
        openKlineStream: () => () => undefined,
      },
      candleRepository: { upsertClosed: async () => undefined },
      eventPublisher: eventBus,
    });
    const strategyLiveService = new StrategyLiveService({
      eventBus,
      marketDataService,
    });

    await expect(
      strategyLiveService.subscribe(
        {
          strategyId: 'rule',
          pair: 'BTCUSDT',
          timeframe: '1m',
          params: {
            indicators: [],
            conditions: {
              long: [{ indicator: 'Close', operator: '>', value: 0 }],
              short: [],
            },
            timeframe: '5m',
          },
        },
        () => undefined,
      ),
    ).rejects.toThrow(/timeframe/i);

    await strategyLiveService.close();
    await marketDataService.close();
  });

  it('rejects a RuleStrategy subscription for a pair outside its declared applicability', async () => {
    const eventBus = new InMemoryDomainEventBus();
    const marketDataService = new MarketDataService({
      exchangeAdapter: {
        fetchCandles: async () => [],
        openKlineStream: () => () => undefined,
      },
      candleRepository: { upsertClosed: async () => undefined },
      eventPublisher: eventBus,
    });
    const strategyLiveService = new StrategyLiveService({
      eventBus,
      marketDataService,
    });

    await expect(
      strategyLiveService.subscribe(
        {
          strategyId: 'rule',
          pair: 'BTCUSDT',
          timeframe: '1m',
          params: {
            indicators: [],
            conditions: {
              long: [{ indicator: 'Close', operator: '>', value: 0 }],
              short: [],
            },
            timeframe: '1m',
            applicability: { pairs: ['ETHUSDT'] },
          },
        },
        () => undefined,
      ),
    ).rejects.toThrow(/not applicable/i);

    await strategyLiveService.close();
    await marketDataService.close();
  });

  it('keeps two differently-parameterized RuleStrategy subscriptions on the same pair and timeframe independent', async () => {
    let streamHandlers:
      Parameters<ExchangeAdapter['openKlineStream']>[1] | undefined;
    const initialCandles = Array.from({ length: 10 }, (_, index) =>
      makeCandle(index, 100 + index),
    );
    const eventBus = new InMemoryDomainEventBus();
    const marketDataService = new MarketDataService({
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
      marketDataService,
    });

    const ruleParams = (period: number): unknown => ({
      indicators: [{ name: 'SMA', period }],
      conditions: {
        long: [{ indicator: 'Close', operator: '>', value: 1_000_000 }],
        short: [],
      },
      timeframe: '1m',
    });

    const shortUpdates: unknown[] = [];
    const longUpdates: unknown[] = [];
    const shortPeriod = await strategyLiveService.subscribe(
      {
        strategyId: 'rule',
        pair: 'BTCUSDT',
        timeframe: '1m',
        params: ruleParams(3),
      },
      (update) => shortUpdates.push(update),
    );
    const longPeriod = await strategyLiveService.subscribe(
      {
        strategyId: 'rule',
        pair: 'BTCUSDT',
        timeframe: '1m',
        params: ruleParams(7),
      },
      (update) => longUpdates.push(update),
    );

    await streamHandlers?.onCandle(makeCandle(10, 200));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(shortUpdates).toHaveLength(1);
    expect(longUpdates).toHaveLength(1);
    const shortSma = (shortUpdates[0] as { indicators: Record<string, number> })
      .indicators['SMA'];
    const longSma = (longUpdates[0] as { indicators: Record<string, number> })
      .indicators['SMA'];
    expect(shortSma).toBeDefined();
    expect(longSma).toBeDefined();
    expect(shortSma).not.toEqual(longSma);

    await shortPeriod.unsubscribe();
    await longPeriod.unsubscribe();
    await strategyLiveService.close();
    await marketDataService.close();
  });
});
