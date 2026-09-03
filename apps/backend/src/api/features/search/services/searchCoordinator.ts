import type {
  BestCandidateSummary,
  CandidateStrategy,
  DomainEventEnvelope,
  DomainEventName,
  EnabledStrategyDescriptor,
  EvaluatingCandidateSummary,
  SearchRunStatus,
  SearchSpace,
  StopPolicy,
  StopReason,
  StrategyEvaluatedPayload,
  StrategyGenerator,
  Timeframe,
} from '@crypto-strategy-lab/shared';
import {
  createDomainEvent,
  DEFAULT_STOP_POLICY,
  TIMEFRAME_INTERVAL_MS,
} from '@crypto-strategy-lab/shared';
import { canonicalizeValue } from '@crypto-strategy-lab/shared/strategy';
import { computeStrategyVersionTag } from '@crypto-strategy-lab/shared/strategy-version';
import { StrategyRegistry } from '@crypto-strategy-lab/strategy-engine';
import {
  Prisma,
  type AppPrismaClient,
} from '../../../../database/prismaClient';
import type { BacktestHistoryProvider } from '../../backtests';
import { fingerprintDataset } from '../../backtests';
import type { DomainEventPublisher } from '../../marketData/application/interfaces/domainEventPublisher.interface';
import type { AppLogger } from '../../../../utils/logger';
import {
  RANDOM_GENERATOR_ID,
  StrategyGeneratorRegistry,
  UnsupportedAlgorithmError,
} from '../generators';
import { createSearchRunSeed } from '../generators/randomSource';
import { assertSearchSpaceBacktestable } from './searchSpaceBuilder';

export type SearchEventBus = DomainEventPublisher & {
  subscribe<TName extends DomainEventName>(
    name: TName,
    handler: (event: DomainEventEnvelope<TName>) => void | Promise<void>,
  ): () => void;
};

export interface ResolvedStopPolicy {
  maxCandidates: number;
  timeBudgetMs: number;
  maxNoImprovement: number;
  maxConsecutiveFailures: number;
  maxInFlight: number;
  scoreEpsilon: number;
}

export interface StartSearchRunOptions {
  ownerId: string;
  searchSpace: SearchSpace;
  stopPolicy?: StopPolicy | undefined;
  generator?: StrategyGenerator | undefined;
  algorithmName?: string | undefined;
  seed?: number | undefined;
}

export interface EnqueueJobInput {
  experimentId: string;
  searchRunId: string;
  ownerId: string;
}

export interface SearchCoordinatorProgressEvent {
  searchRunId: string;
  ownerId: string;
  status: SearchRunStatus;
  stopReason: StopReason | null;
  acceptedCandidates: number;
  bestScore: number | null;
  inFlightJobs: number;
  latestCandidate?: EvaluatingCandidateSummary | undefined;
  bestCandidate?: BestCandidateSummary | undefined;
}

export interface SearchCoordinatorDependencies {
  prisma: AppPrismaClient;
  eventBus: SearchEventBus;
  historyProvider?: BacktestHistoryProvider | undefined;
  onProgress?: ((event: SearchCoordinatorProgressEvent) => void) | undefined;
  enqueueJob?: ((input: EnqueueJobInput) => Promise<string>) | undefined;
  logger?: AppLogger | undefined;
}

interface ActiveRunState {
  searchRunId: string;
  ownerId: string;
  searchSpace: SearchSpace;
  stopPolicy: ResolvedStopPolicy;
  generator: StrategyGenerator;
  algorithmName: string;
  seed: number;
  nextGenerationOrdinal: number;
  status: SearchRunStatus;
  stopReason: StopReason | null;
  acceptedCandidates: number;
  bestScore: number | null;
  consecutiveNoImprovement: number;
  consecutiveFailures: number;
  inFlightJobs: number;
  startedAt: number;
  seenFingerprints: Set<string>;
  activeExperimentIds: Set<string>;
  experimentCandidateMap: Map<
    string,
    { name: string; strategyIds: string[]; mode?: 'majority' | 'weighted' }
  >;
  latestCandidate?: EvaluatingCandidateSummary | undefined;
  bestCandidate?: BestCandidateSummary | undefined;
  drainResolvers: (() => void)[];
  inFlightResolvers: (() => void)[];
  datasetSnapshotId?: string | null | undefined;
  timeBudgetTimer?: NodeJS.Timeout | undefined;
}

