import { createHash } from 'node:crypto';

import type {
  BacktestHistoryResponse,
  BacktestProvenanceResponse,
  BacktestResultResponse,
  BacktestSubmissionResponse,
  Candle,
  CompositeStrategyRequest,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import {
  CURRENT_EVALUATOR_VERSION,
  CURRENT_SIMULATION_RULES_VERSION,
  resolveBuildRevision,
  TIMEFRAME_INTERVAL_MS,
} from '@crypto-strategy-lab/shared';
import { canonicalizeValue } from '@crypto-strategy-lab/shared/strategy';
import {
  assertStrategyApplicable,
  assertStrategyBacktestable,
  CombinationEngine,
  resolveStrategyImplementationVersion,
  StrategyRegistry,
  strategyVersionIdentity,
  type CompositeStrategy,
  type Strategy,
} from '@crypto-strategy-lab/strategy-engine';

import { AppError } from '@/errors/AppError';
import type {
  BacktestHistoryProvider,
  BacktestRepository,
  BacktestSubmissionInput,
  PendingBacktestSubmission,
  PreparedDataset,
  ResolvedBacktestTarget,
  StoredBacktestResource,
  StoredStrategyVersion,
} from '../types';
import type { BacktestServiceInterface } from './interfaces/backtestService.interface';
import type { AppLogger } from '@/utils/logger';

const DEFAULT_MAX_SELECTED_CANDLES = 100_000;

export class BacktestValidationError extends AppError {
  public constructor(message: string, code = 'INVALID_BACKTEST_REQUEST') {
    super(message, 400, code);
  }
}

export interface BacktestServiceDependencies {
  repository: BacktestRepository;
  historyProvider: BacktestHistoryProvider;
  combinationEngine?: CombinationEngine;
  logger?: AppLogger;
  maxSelectedCandles?: number;
}

export class BacktestService implements BacktestServiceInterface {
  private readonly combinationEngine: CombinationEngine;

  private readonly maxSelectedCandles: number;

  private readonly preparationTasks = new Set<Promise<void>>();

  private acceptingPreparations = true;

  public constructor(
    private readonly dependencies: BacktestServiceDependencies,
  ) {
    this.combinationEngine =
      dependencies.combinationEngine ?? new CombinationEngine();
    this.maxSelectedCandles = resolveMaxSelectedCandles(
      dependencies.maxSelectedCandles,
    );
  }

  public async start(): Promise<void> {
    this.acceptingPreparations = true;
    const pendingSubmissions =
      await this.dependencies.repository.findPendingSubmissions();
    for (const pending of pendingSubmissions) {
      this.schedulePreparation(() => this.preparePendingSubmission(pending));
    }
  }

  public async stop(): Promise<void> {
    this.acceptingPreparations = false;
    await Promise.allSettled([...this.preparationTasks]);
  }

  public async submit(
    ownerId: string,
    request: unknown,
  ): Promise<BacktestSubmissionResponse> {
    const normalized = normalizeSubmission(request);
    const target = await this.resolveTarget(
      ownerId,
      normalized.target,
      normalized.pair,
      normalized.timeframe,
    );
    try {
      assertStrategyBacktestable(target.strategy);
    } catch (error) {
      throw new BacktestValidationError(
        error instanceof Error ? error.message : 'Strategy is live-only',
        'STRATEGY_LIVE_ONLY',
      );
    }
    try {
      assertStrategyApplicable(
        target.strategy,
        normalized.pair,
        normalized.timeframe,
      );
    } catch (error) {
      throw new BacktestValidationError(
        error instanceof Error ? error.message : 'Strategy is not applicable',
        'STRATEGY_NOT_APPLICABLE',
      );
    }

    const interval = TIMEFRAME_INTERVAL_MS[normalized.timeframe];
    const selectedCandleCount =
      (normalized.endTime - normalized.startTime) / interval;
    if (selectedCandleCount > this.maxSelectedCandles) {
      throw new BacktestValidationError(
        `Backtest range contains ${selectedCandleCount} candles; maximum is ${this.maxSelectedCandles}`,
        'BACKTEST_RANGE_TOO_LARGE',
      );
    }

    let strategyImplementationVersion: string;
    try {
      strategyImplementationVersion = resolveStrategyImplementationVersion(
        target.strategyId,
        target.strategyId === 'composite'
          ? (target.strategy as CompositeStrategy).members.map(
              (member) => member.strategyId,
            )
          : undefined,
      );
    } catch (error) {
      throw new BacktestValidationError(
        error instanceof Error
          ? error.message
          : 'Strategy implementation is not registered',
        'STRATEGY_IMPLEMENTATION_UNAVAILABLE',
      );
    }

    const input: BacktestSubmissionInput = {
      buildRevision: resolveBuildRevision(),
      endTime: normalized.endTime,
      evaluatorVersion: CURRENT_EVALUATOR_VERSION,
      initialInvestment: normalized.initialInvestment,
      pair: normalized.pair,
      simulationRulesVersion: CURRENT_SIMULATION_RULES_VERSION,
      slippage: normalized.slippage,
      startTime: normalized.startTime,
      strategyImplementationVersion,
      target,
      timeframe: normalized.timeframe,
      transactionCost: normalized.transactionCost,
    };
    const created = await this.dependencies.repository.createSubmission(
      ownerId,
      input,
    );
    this.schedulePreparation(() =>
      this.prepareDataset({
        endTime: normalized.endTime,
        experimentId: created.experimentId,
        ownerId,
        pair: normalized.pair,
        requiredHistory: target.requiredHistory,
        startTime: normalized.startTime,
        timeframe: normalized.timeframe,
      }),
    );
    return {
      experimentId: created.experimentId,
      jobId: created.jobId,
      status: 'queued',
    };
  }

  public async get(
    ownerId: string,
    experimentId: string,
  ): Promise<BacktestResultResponse | null> {
    if (!isNonEmptyString(experimentId)) return null;
    const resource = await this.dependencies.repository.findResource(
      ownerId,
      experimentId,
    );
    if (resource === null) return null;

    return {
      candles: resource.candles.map(toCandleResponse),
      datasetFingerprint: resource.datasetFingerprint,
      endTime: resource.endTime,
      evaluatorVersion: resource.evaluatorVersion,
      experimentId: resource.experimentId,
      failureReason: resource.failureReason,
      initialInvestment: resource.initialInvestment,
      jobId: resource.jobId,
      metrics:
        resource.metrics === null
          ? null
          : {
              maxDrawdown: resource.metrics.maxDrawdown,
              maxDrawdownAmount: resource.metrics.maxDrawdownAmount,
              profitFactor: resource.metrics.profitFactorInfinite
                ? null
                : resource.metrics.profitFactor,
              profitFactorInfinite: resource.metrics.profitFactorInfinite,
              return: resource.metrics.return,
              score: resource.metrics.score,
              sharpeRatio: resource.metrics.sharpeRatio,
              totalProfit: resource.metrics.totalProfit,
              totalTrades: resource.metrics.totalTrades,
              winRate: String(resource.metrics.winRate),
              wins: resource.metrics.wins,
              losses: resource.metrics.losses,
            },
      pair: resource.pair,
      provenance: toProvenance(resource),
      simulationRulesVersion: resource.simulationRulesVersion,
      slippage: resource.slippage,
      startTime: resource.startTime,
      status: resource.status,
      strategyId: resource.strategyId,
      strategyParams: resource.strategyParams,
      strategyVersionId: resource.strategyVersionId,
      timeframe: resource.timeframe,
      trades: resource.trades.map((trade) => ({
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        entryTime: trade.entryTime,
        exitPrice: trade.exitPrice,
        exitReason: trade.exitReason,
        exitTime: trade.exitTime,
        id: trade.id,
        investment: trade.investment,
        pair: trade.pair,
        profit: trade.profit,
        slippage: trade.slippage,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        transactionCost: trade.transactionCost,
      })),
      transactionCost: resource.transactionCost,
    };
  }

  public list(ownerId: string): Promise<BacktestHistoryResponse> {
    return this.dependencies.repository.findHistory(ownerId);
  }

  private async preparePendingSubmission(
    pending: PendingBacktestSubmission,
  ): Promise<void> {
    try {
      const strategy = this.createStrategyFromStoredVersion(
        pending.strategyVersion,
        pending.pair,
        pending.timeframe,
      );
      await this.prepareDataset({
        endTime: pending.endTime,
        experimentId: pending.experimentId,
        ownerId: pending.ownerId,
        pair: pending.pair,
        requiredHistory: strategy.requiredHistory,
        startTime: pending.startTime,
        timeframe: pending.timeframe,
      });
    } catch (error) {
      await this.recordPreparationFailure(
        pending.ownerId,
        pending.experimentId,
        toPreparationError(error),
      );
    }
  }

  private async prepareDataset(
    request: DatasetPreparationRequest,
  ): Promise<void> {
    try {
      const prepared =
        await this.dependencies.historyProvider.prepareHistoricalCandles(
          {
            endTime: request.endTime,
            pair: request.pair,
            startTime: request.startTime,
            timeframe: request.timeframe,
          },
          request.requiredHistory,
          this.maxSelectedCandles,
        );
      const dataset: PreparedDataset = {
        candles: prepared.candles,
        endTime: request.endTime,
        fingerprint: fingerprintDataset({
          candles: prepared.candles,
          endTime: request.endTime,
          pair: request.pair,
          startTime: request.startTime,
          timeframe: request.timeframe,
          warmupCandleCount: prepared.warmupCandleCount,
        }),
        pair: request.pair,
        startTime: request.startTime,
        timeframe: request.timeframe,
        warmupCandleCount: prepared.warmupCandleCount,
      };
      await this.dependencies.repository.attachDataset(
        request.ownerId,
        request.experimentId,
        dataset,
      );
    } catch (error) {
      await this.recordPreparationFailure(
        request.ownerId,
        request.experimentId,
        toPreparationError(error),
      );
    }
  }

  private schedulePreparation(taskFactory: () => Promise<void>): void {
    if (!this.acceptingPreparations) return;
    const task = taskFactory();
    this.preparationTasks.add(task);
    void task
      .finally(() => this.preparationTasks.delete(task))
      .catch(() => undefined);
  }

  private async recordPreparationFailure(
    ownerId: string,
    experimentId: string,
    error: Error,
  ): Promise<void> {
    try {
      const recorded = await this.dependencies.repository.failPreparation(
        ownerId,
        experimentId,
        error.message,
      );
      if (recorded) {
        this.dependencies.logger?.error(
          { err: error, experimentId, ownerId },
          'Backtest dataset preparation failed',
        );
      }
    } catch (persistenceError: unknown) {
      this.dependencies.logger?.error(
        { err: persistenceError, experimentId, ownerId },
        'Backtest dataset preparation failure could not be recorded',
      );
    }
  }

  private async resolveTarget(
    ownerId: string,
    request: NormalizedTarget,
    pair: string,
    timeframe: Timeframe,
  ): Promise<ResolvedBacktestTarget> {
    if (request.strategyVersionId !== undefined) {
      const stored = await this.dependencies.repository.findStrategyVersion(
        ownerId,
        request.strategyVersionId,
      );
      if (stored === null) {
        throw new BacktestValidationError(
          'Strategy version was not found in the current owner scope',
          'STRATEGY_VERSION_NOT_FOUND',
        );
      }
      const strategy = this.createStrategyFromStoredVersion(
        stored,
        pair,
        timeframe,
      );
      return {
        canonicalIdentity:
          stored.canonicalIdentity ?? strategyVersionIdentity(strategy),
        params: stored.params,
        requiredHistory: strategy.requiredHistory,
        strategy,
        strategyId: stored.strategyId,
        strategyVersionId: stored.id,
      };
    }

    if (request.composite !== undefined) {
      const strategy = this.createComposite(request.composite, pair, timeframe);
      return {
        canonicalIdentity: strategyVersionIdentity(strategy),
        params: compositeRequestFromStrategy(strategy),
        requiredHistory: strategy.requiredHistory,
        strategy,
        strategyId: 'composite',
      };
    }

    const strategyId = request.strategyId;
    if (strategyId === undefined) {
      throw new BacktestValidationError('A backtest target is required');
    }
    let strategy: Strategy;
    try {
      strategy = StrategyRegistry.create(strategyId, request.params);
    } catch (error) {
      throw new BacktestValidationError(
        error instanceof Error ? error.message : 'Strategy parameters invalid',
        'INVALID_STRATEGY',
      );
    }
    return {
      canonicalIdentity: strategyVersionIdentity(strategy),
      params: strategy.params,
      requiredHistory: strategy.requiredHistory,
      strategy,
      strategyId,
    };
  }

  private createStrategyFromStoredVersion(
    version: StoredStrategyVersion,
    pair: string,
    timeframe: Timeframe,
  ): Strategy {
    if (version.strategyId !== 'composite') {
      try {
        return StrategyRegistry.create(version.strategyId, version.params);
      } catch (error) {
        throw new BacktestValidationError(
          error instanceof Error
            ? error.message
            : 'Stored strategy version invalid',
          'INVALID_STRATEGY_VERSION',
        );
      }
    }
    if (!isCompositeRequest(version.params)) {
      throw new BacktestValidationError(
        'Stored composite strategy version is invalid',
        'INVALID_STRATEGY_VERSION',
      );
    }
    return this.createComposite(version.params, pair, timeframe);
  }

  private createComposite(
    request: CompositeStrategyRequest,
    pair?: string,
    timeframe?: Timeframe,
  ): CompositeStrategy {
    if (!Array.isArray(request.members) || request.members.length < 2) {
      throw new BacktestValidationError(
        'A composite backtest target requires at least two strategy members',
        'INVALID_COMPOSITE',
      );
    }
    try {
      const members = request.members.map((member) => {
        if (!isNonEmptyString(member.strategyId)) {
          throw new Error('Composite member strategyId is required');
        }
        const strategy = StrategyRegistry.create(
          member.strategyId,
          member.params,
        );
        assertStrategyBacktestable(strategy);
        if (pair !== undefined && timeframe !== undefined) {
          try {
            assertStrategyApplicable(strategy, pair, timeframe);
          } catch (error) {
            throw new BacktestValidationError(
              error instanceof Error
                ? error.message
                : 'Composite member is not applicable',
              'STRATEGY_NOT_APPLICABLE',
            );
          }
        }
        return member.weight === undefined
          ? { strategy }
          : { strategy, weight: member.weight };
      });
      return this.combinationEngine.assemble({
        members,
        mode: request.mode,
        ...(request.threshold === undefined
          ? {}
          : { threshold: request.threshold }),
        ...(request.stopLoss === undefined
          ? {}
          : { stopLoss: request.stopLoss }),
        ...(request.takeProfit === undefined
          ? {}
          : { takeProfit: request.takeProfit }),
      });
    } catch (error) {
      if (error instanceof BacktestValidationError) throw error;
      throw new BacktestValidationError(
        error instanceof Error ? error.message : 'Composite strategy invalid',
        'INVALID_COMPOSITE',
      );
    }
  }
}

interface NormalizedTarget {
  strategyVersionId?: string;
  strategyId?: string;
  params?: unknown;
  composite?: CompositeStrategyRequest;
}

interface NormalizedSubmission {
  target: NormalizedTarget;
  pair: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  initialInvestment: string;
  transactionCost: string;
  slippage: number;
}

function normalizeSubmission(request: unknown): NormalizedSubmission {
  if (!isRecord(request)) {
    throw new BacktestValidationError('Backtest request must be an object');
  }
  const rawTarget = isRecord(request.target) ? request.target : request;
  const pair = normalizePair(request.pair);
  const timeframe = normalizeTimeframe(request.timeframe);
  const startTime = parseTimestamp(request.startTime, 'startTime');
  const endTime = parseTimestamp(request.endTime, 'endTime');
  const interval = TIMEFRAME_INTERVAL_MS[timeframe];
  if (startTime >= endTime) {
    throw new BacktestValidationError('startTime must be before endTime');
  }
  if (startTime % interval !== 0 || endTime % interval !== 0) {
    throw new BacktestValidationError(
      `${timeframe} backtest boundaries must align to UTC candle opens`,
      'BACKTEST_RANGE_NOT_ALIGNED',
    );
  }
  const initialInvestment = parseFiniteDecimal(
    request.initialInvestment,
    'initialInvestment',
  );
  if (initialInvestment.value <= 0) {
    throw new BacktestValidationError('initialInvestment must be positive');
  }
  const transactionCost = parseFiniteDecimal(
    request.transactionCost,
    'transactionCost',
  );
  if (transactionCost.value < 0 || transactionCost.value >= 1) {
    throw new BacktestValidationError(
      'transactionCost must be in the ratio range [0, 1)',
    );
  }
  const slippage = parseFiniteNumber(request.slippage, 'slippage');
  if (!Number.isInteger(slippage) || slippage < 0 || slippage >= 10_000) {
    throw new BacktestValidationError(
      'slippage must be an integer number of basis points in [0, 10000)',
    );
  }

  const target = normalizeTarget(rawTarget);
  return {
    endTime,
    initialInvestment: initialInvestment.text,
    pair,
    slippage,
    startTime,
    target,
    timeframe,
    transactionCost: transactionCost.text,
  };
}

function normalizeTarget(target: Record<string, unknown>): NormalizedTarget {
  const strategyVersionId = optionalString(target.strategyVersionId);
  const strategyId = optionalString(target.strategyId);
  const composite =
    target.composite === undefined
      ? undefined
      : parseComposite(target.composite);
  if (strategyId === 'composite' && composite === undefined) {
    throw new BacktestValidationError(
      'Composite strategyId requires a composite definition',
      'INVALID_COMPOSITE',
    );
  }
  const sourceCount =
    Number(strategyVersionId !== undefined) +
    Number(composite !== undefined) +
    Number(strategyId !== undefined && strategyId !== 'composite');
  if (sourceCount !== 1) {
    throw new BacktestValidationError(
      'Choose exactly one strategyVersionId, strategyId, or composite target',
    );
  }
  return {
    ...(composite === undefined ? {} : { composite }),
    ...(strategyId === undefined ? {} : { strategyId }),
    ...(strategyVersionId === undefined ? {} : { strategyVersionId }),
    ...(target.params === undefined ? {} : { params: target.params }),
  };
}

function parseComposite(value: unknown): CompositeStrategyRequest {
  if (!isRecord(value) || !Array.isArray(value.members)) {
    throw new BacktestValidationError(
      'Composite target must include a members array',
      'INVALID_COMPOSITE',
    );
  }
  return value as unknown as CompositeStrategyRequest;
}

function normalizePair(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BacktestValidationError('pair is required');
  }
  const pair = value.trim().toUpperCase();
  if (!/^[A-Z0-9]+USDT$/.test(pair) || pair === 'USDT') {
    throw new BacktestValidationError(
      'Only USDT quote pairs are supported',
      'PAIR_NOT_SUPPORTED',
    );
  }
  return pair;
}

