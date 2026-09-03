import type { Candle } from '@crypto-strategy-lab/shared';
import { StrategyRegistry } from '@crypto-strategy-lab/strategy-engine';
import { describe, expect, it, vi } from 'vitest';

import {
  BacktestService,
  BacktestValidationError,
} from '../../../../src/api/features/backtests';
import type {
  BacktestHistoryProvider,
  BacktestRepository,
} from '../../../../src/api/features/backtests';

const candles: Candle[] = [candle(0), candle(60_000), candle(120_000)];

describe('BacktestService', () => {
  it('prepares a closed dataset and enqueues an owner-scoped experiment', async () => {
    const repository = createRepository();
    const historyProvider: BacktestHistoryProvider = {
      prepareHistoricalCandles: vi.fn().mockResolvedValue({
        candles,
        selectedCandles: candles,
        warmupCandleCount: 0,
      }),
    };
    const service = new BacktestService({ historyProvider, repository });

    const result = await service.submit('owner-1', {
      endTime: 180_000,
      initialInvestment: '1000',
      pair: 'btcusdt',
      params: { fast: 2, slow: 3 },
      slippage: '5',
      startTime: 0,
      strategyId: 'ma',
      timeframe: '1m',
      transactionCost: '0.0008',
    });
    await service.stop();

    expect(result).toEqual({
      experimentId: 'experiment-1',
      jobId: 'job-1',
      status: 'queued',
    });
    expect(historyProvider.prepareHistoricalCandles).toHaveBeenCalledWith(
      { endTime: 180_000, pair: 'BTCUSDT', startTime: 0, timeframe: '1m' },
      4,
      100_000,
    );
    expect(repository.createSubmission).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({
        buildRevision: expect.any(String),
        evaluatorVersion: 'default-v1',
        initialInvestment: '1000',
        pair: 'BTCUSDT',
        simulationRulesVersion: 'historical-v1',
        slippage: 5,
        strategyImplementationVersion: 'ma-v1',
        transactionCost: '0.0008',
      }),
    );
    expect(repository.attachDataset).toHaveBeenCalledWith(
      'owner-1',
      'experiment-1',
      expect.objectContaining({
        fingerprint: expect.any(String),
        warmupCandleCount: 0,
      }),
    );
  });

  it('returns the queued resource while slow historical preparation continues', async () => {
    let resolvePreparation!: (value: {
      candles: Candle[];
      selectedCandles: Candle[];
      warmupCandleCount: number;
    }) => void;
    const preparation = new Promise<{
      candles: Candle[];
      selectedCandles: Candle[];
      warmupCandleCount: number;
    }>((resolve) => {
      resolvePreparation = resolve;
    });
    const repository = createRepository();
    const historyProvider: BacktestHistoryProvider = {
      prepareHistoricalCandles: vi.fn().mockReturnValue(preparation),
    };
    const service = new BacktestService({ historyProvider, repository });

    const submission = service.submit('owner-1', {
      endTime: 180_000,
      initialInvestment: '1000',
      pair: 'BTCUSDT',
      params: { fast: 2, slow: 3 },
      slippage: '5',
      startTime: 0,
      strategyId: 'ma',
      timeframe: '1m',
      transactionCost: '0.0008',
    });
    const timeout = Symbol('submission-timeout');
    const result = await Promise.race([
      submission,
      new Promise<typeof timeout>((resolve) =>
        setTimeout(() => resolve(timeout), 100),
      ),
    ]);

    expect(result).not.toBe(timeout);
    expect(result).toMatchObject({
      experimentId: 'experiment-1',
      status: 'queued',
    });

    resolvePreparation({
      candles,
      selectedCandles: candles,
      warmupCandleCount: 0,
    });
    await service.stop();
  });

  it('records a historical preparation failure on the queued resource', async () => {
    const repository = createRepository();
    const historyProvider: BacktestHistoryProvider = {
      prepareHistoricalCandles: vi
        .fn()
        .mockRejectedValue(new Error('exchange history unavailable')),
    };
    const service = new BacktestService({ historyProvider, repository });

    await service.submit('owner-1', {
      endTime: 180_000,
      initialInvestment: '1000',
      pair: 'BTCUSDT',
      params: { fast: 2, slow: 3 },
      slippage: '5',
      startTime: 0,
      strategyId: 'ma',
      timeframe: '1m',
      transactionCost: '0.0008',
    });
    await service.stop();

    expect(repository.failPreparation).toHaveBeenCalledWith(
      'owner-1',
      'experiment-1',
      'exchange history unavailable',
    );
  });

  it('resumes queued dataset preparation after a backend restart', async () => {
    const repository = createRepository();
    vi.mocked(repository.findPendingSubmissions).mockResolvedValue([
      {
        endTime: 180_000,
        experimentId: 'experiment-1',
        ownerId: 'owner-1',
        pair: 'BTCUSDT',
        startTime: 0,
        strategyVersion: {
          canonicalIdentity: null,
          id: 'version-1',
          params: { fast: 2, slow: 3 },
          strategyId: 'ma',
        },
        timeframe: '1m',
      },
    ]);
    const historyProvider: BacktestHistoryProvider = {
      prepareHistoricalCandles: vi.fn().mockResolvedValue({
        candles,
        selectedCandles: candles,
        warmupCandleCount: 0,
      }),
    };
    const service = new BacktestService({ historyProvider, repository });

    await service.start();
    await service.stop();

    expect(historyProvider.prepareHistoricalCandles).toHaveBeenCalledWith(
      { endTime: 180_000, pair: 'BTCUSDT', startTime: 0, timeframe: '1m' },
      4,
      100_000,
    );
    expect(repository.attachDataset).toHaveBeenCalledWith(
      'owner-1',
      'experiment-1',
      expect.objectContaining({ fingerprint: expect.any(String) }),
    );
  });

  it('rejects unsupported pairs and misaligned ranges before fetching data', async () => {
    const historyProvider: BacktestHistoryProvider = {
      prepareHistoricalCandles: vi.fn(),
    };
    const service = new BacktestService({
      historyProvider,
      repository: createRepository(),
    });

    await expect(
      service.submit('owner-1', {
        endTime: 180_001,
        initialInvestment: 1000,
        pair: 'BTCUSD',
        slippage: 0,
        startTime: 1,
        strategyId: 'ma',
        timeframe: '1m',
        transactionCost: 0,
      }),
    ).rejects.toBeInstanceOf(BacktestValidationError);
    expect(historyProvider.prepareHistoricalCandles).not.toHaveBeenCalled();
  });

  it('rejects a manual submission whose Strategy has no registered implementation version', async () => {
    StrategyRegistry.register(
      'issue90-unversioned-fixture',
      Object.assign(
        () => ({
          analyze: () => ({ action: 'HOLD' as const }),
          id: 'issue90-unversioned-fixture',
          params: {},
          requiredHistory: 1,
        }),
        { paramsSchema: { properties: {}, type: 'object' as const } },
      ),
    );

    const historyProvider: BacktestHistoryProvider = {
      prepareHistoricalCandles: vi.fn(),
    };
    const service = new BacktestService({
      historyProvider,
      repository: createRepository(),
    });

    await expect(
      service.submit('owner-1', {
        endTime: 180_000,
        initialInvestment: '1000',
        pair: 'BTCUSDT',
        slippage: '5',
        startTime: 0,
        strategyId: 'issue90-unversioned-fixture',
        timeframe: '1m',
        transactionCost: '0.0008',
      }),
    ).rejects.toMatchObject({
      code: 'STRATEGY_IMPLEMENTATION_UNAVAILABLE',
    });
    expect(historyProvider.prepareHistoricalCandles).not.toHaveBeenCalled();
  });

  it('returns selected candles, trades, and only the public six-card metrics in a result DTO', async () => {
    const repository = createRepository();
    repository.findResource = vi.fn().mockResolvedValue({
      candles,
      datasetFingerprint: 'fingerprint',
      endTime: 180_000,
      evaluatorVersion: 'default-v1',
      experimentId: 'experiment-1',
      failureReason: null,
      initialInvestment: '1000',
      jobId: 'job-1',
      metrics: {
        losses: 0,
        maxDrawdown: '0',
        maxDrawdownAmount: '0',
        profitFactor: '0',
        profitFactorInfinite: true,
        return: '0.1',
        score: '0.4',
        sharpeRatio: '0',
        totalProfit: '100',
        totalTrades: 1,
        winRate: '1',
        wins: 1,
      },
      pair: 'BTCUSDT',
      simulationRulesVersion: 'historical-v1',
      slippage: '5',
      startTime: 0,
      status: 'completed',
      strategyId: 'ma',
      strategyParams: { fast: 2, slow: 3 },
      strategyVersionId: 'version-1',
      timeframe: '1m',
      trades: [],
      transactionCost: '0.0008',
    });
    const service = new BacktestService({
      historyProvider: {
        prepareHistoricalCandles: vi.fn(),
      },
      repository,
    });

    const result = await service.get('owner-1', 'experiment-1');

    expect(result).toMatchObject({
      candles: expect.arrayContaining([
        expect.objectContaining({ close: '100', openTime: 0 }),
      ]),
      metrics: {
        maxDrawdown: '0',
        profitFactor: null,
        profitFactorInfinite: true,
        totalTrades: 1,
        winRate: '1',
      },
      status: 'completed',
    });
    expect(result?.metrics).not.toHaveProperty('ranking');
  });

  it('shapes complete typed provenance for a fully reproducible manual Experiment', async () => {
    const repository = createRepository();
    repository.findResource = vi.fn().mockResolvedValue({
      buildRevision: 'abc1234',
      candles: [],
      datasetFingerprint: 'fingerprint',
      endTime: 180_000,
      evaluatorVersion: 'default-v1',
      experimentId: 'experiment-1',
      failureReason: null,
      generationOrdinal: null,
      generatorAlgorithm: null,
      generatorSeed: null,
      generatorVersion: null,
      initialInvestment: '1000',
      jobId: 'job-1',
      metrics: null,
      pair: 'BTCUSDT',
      searchRunId: null,
      simulationRulesVersion: 'historical-v1',
      slippage: '5',
      startTime: 0,
      status: 'queued',
      strategyId: 'ma',
      strategyImplementationVersion: 'ma-v1',
      strategyParams: { fast: 2, slow: 3 },
      strategyVersionId: 'version-1',
      timeframe: '1m',
      trades: [],
      transactionCost: '0.0008',
    });
    const service = new BacktestService({
      historyProvider: { prepareHistoricalCandles: vi.fn() },
      repository,
    });

    const result = await service.get('owner-1', 'experiment-1');

    expect(result?.provenance).toEqual({
      buildRevision: 'abc1234',
      datasetSnapshotFingerprint: 'fingerprint',
      evaluatorVersion: 'default-v1',
      generator: null,
      reproducible: true,
      simulationRulesVersion: 'historical-v1',
      strategyImplementationVersion: 'ma-v1',
      strategyParams: { fast: 2, slow: 3 },
      strategyVersionId: 'version-1',
    });
  });

  it('exposes generator provenance for a searched Experiment and marks it reproducible', async () => {
    const repository = createRepository();
    repository.findResource = vi.fn().mockResolvedValue({
      buildRevision: 'abc1234',
      candles: [],
      datasetFingerprint: 'fingerprint',
      endTime: 180_000,
      evaluatorVersion: 'default-v1',
      experimentId: 'experiment-1',
      failureReason: null,
      generationOrdinal: 3,
      generatorAlgorithm: 'random',
      generatorSeed: 42,
      generatorVersion: 'random-v1',
      initialInvestment: '1000',
      jobId: 'job-1',
      metrics: null,
      pair: 'BTCUSDT',
      searchRunId: 'search-run-1',
      simulationRulesVersion: 'historical-v1',
      slippage: '5',
      startTime: 0,
      status: 'queued',
      strategyId: 'ma',
      strategyImplementationVersion: 'ma-v1',
      strategyParams: { fast: 2, slow: 3 },
      strategyVersionId: 'version-1',
      timeframe: '1m',
      trades: [],
      transactionCost: '0.0008',
    });
    const service = new BacktestService({
      historyProvider: { prepareHistoricalCandles: vi.fn() },
      repository,
    });

    const result = await service.get('owner-1', 'experiment-1');

    expect(result?.provenance.generator).toEqual({
      algorithm: 'random',
      generationOrdinal: 3,
      seed: 42,
      version: 'random-v1',
    });
    expect(result?.provenance.reproducible).toBe(true);
  });

  it('marks a legacy Experiment predating provenance tracking as not reproducible', async () => {
    const repository = createRepository();
    repository.findResource = vi.fn().mockResolvedValue({
      buildRevision: null,
      candles: [],
      datasetFingerprint: 'fingerprint',
      endTime: 180_000,
      evaluatorVersion: 'default-v1',
      experimentId: 'experiment-1',
      failureReason: null,
      generationOrdinal: null,
      generatorAlgorithm: null,
      generatorSeed: null,
      generatorVersion: null,
      initialInvestment: '1000',
      jobId: 'job-1',
      metrics: null,
      pair: 'BTCUSDT',
      searchRunId: null,
      simulationRulesVersion: 'historical-v1',
      slippage: '5',
      startTime: 0,
      status: 'queued',
      strategyId: 'ma',
      strategyImplementationVersion: null,
      strategyParams: { fast: 2, slow: 3 },
      strategyVersionId: 'version-1',
      timeframe: '1m',
      trades: [],
      transactionCost: '0.0008',
    });
    const service = new BacktestService({
      historyProvider: { prepareHistoricalCandles: vi.fn() },
      repository,
    });

    const result = await service.get('owner-1', 'experiment-1');

    expect(result?.provenance.reproducible).toBe(false);
  });

  it('marks a searched Experiment missing generator provenance as not reproducible even with other versions present', async () => {
    const repository = createRepository();
    repository.findResource = vi.fn().mockResolvedValue({
      buildRevision: 'abc1234',
      candles: [],
      datasetFingerprint: 'fingerprint',
      endTime: 180_000,
      evaluatorVersion: 'default-v1',
      experimentId: 'experiment-1',
      failureReason: null,
      generationOrdinal: null,
      generatorAlgorithm: null,
      generatorSeed: null,
      generatorVersion: null,
      initialInvestment: '1000',
      jobId: 'job-1',
      metrics: null,
      pair: 'BTCUSDT',
      searchRunId: 'search-run-1',
      simulationRulesVersion: 'historical-v1',
      slippage: '5',
      startTime: 0,
      status: 'queued',
      strategyId: 'ma',
      strategyImplementationVersion: 'ma-v1',
      strategyParams: { fast: 2, slow: 3 },
      strategyVersionId: 'version-1',
      timeframe: '1m',
      trades: [],
      transactionCost: '0.0008',
    });
    const service = new BacktestService({
      historyProvider: { prepareHistoricalCandles: vi.fn() },
      repository,
    });

    const result = await service.get('owner-1', 'experiment-1');

    expect(result?.provenance.reproducible).toBe(false);
  });

  it('returns the owner-scoped history summaries from the repository', async () => {
    const repository = createRepository();
    repository.findHistory = vi.fn().mockResolvedValue([
      {
        createdAt: 1_000,
        endTime: 180_000,
        experimentId: 'experiment-1',
        failureReason: null,
        jobId: 'job-1',
        metrics: {
          return: '0.1',
          totalProfit: '100',
          totalTrades: 2,
          winRate: '0.5',
        },
        pair: 'BTCUSDT',
        startTime: 0,
        status: 'completed',
        strategyId: 'ma',
        strategyName: 'Moving Average',
        strategyVersionId: 'version-1',
        timeframe: '1m',
      },
    ]);
    const service = new BacktestService({
      historyProvider: {
        prepareHistoricalCandles: vi.fn(),
      },
      repository,
    });

    await expect(service.list('owner-1')).resolves.toEqual([
      expect.objectContaining({ experimentId: 'experiment-1' }),
    ]);
    expect(repository.findHistory).toHaveBeenCalledWith('owner-1');
  });
});

function createRepository(): BacktestRepository {
  return {
    attachDataset: vi.fn().mockResolvedValue(true),
    createSubmission: vi.fn().mockResolvedValue({
      experimentId: 'experiment-1',
      jobId: 'job-1',
      strategyVersionId: 'version-1',
    }),
    failPreparation: vi.fn().mockResolvedValue(true),
    findHistory: vi.fn().mockResolvedValue([]),
    findPendingSubmissions: vi.fn().mockResolvedValue([]),
    findResource: vi.fn().mockResolvedValue(null),
    findStrategyVersion: vi.fn().mockResolvedValue(null),
  };
}

function candle(openTime: number): Candle {
  return {
    close: 100,
    closeTime: openTime + 59_999,
    high: 101,
    isClosed: true,
    low: 99,
    open: 100,
    openTime,
    pair: 'BTCUSDT',
    timeframe: '1m',
    volume: 10,
  };
}