export class SearchCoordinator {
  private readonly prisma: AppPrismaClient;
  private readonly eventBus: SearchEventBus;
  private readonly historyProvider: BacktestHistoryProvider | undefined;
  private readonly onProgress:
    ((event: SearchCoordinatorProgressEvent) => void) | undefined;
  private readonly enqueueJobFn: (input: EnqueueJobInput) => Promise<string>;
  private readonly logger: SearchCoordinatorDependencies['logger'];
  private readonly activeRuns = new Map<string, ActiveRunState>();
  private unsubscribeEvaluated?: (() => void) | undefined;
  private unsubscribeCompleted?: (() => void) | undefined;

  public constructor(deps: SearchCoordinatorDependencies) {
    this.prisma = deps.prisma;
    this.eventBus = deps.eventBus;
    this.historyProvider = deps.historyProvider;
    this.onProgress = deps.onProgress;
    this.logger = deps.logger;
    this.enqueueJobFn =
      deps.enqueueJob ??
      (async (input: EnqueueJobInput) => {
        const job = await this.prisma.backtestJob.create({
          data: {
            experimentId: input.experimentId,
            ownerId: input.ownerId,
            searchRunId: input.searchRunId,
            status: 'PENDING',
          },
        });
        return job.id;
      });
  }

  public async start(): Promise<void> {
    if (this.unsubscribeEvaluated) return;

    this.unsubscribeEvaluated = this.eventBus.subscribe(
      'StrategyEvaluated',
      (event: DomainEventEnvelope<'StrategyEvaluated'>) =>
        this.handleStrategyEvaluated(event.payload),
    );

    this.unsubscribeCompleted = this.eventBus.subscribe(
      'BacktestCompleted',
      (event: DomainEventEnvelope<'BacktestCompleted'>) =>
        this.handleBacktestCompleted(event.payload.experimentId),
    );

    await this.restoreRunningRuns();
  }

  public stop(): void {
    this.unsubscribeEvaluated?.();
    this.unsubscribeCompleted?.();
    this.unsubscribeEvaluated = undefined;
    this.unsubscribeCompleted = undefined;

    for (const run of this.activeRuns.values()) {
      if (run.timeBudgetTimer) {
        clearTimeout(run.timeBudgetTimer);
        run.timeBudgetTimer = undefined;
      }
    }
  }