function normalizeTimeframe(value: unknown): Timeframe {
  if (typeof value !== 'string' || !(value in TIMEFRAME_INTERVAL_MS)) {
    throw new BacktestValidationError(
      'timeframe must be one of 1m, 5m, 15m, 1h, 4h, or 1d',
    );
  }
  return value as Timeframe;
}

function parseTimestamp(value: unknown, name: string): number {
  const parsed = parseFiniteNumber(value, name);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new BacktestValidationError(
      `${name} must be a non-negative integer timestamp`,
    );
  }
  return parsed;
}

function parseFiniteNumber(value: unknown, name: string): number {
  if (value === '' || value === null || value === undefined) {
    throw new BacktestValidationError(`${name} is required`);
  }
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new BacktestValidationError(`${name} must be a finite number`);
  }
  return parsed;
}

interface ParsedDecimal {
  value: number;
  text: string;
}

function parseFiniteDecimal(value: unknown, name: string): ParsedDecimal {
  if (value === '' || value === null || value === undefined) {
    throw new BacktestValidationError(`${name} is required`);
  }
  const text =
    typeof value === 'number'
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  const parsed = text.length === 0 ? Number.NaN : Number(text);
  if (!Number.isFinite(parsed)) {
    throw new BacktestValidationError(`${name} must be a finite number`);
  }
  return { text, value: parsed };
}

function resolveMaxSelectedCandles(value: number | undefined): number {
  const resolved = value ?? DEFAULT_MAX_SELECTED_CANDLES;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error('maxSelectedCandles must be a positive integer');
  }
  return resolved;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!isNonEmptyString(value)) {
    throw new BacktestValidationError(
      'Strategy identifiers must be non-empty strings',
    );
  }
  return value.trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCompositeRequest(value: unknown): value is CompositeStrategyRequest {
  return isRecord(value) && Array.isArray(value.members);
}

function compositeRequestFromStrategy(
  strategy: CompositeStrategy,
): CompositeStrategyRequest {
  return {
    members: strategy.members.map((member) => ({
      params: member.params,
      strategyId: member.strategyId,
      weight: member.weight,
    })),
    mode: strategy.mode,
    threshold: strategy.threshold,
    ...(strategy.stopLoss === undefined ? {} : { stopLoss: strategy.stopLoss }),
    ...(strategy.takeProfit === undefined
      ? {}
      : { takeProfit: strategy.takeProfit }),
  };
}

interface DatasetFingerprintInput {
  pair: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  warmupCandleCount: number;
  candles: readonly Candle[];
}

interface DatasetPreparationRequest {
  ownerId: string;
  experimentId: string;
  pair: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  requiredHistory: number;
}