  public async startRun(options: StartSearchRunOptions): Promise<string> {
    const algorithmName = options.algorithmName ?? RANDOM_GENERATOR_ID;
    if (!StrategyGeneratorRegistry.has(algorithmName)) {
      throw new UnsupportedAlgorithmError(algorithmName);
    }

    const stopPolicy: ResolvedStopPolicy = {
      maxCandidates:
        options.stopPolicy?.maxCandidates ?? DEFAULT_STOP_POLICY.maxCandidates,
      maxConsecutiveFailures:
        options.stopPolicy?.maxConsecutiveFailures ??
        DEFAULT_STOP_POLICY.maxConsecutiveFailures,
      maxInFlight:
        options.stopPolicy?.maxInFlight ?? DEFAULT_STOP_POLICY.maxInFlight,
      maxNoImprovement:
        options.stopPolicy?.maxNoImprovement ??
        DEFAULT_STOP_POLICY.maxNoImprovement,
      scoreEpsilon:
        options.stopPolicy?.scoreEpsilon ?? DEFAULT_STOP_POLICY.scoreEpsilon,
      timeBudgetMs:
        options.stopPolicy?.timeBudgetMs ?? DEFAULT_STOP_POLICY.timeBudgetMs,
    };

    const timeframe = options.searchSpace.timeframe as Timeframe;
    const interval = TIMEFRAME_INTERVAL_MS[timeframe] ?? 3_600_000;
    const rawEndTime = Number(options.searchSpace.endTime);
    const rawStartTime = Number(options.searchSpace.startTime);
    const alignedEndTime = Math.floor(rawEndTime / interval) * interval;
    let alignedStartTime = Math.floor(rawStartTime / interval) * interval;
    if (alignedStartTime >= alignedEndTime) {
      alignedStartTime = alignedEndTime - 30 * 24 * 60 * 60 * 1000;
      alignedStartTime = Math.floor(alignedStartTime / interval) * interval;
    }
    const seenCanonicalIds = new Set<string>();
    const deduplicatedEnabledStrategies = (
      options.searchSpace.enabledStrategies ?? []
    ).reduce<EnabledStrategyDescriptor[]>((acc, descriptor) => {
      const canonicalId = StrategyRegistry.canonicalId(descriptor.id);
      if (!seenCanonicalIds.has(canonicalId)) {
        seenCanonicalIds.add(canonicalId);
        acc.push({ ...descriptor, id: canonicalId });
      }
      return acc;
    }, []);

    const alignedSearchSpace: SearchSpace = {
      ...options.searchSpace,
      enabledStrategies: deduplicatedEnabledStrategies,
      endTime: alignedEndTime,
      startTime: alignedStartTime,
    };
    assertSearchSpaceBacktestable(alignedSearchSpace);

    const seed = options.seed ?? createSearchRunSeed();
    const generator =
      options.generator ??
      StrategyGeneratorRegistry.create(
        algorithmName,
        alignedSearchSpace,
        seed,
        1,
      );

    let datasetSnapshotId: string | null = null;
    if (this.historyProvider) {
      try {
        const prepared = await this.historyProvider.prepareHistoricalCandles(
          {
            endTime: alignedSearchSpace.endTime,
            pair: alignedSearchSpace.pair,
            startTime: alignedSearchSpace.startTime,
            timeframe: alignedSearchSpace.timeframe,
          },
          200,
          100_000,
        );

        const fingerprint = fingerprintDataset({
          candles: prepared.candles,
          endTime: alignedSearchSpace.endTime,
          pair: alignedSearchSpace.pair,
          startTime: alignedSearchSpace.startTime,
          timeframe: alignedSearchSpace.timeframe,
          warmupCandleCount: prepared.warmupCandleCount,
        });

        const snapshot = await this.prisma.datasetSnapshot?.upsert?.({
          where: { fingerprint },
          create: {
            candles: prepared.candles as unknown as Prisma.InputJsonValue,
            endTime: BigInt(alignedSearchSpace.endTime),
            fingerprint,
            pair: alignedSearchSpace.pair,
            startTime: BigInt(alignedSearchSpace.startTime),
            timeframe: alignedSearchSpace.timeframe,
            warmupCandleCount: prepared.warmupCandleCount,
          },
          update: {},
        });

        datasetSnapshotId = snapshot ? snapshot.id : null;
      } catch (error) {
        this.logger?.warn(
          { error, searchSpace: alignedSearchSpace },
          'Failed to prepare historical dataset for search run via historyProvider',
        );
      }
    }

    if (!datasetSnapshotId && this.prisma.datasetSnapshot?.findFirst) {
      const existing = await this.prisma.datasetSnapshot.findFirst({
        where: {
          endTime: BigInt(alignedSearchSpace.endTime),
          pair: alignedSearchSpace.pair,
          startTime: BigInt(alignedSearchSpace.startTime),
          timeframe: alignedSearchSpace.timeframe,
        },
      });
      if (existing) {
        datasetSnapshotId = existing.id;
      }
    }

    const searchRun = await this.prisma.searchRun.create({
      data: {
        algorithm: algorithmName,
        nextGenerationOrdinal: 1,
        ownerId: options.ownerId,
        searchConfig: {
          searchSpace: alignedSearchSpace,
          stopPolicy,
        } as unknown as Prisma.InputJsonValue,
        seed,
        status: 'RUNNING',
      },
    });

    const runState: ActiveRunState = {
      acceptedCandidates: 0,
      activeExperimentIds: new Set<string>(),
      algorithmName,
      bestScore: null,
      consecutiveFailures: 0,
      consecutiveNoImprovement: 0,
      datasetSnapshotId,
      drainResolvers: [],
      experimentCandidateMap: new Map(),
      generator,
      inFlightJobs: 0,
      inFlightResolvers: [],
      nextGenerationOrdinal: 1,
      ownerId: options.ownerId,
      searchRunId: searchRun.id,
      searchSpace: options.searchSpace,
      seed,
      seenFingerprints: new Set<string>(),
      startedAt: Date.now(),
      status: 'RUNNING',
      stopPolicy,
      stopReason: null,
    };

    runState.timeBudgetTimer = setTimeout(() => {
      void this.transitionToStopping(runState, 'TIME_BUDGET');
    }, stopPolicy.timeBudgetMs);

    this.activeRuns.set(searchRun.id, runState);
    this.notifyProgress(runState);

    // Launch background generation loop
    void this.runGenerationLoop(runState);

    return searchRun.id;
  }