export function fingerprintDataset(input: DatasetFingerprintInput): string {
  return createHash('sha256').update(canonicalizeValue(input)).digest('hex');
}

function toPreparationError(error: unknown): Error {
  if (error instanceof BacktestValidationError) return error;
  return new BacktestValidationError(
    error instanceof Error
      ? error.message
      : 'Historical candles could not be prepared',
    'BACKTEST_DATASET_INVALID',
  );
}

function toProvenance(
  resource: StoredBacktestResource,
): BacktestProvenanceResponse {
  const generator =
    resource.generatorAlgorithm !== null &&
    resource.generatorVersion !== null &&
    resource.generatorSeed !== null &&
    resource.generationOrdinal !== null
      ? {
          algorithm: resource.generatorAlgorithm,
          generationOrdinal: resource.generationOrdinal,
          seed: resource.generatorSeed,
          version: resource.generatorVersion,
        }
      : null;

  // A legacy Experiment (created before provenance tracking) is never fully reproducible,
  // even once its terminal job completes; that fact must never be papered over.
  const reproducible =
    resource.strategyImplementationVersion !== null &&
    resource.buildRevision !== null &&
    (resource.searchRunId === null || generator !== null);

  return {
    buildRevision: resource.buildRevision,
    datasetSnapshotFingerprint: resource.datasetFingerprint,
    evaluatorVersion: resource.evaluatorVersion,
    generator,
    reproducible,
    simulationRulesVersion: resource.simulationRulesVersion,
    strategyImplementationVersion: resource.strategyImplementationVersion,
    strategyParams: resource.strategyParams,
    strategyVersionId: resource.strategyVersionId,
  };
}

function toCandleResponse(candle: Candle) {
  return {
    close: String(candle.close),
    closeTime: candle.closeTime,
    high: String(candle.high),
    isClosed: candle.isClosed,
    low: String(candle.low),
    open: String(candle.open),
    openTime: candle.openTime,
    pair: candle.pair,
    timeframe: candle.timeframe,
    volume: String(candle.volume),
  };
}