  public async stopRun(
    searchRunId: string,
    reason: StopReason = 'USER_STOPPED',
  ): Promise<void> {
    const run = this.activeRuns.get(searchRunId);
    if (!run || run.status !== 'RUNNING') return;

    await this.transitionToStopping(run, reason);
  }

  public getRun(searchRunId: string): ActiveRunState | undefined {
    return this.activeRuns.get(searchRunId);
  }

  public async waitForRunCompletion(searchRunId: string): Promise<{
    id: string;
    ownerId: string;
    status: SearchRunStatus;
    stopReason: StopReason | null;
    acceptedCandidates: number;
    bestScore: number | null;
    startedAt: number;
  }> {
    const run = this.activeRuns.get(searchRunId);
    if (!run) {
      const dbRun = await this.prisma.searchRun.findUnique({
        where: { id: searchRunId },
      });
      if (!dbRun) {
        throw new Error(`SearchRun not found: ${searchRunId}`);
      }
      return {
        acceptedCandidates: dbRun.acceptedCandidates,
        bestScore: dbRun.bestScore ? Number(dbRun.bestScore) : null,
        id: dbRun.id,
        ownerId: dbRun.ownerId,
        startedAt: dbRun.startedAt.getTime(),
        status: dbRun.status as SearchRunStatus,
        stopReason: dbRun.stopReason as StopReason | null,
      };
    }

    if (run.status === 'COMPLETED' || run.status === 'FAILED') {
      return {
        acceptedCandidates: run.acceptedCandidates,
        bestScore: run.bestScore,
        id: run.searchRunId,
        ownerId: run.ownerId,
        startedAt: run.startedAt,
        status: run.status,
        stopReason: run.stopReason,
      };
    }

    await new Promise<void>((resolve) => {
      run.drainResolvers.push(resolve);
    });

    return {
      acceptedCandidates: run.acceptedCandidates,
      bestScore: run.bestScore,
      id: run.searchRunId,
      ownerId: run.ownerId,
      startedAt: run.startedAt,
      status: run.status,
      stopReason: run.stopReason,
    };
  }

  private async runGenerationLoop(run: ActiveRunState): Promise<void> {
    const { maxCandidates, maxInFlight, timeBudgetMs } = run.stopPolicy;

    try {
      while (run.status === 'RUNNING') {
        // Check time budget
        if (Date.now() - run.startedAt >= timeBudgetMs) {
          await this.transitionToStopping(run, 'TIME_BUDGET');
          break;
        }

        // Check candidate cap
        if (run.acceptedCandidates >= maxCandidates) {
          await this.transitionToStopping(run, 'CANDIDATE_CAP');
          break;
        }

        // Backpressure check
        if (run.inFlightJobs >= maxInFlight) {
          await new Promise<void>((resolve) => {
            run.inFlightResolvers.push(resolve);
          });
          continue;
        }

        // Generate candidate
        let candidate: CandidateStrategy;
        try {
          candidate = run.generator.generate();
        } catch (error) {
          this.logger?.error(
            { error, searchRunId: run.searchRunId },
            'Generator failed',
          );
          await this.transitionToStopping(run, 'CONSECUTIVE_FAILURES');
          break;
        }

        // The ordinal advances for every attempt, including candidates discarded below.
        run.nextGenerationOrdinal = candidate.provenance.generationOrdinal + 1;
        await this.prisma.searchRun.update({
          data: {
            nextGenerationOrdinal: run.nextGenerationOrdinal,
            updatedAt: new Date(),
          },
          where: { id: run.searchRunId },
        });

        // Discard candidate if applicability conflicts with run searchSpace
        if (this.hasApplicabilityConflict(candidate, run.searchSpace)) {
          await new Promise((r) => setTimeout(r, 0));
          continue;
        }

        // Discard duplicates
        if (run.seenFingerprints.has(candidate.fingerprint)) {
          await new Promise((r) => setTimeout(r, 0));
          continue;
        }

        // Candidate accepted
        run.seenFingerprints.add(candidate.fingerprint);

        const success = await this.persistAndEnqueueCandidate(run, candidate);
        if (!success) {
          continue;
        }

        run.acceptedCandidates++;
        run.inFlightJobs++;

        await this.prisma.searchRun.update({
          data: {
            acceptedCandidates: run.acceptedCandidates,
            inFlightJobs: run.inFlightJobs,
            updatedAt: new Date(),
          },
          where: { id: run.searchRunId },
        });

        this.notifyProgress(run);

        // Check candidate cap immediately after incrementing
        if (run.acceptedCandidates >= maxCandidates) {
          await this.transitionToStopping(run, 'CANDIDATE_CAP');
          break;
        }
      }
    } catch (error) {
      this.logger?.error(
        { error, searchRunId: run.searchRunId },
        'Error in search generation loop',
      );
      await this.transitionToStopping(run, 'CONSECUTIVE_FAILURES');
    }
  }

  private hasApplicabilityConflict(
    candidate: CandidateStrategy,
    searchSpace: SearchSpace,
  ): boolean {
    for (const params of candidate.parameterSnapshots) {
      if (typeof params === 'object' && params !== null) {
        const declaredTf = (params as Record<string, unknown>).timeframe;
        if (
          typeof declaredTf === 'string' &&
          declaredTf !== searchSpace.timeframe
        ) {
          return true;
        }
        const app = (params as Record<string, unknown>).applicability;
        if (app && typeof app === 'object') {
          const pairs = (app as Record<string, unknown>).pairs;
          if (Array.isArray(pairs) && !pairs.includes(searchSpace.pair)) {
            return true;
          }
          if (typeof pairs === 'string' && pairs !== searchSpace.pair) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private async persistAndEnqueueCandidate(
    run: ActiveRunState,
    candidate: CandidateStrategy,
  ): Promise<boolean> {
    try {
      const { experimentId } = await this.prisma.$transaction(
        async (transaction: Prisma.TransactionClient) => {
          const strategyVersion = await this.findOrCreateStrategyVersion(
            transaction,
            run.ownerId,
            candidate,
          );

          const experiment = await transaction.experiment.create({
            data: {
              ...(run.datasetSnapshotId
                ? { datasetSnapshotId: run.datasetSnapshotId }
                : {}),
              endTime: BigInt(run.searchSpace.endTime),
              evaluatorVersion: 'default-v1',
              fingerprint: candidate.fingerprint,
              initialInvestment: run.searchSpace.initialInvestment ?? '10000',
              ownerId: run.ownerId,
              pair: run.searchSpace.pair,
              searchRunId: run.searchRunId,
              simulationRulesVersion: 'historical-v1',
              slippage: run.searchSpace.slippage ?? '5',
              startTime: BigInt(run.searchSpace.startTime),
              strategyVersionId: strategyVersion.id,
              timeframe: run.searchSpace.timeframe,
              transactionCost: run.searchSpace.transactionCost ?? '0.0008',
            },
          });

          return {
            experimentId: experiment.id,
            strategyVersionId: strategyVersion.id,
          };
        },
      );

      await this.enqueueJobFn({
        experimentId,
        ownerId: run.ownerId,
        searchRunId: run.searchRunId,
      });

      run.activeExperimentIds.add(experimentId);

      const isComposite = candidate.strategyIds.length > 1;
      const candidateName = isComposite
        ? `Composite (${candidate.combinationConfig?.mode ?? 'majority'})`
        : (candidate.strategyIds[0]?.toUpperCase() ?? 'UNKNOWN');

      const evaluatingSummary: EvaluatingCandidateSummary = {
        ...(candidate.combinationConfig?.mode
          ? { mode: candidate.combinationConfig.mode }
          : {}),
        name: candidateName,
        pair: run.searchSpace.pair,
        strategyIds: [...candidate.strategyIds],
        timeframe: run.searchSpace.timeframe,
      };
      run.latestCandidate = evaluatingSummary;
      run.experimentCandidateMap.set(experimentId, {
        ...(candidate.combinationConfig?.mode
          ? { mode: candidate.combinationConfig.mode }
          : {}),
        name: candidateName,
        strategyIds: [...candidate.strategyIds],
      });

      // Emit StrategyGenerated domain event after persistence and enqueue succeed
      await this.eventBus.publish(
        createDomainEvent('StrategyGenerated', {
          candidateId: candidate.fingerprint,
          searchRunId: run.searchRunId,
        }),
      );

      return true;
    } catch (error) {
      this.logger?.error(
        { error, searchRunId: run.searchRunId },
        'Failed to persist and enqueue candidate',
      );
      return false;
    }
  }

  private async findOrCreateStrategyVersion(
    transaction: Prisma.TransactionClient,
    ownerId: string,
    candidate: CandidateStrategy,
  ) {
    const isComposite = candidate.strategyIds.length > 1;
    const strategyId = isComposite
      ? 'composite'
      : (candidate.strategyIds[0] ?? 'unknown');

    let resolvedParams: Record<string, unknown>;
    if (isComposite) {
      resolvedParams = {
        members: candidate.strategyIds.map((id, index) => ({
          params: candidate.parameterSnapshots[index] ?? {},
          strategyId: id,
          ...(candidate.combinationConfig?.weights
            ? { weight: candidate.combinationConfig.weights[index] }
            : {}),
        })),
        mode: candidate.combinationConfig?.mode ?? 'majority',
        ...(candidate.combinationConfig?.threshold !== undefined
          ? { threshold: candidate.combinationConfig.threshold }
          : {}),
      };
    } else {
      resolvedParams = { ...(candidate.parameterSnapshots[0] ?? {}) };
    }

    const canonicalIdentity = `private:${canonicalizeValue({
      params: resolvedParams,
      strategyId,
    })}`;

    const existing = await transaction.strategyVersion.findFirst({
      where: {
        canonicalIdentity,
        ownerId,
      },
    });

    if (existing) {
      return existing;
    }

    const definition = await transaction.strategyDefinition.create({
      data: {
        name: `${strategyId} search candidate`,
        ownerId,
        recordKind: 'SEARCH_CANDIDATE',
        source: 'USER_PROMPT',
        sourceInput: `Generated search candidate (${candidate.provenance.algorithm})`,
        tags: ['search-generated'],
        type: strategyId,
      },
    });

    return transaction.strategyVersion.create({
      data: {
        canonicalIdentity,
        libraryVersion: '1.0.0',
        ownerId,
        params: resolvedParams as Prisma.InputJsonValue,
        strategyDefinitionId: definition.id,
        versionTag: computeStrategyVersionTag(strategyId, resolvedParams),
      },
    });
  }

  public async handleStrategyEvaluated(
    payload: StrategyEvaluatedPayload,
  ): Promise<void> {
    for (const run of this.activeRuns.values()) {
      if (run.activeExperimentIds.has(payload.experimentId)) {
        run.activeExperimentIds.delete(payload.experimentId);
        run.inFlightJobs = Math.max(0, run.inFlightJobs - 1);
        run.consecutiveFailures = 0; // reset by any successful evaluation

        const score = Number(payload.score);
        const { maxNoImprovement, scoreEpsilon } = run.stopPolicy;

        const isNewBest =
          run.bestScore === null || score > run.bestScore + scoreEpsilon;

        if (isNewBest) {
          run.bestScore = score;
          run.consecutiveNoImprovement = 0;
          const candidateInfo = run.experimentCandidateMap.get(
            payload.experimentId,
          );
          run.bestCandidate = {
            experimentId: payload.experimentId,
            maxDrawdown:
              payload.maxDrawdown !== undefined
                ? Number(payload.maxDrawdown)
                : undefined,
            mode: candidateInfo?.mode,
            name: candidateInfo?.name ?? 'Best Strategy',
            profit:
              payload.totalProfit !== undefined
                ? Number(payload.totalProfit)
                : undefined,
            returnPct:
              payload.return !== undefined ? Number(payload.return) : undefined,
            score,
            strategyIds: candidateInfo?.strategyIds ?? [],
            winRate:
              payload.winRate !== undefined
                ? Number(payload.winRate)
                : undefined,
          };
        } else {
          run.consecutiveNoImprovement++;
        }

        if (
          run.status === 'RUNNING' &&
          run.consecutiveNoImprovement >= maxNoImprovement
        ) {
          await this.transitionToStopping(run, 'NO_IMPROVEMENT');
        }

        await this.prisma.searchRun.update({
          data: {
            bestScore: run.bestScore,
            consecutiveFailures: run.consecutiveFailures,
            consecutiveNoImprovement: run.consecutiveNoImprovement,
            inFlightJobs: run.inFlightJobs,
            updatedAt: new Date(),
          },
          where: { id: run.searchRunId },
        });

        this.notifyProgress(run);
        this.notifyInFlightAvailable(run);
        await this.checkTerminalState(run);
      }
    }
  }

  public async handleBacktestCompleted(experimentId: string): Promise<void> {
    for (const run of this.activeRuns.values()) {
      if (run.activeExperimentIds.has(experimentId)) {
        // Check if the job actually failed
        const job = await this.prisma.backtestJob.findFirst({
          select: { status: true },
          where: { experimentId },
        });

        if (job && job.status === 'FAILED') {
          run.activeExperimentIds.delete(experimentId);
          run.inFlightJobs = Math.max(0, run.inFlightJobs - 1);
          run.consecutiveFailures++;

          if (
            run.status === 'RUNNING' &&
            run.consecutiveFailures >= run.stopPolicy.maxConsecutiveFailures
          ) {
            await this.transitionToStopping(run, 'CONSECUTIVE_FAILURES');
          }

          await this.prisma.searchRun.update({
            data: {
              consecutiveFailures: run.consecutiveFailures,
              inFlightJobs: run.inFlightJobs,
              updatedAt: new Date(),
            },
            where: { id: run.searchRunId },
          });

          this.notifyProgress(run);
          this.notifyInFlightAvailable(run);
          await this.checkTerminalState(run);
        }
      }
    }
  }

  private async transitionToStopping(
    run: ActiveRunState,
    reason: StopReason,
  ): Promise<void> {
    if (run.status !== 'RUNNING') return;

    if (run.timeBudgetTimer) {
      clearTimeout(run.timeBudgetTimer);
      run.timeBudgetTimer = undefined;
    }

    run.status = 'STOPPING';
    run.stopReason = reason;

    await this.prisma.searchRun.update({
      data: {
        status: 'STOPPING',
        stopReason: reason,
        updatedAt: new Date(),
      },
      where: { id: run.searchRunId },
    });

    this.notifyProgress(run);
    this.notifyInFlightAvailable(run);
    await this.checkTerminalState(run);
  }

  private async checkTerminalState(run: ActiveRunState): Promise<void> {
    if (run.status === 'STOPPING' && run.inFlightJobs === 0) {
      const terminalStatus: SearchRunStatus =
        run.stopReason === 'CONSECUTIVE_FAILURES' ? 'FAILED' : 'COMPLETED';

      run.status = terminalStatus;

      await this.prisma.searchRun.update({
        data: {
          status: terminalStatus,
          stopReason: run.stopReason,
          stoppedAt: new Date(),
          updatedAt: new Date(),
        },
        where: { id: run.searchRunId },
      });

      this.notifyProgress(run);

      for (const resolver of run.drainResolvers) {
        resolver();
      }
      run.drainResolvers = [];
    }
  }

  private notifyProgress(run: ActiveRunState): void {
    this.onProgress?.({
      acceptedCandidates: run.acceptedCandidates,
      bestCandidate: run.bestCandidate,
      bestScore: run.bestScore,
      inFlightJobs: run.inFlightJobs,
      latestCandidate: run.latestCandidate,
      ownerId: run.ownerId,
      searchRunId: run.searchRunId,
      status: run.status,
      stopReason: run.stopReason,
    });
  }

  private notifyInFlightAvailable(run: ActiveRunState): void {
    const resolvers = [...run.inFlightResolvers];
    run.inFlightResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  }

  private async restoreRunningRuns(): Promise<void> {
    const runs = await this.prisma.searchRun.findMany({
      where: {
        status: {
          in: ['RUNNING', 'STOPPING'],
        },
      },
    });

    for (const record of runs) {
      const searchConfig = record.searchConfig as Record<string, unknown>;
      const searchSpace = searchConfig.searchSpace as SearchSpace;
      const rawPolicy = (searchConfig.stopPolicy ?? {}) as StopPolicy;
      const stopPolicy: ResolvedStopPolicy = {
        maxCandidates:
          rawPolicy.maxCandidates ?? DEFAULT_STOP_POLICY.maxCandidates,
        maxConsecutiveFailures:
          rawPolicy.maxConsecutiveFailures ??
          DEFAULT_STOP_POLICY.maxConsecutiveFailures,
        maxInFlight: rawPolicy.maxInFlight ?? DEFAULT_STOP_POLICY.maxInFlight,
        maxNoImprovement:
          rawPolicy.maxNoImprovement ?? DEFAULT_STOP_POLICY.maxNoImprovement,
        scoreEpsilon:
          rawPolicy.scoreEpsilon ?? DEFAULT_STOP_POLICY.scoreEpsilon,
        timeBudgetMs:
          rawPolicy.timeBudgetMs ?? DEFAULT_STOP_POLICY.timeBudgetMs,
      };

      const experiments = await this.prisma.experiment.findMany({
        select: {
          backtestJob: { select: { status: true } },
          datasetSnapshotId: true,
          fingerprint: true,
          id: true,
          score: true,
        },
        where: { searchRunId: record.id },
      });

      const seenFingerprints = new Set<string>();
      const activeExperimentIds = new Set<string>();
      let inFlight = 0;
      let restoredDatasetSnapshotId: string | null | undefined = undefined;

      for (const exp of experiments) {
        if (exp.datasetSnapshotId && !restoredDatasetSnapshotId) {
          restoredDatasetSnapshotId = exp.datasetSnapshotId;
        }
        if (exp.fingerprint) {
          seenFingerprints.add(exp.fingerprint);
        }
        if (
          exp.backtestJob &&
          (exp.backtestJob.status === 'PENDING' ||
            exp.backtestJob.status === 'CLAIMED')
        ) {
          activeExperimentIds.add(exp.id);
          inFlight++;
        }
      }

      if (!StrategyGeneratorRegistry.has(record.algorithm)) {
        this.logger?.error(
          { algorithm: record.algorithm, searchRunId: record.id },
          'Cannot restore SearchRun: algorithm is no longer registered',
        );
        await this.prisma.searchRun.update({
          data: {
            status: 'FAILED',
            stoppedAt: new Date(),
            updatedAt: new Date(),
          },
          where: { id: record.id },
        });
        continue;
      }

      const generator = StrategyGeneratorRegistry.create(
        record.algorithm,
        searchSpace,
        record.seed,
        record.nextGenerationOrdinal,
      );

      const runState: ActiveRunState = {
        acceptedCandidates: record.acceptedCandidates,
        activeExperimentIds,
        algorithmName: record.algorithm,
        bestScore: record.bestScore ? Number(record.bestScore) : null,
        consecutiveFailures: record.consecutiveFailures,
        consecutiveNoImprovement: record.consecutiveNoImprovement,
        datasetSnapshotId: restoredDatasetSnapshotId,
        drainResolvers: [],
        experimentCandidateMap: new Map(),
        generator,
        inFlightJobs: inFlight,
        inFlightResolvers: [],
        nextGenerationOrdinal: record.nextGenerationOrdinal,
        ownerId: record.ownerId,
        searchRunId: record.id,
        searchSpace,
        seed: record.seed,
        seenFingerprints,
        startedAt: record.startedAt.getTime(),
        status: record.status as SearchRunStatus,
        stopPolicy,
        stopReason: record.stopReason as StopReason | null,
      };

      this.activeRuns.set(record.id, runState);

      if (record.status === 'RUNNING') {
        void this.runGenerationLoop(runState);
      } else if (record.status === 'STOPPING') {
        await this.checkTerminalState(runState);
      }
    }
  }
}
