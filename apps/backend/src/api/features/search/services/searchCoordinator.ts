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
  CURRENT_EVALUATOR_VERSION,
  CURRENT_SIMULATION_RULES_VERSION,
  DEFAULT_STOP_POLICY,
  isVersionMember,
  resolveBuildRevision,
  searchSpaceMemberKey,
  TIMEFRAME_INTERVAL_MS,
} from '@crypto-strategy-lab/shared';
import {
  canonicalizeValue,
  pairMatchesRuleApplicability,
} from '@crypto-strategy-lab/shared/strategy';
import type { RuleApplicability } from '@crypto-strategy-lab/shared/strategy';
import { computeStrategyVersionTag } from '@crypto-strategy-lab/shared/strategy-version';
import {
  resolveStrategyImplementationVersion,
  StrategyRegistry,
} from '@crypto-strategy-lab/strategy-engine';
import {
  Prisma,
  type AppPrismaClient,
} from '../../../../database/prismaClient';
import type { BacktestHistoryProvider } from '../../backtests';
import { fingerprintDataset } from '../../backtests';
import type { DomainEventPublisher } from '../../marketData/application/interfaces/domainEventPublisher.interface';
import type { AppLogger } from '../../../../utils/logger';
import {
  algorithmFamilyName,
  RANDOM_GENERATOR_ID,
  StrategyGeneratorRegistry,
  UnsupportedAlgorithmError,
} from '../generators';
import { createSearchRunSeed } from '../generators/randomSource';
import { assertSearchSpaceBacktestable } from './searchSpaceBuilder';

export class DatasetSnapshotPreparationError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DatasetSnapshotPreparationError';
  }
}

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

// Runs inside the same transaction as Experiment creation, for atomicity.
export type EnqueueJobFn = (
  transaction: Prisma.TransactionClient,
  input: EnqueueJobInput,
) => Promise<string>;

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
  enqueueJob?: EnqueueJobFn | undefined;
  logger?: AppLogger | undefined;
  reconcileIntervalMs?: number | undefined;
}

const DEFAULT_RECONCILE_INTERVAL_MS = 30_000;

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
    {
      name: string;
      strategyIds: string[];
      memberLabels?: readonly (string | null)[] | undefined;
      mode?: 'majority' | 'weighted';
    }
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
  private readonly enqueueJobFn: EnqueueJobFn;
  private readonly logger: SearchCoordinatorDependencies['logger'];
  private readonly reconcileIntervalMs: number;
  private readonly activeRuns = new Map<string, ActiveRunState>();
  private unsubscribeEvaluated?: (() => void) | undefined;
  private unsubscribeCompleted?: (() => void) | undefined;
  private reconcileTimer?: NodeJS.Timeout | undefined;

  public constructor(deps: SearchCoordinatorDependencies) {
    this.prisma = deps.prisma;
    this.eventBus = deps.eventBus;
    this.historyProvider = deps.historyProvider;
    this.onProgress = deps.onProgress;
    this.logger = deps.logger;
    this.reconcileIntervalMs =
      deps.reconcileIntervalMs ?? DEFAULT_RECONCILE_INTERVAL_MS;
    this.enqueueJobFn =
      deps.enqueueJob ??
      (async (transaction, input) => {
        const job = await transaction.backtestJob.create({
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

    this.reconcileTimer = setInterval(() => {
      void this.reconcileActiveRuns();
    }, this.reconcileIntervalMs);
    this.reconcileTimer.unref?.();
  }

  public stop(): void {
    this.unsubscribeEvaluated?.();
    this.unsubscribeCompleted?.();
    this.unsubscribeEvaluated = undefined;
    this.unsubscribeCompleted = undefined;

    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = undefined;
    }

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
    // Version members are distinct by Strategy Version, not by the registry id they dispatch
    // through, so two Library entries backed by the same registered Strategy (e.g. two RuleStrategy
    // entries) must not collapse into one (ADR-0028).
    const seenKeys = new Set<string>();
    const deduplicatedEnabledStrategies = (
      options.searchSpace.enabledStrategies ?? []
    ).reduce<EnabledStrategyDescriptor[]>((acc, descriptor) => {
      if (isVersionMember(descriptor)) {
        const key = searchSpaceMemberKey(descriptor);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          acc.push(descriptor);
        }
        return acc;
      }

      const canonicalId = StrategyRegistry.canonicalId(descriptor.id);
      const key = `registry:${canonicalId}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
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

    // Fail fast: no SearchRun, Experiment, or Backtest Job exists until this succeeds.
    const datasetSnapshotId =
      await this.prepareDatasetSnapshot(alignedSearchSpace);

    const searchRun = await this.prisma.searchRun.create({
      data: {
        algorithm: algorithmName,
        datasetSnapshotId,
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

        const success = await this.persistAndEnqueueCandidate(run, candidate);
        if (!success) {
          // Not marked seen, so a failed submission can be retried instead of blocked.
          continue;
        }

        run.seenFingerprints.add(candidate.fingerprint);
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
        const applicability = (params as Record<string, unknown>)
          .applicability as RuleApplicability | undefined;
        if (!pairMatchesRuleApplicability(searchSpace.pair, applicability)) {
          return true;
        }
      }
    }
    return false;
  }

  private async prepareDatasetSnapshot(
    searchSpace: SearchSpace,
  ): Promise<string> {
    if (!this.historyProvider) {
      throw new DatasetSnapshotPreparationError(
        'No history provider is configured; cannot obtain an immutable Dataset Snapshot for this search space',
      );
    }

    try {
      const prepared = await this.historyProvider.prepareHistoricalCandles(
        {
          endTime: searchSpace.endTime,
          pair: searchSpace.pair,
          startTime: searchSpace.startTime,
          timeframe: searchSpace.timeframe,
        },
        200,
        100_000,
      );

      const fingerprint = fingerprintDataset({
        candles: prepared.candles,
        endTime: searchSpace.endTime,
        pair: searchSpace.pair,
        startTime: searchSpace.startTime,
        timeframe: searchSpace.timeframe,
        warmupCandleCount: prepared.warmupCandleCount,
      });

      const snapshot = await this.prisma.datasetSnapshot.upsert({
        where: { fingerprint },
        create: {
          candles: prepared.candles as unknown as Prisma.InputJsonValue,
          endTime: BigInt(searchSpace.endTime),
          fingerprint,
          pair: searchSpace.pair,
          startTime: BigInt(searchSpace.startTime),
          timeframe: searchSpace.timeframe,
          warmupCandleCount: prepared.warmupCandleCount,
        },
        update: {},
      });

      return snapshot.id;
    } catch (error) {
      this.logger?.error(
        { error, searchSpace },
        'Failed to prepare an immutable Dataset Snapshot for search run startup; aborting before creating a SearchRun',
      );
      throw new DatasetSnapshotPreparationError(
        'Failed to prepare an immutable Dataset Snapshot for this search space',
        { cause: error },
      );
    }
  }

  private async persistAndEnqueueCandidate(
    run: ActiveRunState,
    candidate: CandidateStrategy,
  ): Promise<boolean> {
    const datasetSnapshotId = run.datasetSnapshotId;
    if (!datasetSnapshotId) {
      this.logger?.error(
        { searchRunId: run.searchRunId },
        'Refusing to create a searched Experiment without a Dataset Snapshot reference',
      );
      return false;
    }

    const isComposite = candidate.strategyIds.length > 1;
    let strategyImplementationVersion: string;
    try {
      strategyImplementationVersion = resolveStrategyImplementationVersion(
        isComposite ? 'composite' : (candidate.strategyIds[0] ?? 'unknown'),
        isComposite ? candidate.strategyIds : undefined,
      );
    } catch (error) {
      this.logger?.error(
        { candidate, error, searchRunId: run.searchRunId },
        'Refusing to persist a searched candidate whose Strategy implementation is not registered',
      );
      return false;
    }

    try {
      // One transaction: an enqueue failure rolls back the Experiment too.
      const { experimentId } = await this.prisma.$transaction(
        async (transaction: Prisma.TransactionClient) => {
          const strategyVersion = await this.findOrCreateStrategyVersion(
            transaction,
            run.ownerId,
            candidate,
          );

          const experiment = await transaction.experiment.create({
            data: {
              buildRevision: resolveBuildRevision(),
              datasetSnapshotId,
              endTime: BigInt(run.searchSpace.endTime),
              evaluatorVersion: CURRENT_EVALUATOR_VERSION,
              fingerprint: candidate.fingerprint,
              generationOrdinal: candidate.provenance.generationOrdinal,
              generatorAlgorithm: algorithmFamilyName(
                candidate.provenance.algorithm,
              ),
              generatorSeed: candidate.provenance.seed ?? run.seed,
              generatorVersion: candidate.provenance.algorithm,
              initialInvestment: run.searchSpace.initialInvestment ?? '10000',
              ownerId: run.ownerId,
              pair: run.searchSpace.pair,
              searchRunId: run.searchRunId,
              simulationRulesVersion: CURRENT_SIMULATION_RULES_VERSION,
              slippage: run.searchSpace.slippage ?? '5',
              startTime: BigInt(run.searchSpace.startTime),
              strategyImplementationVersion,
              strategyVersionId: strategyVersion.id,
              timeframe: run.searchSpace.timeframe,
              transactionCost: run.searchSpace.transactionCost ?? '0.0008',
            },
          });

          await this.enqueueJobFn(transaction, {
            experimentId: experiment.id,
            ownerId: run.ownerId,
            searchRunId: run.searchRunId,
          });

          return {
            experimentId: experiment.id,
            strategyVersionId: strategyVersion.id,
          };
        },
      );

      run.activeExperimentIds.add(experimentId);

      const isComposite = candidate.strategyIds.length > 1;
      const singleMemberLabel = !isComposite
        ? candidate.memberSources?.[0]?.displayName
        : undefined;
      const candidateName =
        singleMemberLabel ??
        (isComposite
          ? `Composite (${candidate.combinationConfig?.mode ?? 'majority'})`
          : (candidate.strategyIds[0]?.toUpperCase() ?? 'UNKNOWN'));
      const memberLabels = candidate.memberSources?.map(
        (source) => source?.displayName ?? null,
      );

      const evaluatingSummary: EvaluatingCandidateSummary = {
        ...(candidate.combinationConfig?.mode
          ? { mode: candidate.combinationConfig.mode }
          : {}),
        ...(memberLabels ? { memberLabels } : {}),
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
        ...(memberLabels ? { memberLabels } : {}),
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

    // Display names sourced from Strategy Library entries (ADR-0028): captured now, at candidate
    // generation, never derived later from `params`, so they can never influence the version tag.
    const memberLabels = candidate.memberSources?.map(
      (source) => source?.displayName ?? null,
    );
    const hasMemberLabel = memberLabels?.some((label) => label !== null);
    const singleMemberLabel = !isComposite
      ? candidate.memberSources?.[0]?.displayName
      : undefined;

    const definition = await transaction.strategyDefinition.create({
      data: {
        name: singleMemberLabel ?? `${strategyId} search candidate`,
        ownerId,
        recordKind: 'SEARCH_CANDIDATE',
        source: 'USER_PROMPT',
        sourceInput: `Generated search candidate (${candidate.provenance.algorithm})`,
        tags: ['search-generated'],
        type: strategyId,
        ...(isComposite && hasMemberLabel
          ? { candidateMemberLabels: memberLabels as Prisma.InputJsonValue }
          : {}),
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
            memberLabels: candidateInfo?.memberLabels,
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
          inFlightJobs: run.inFlightJobs,
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

  // Self-heals in-flight counts a lost completion event left stale, so a run can never get stuck in RUNNING/STOPPING forever.
  public async reconcileActiveRuns(): Promise<void> {
    for (const run of this.activeRuns.values()) {
      if (run.status !== 'RUNNING' && run.status !== 'STOPPING') continue;
      if (run.activeExperimentIds.size === 0) continue;
      await this.reconcileInFlight(run);
    }
  }

  private async reconcileInFlight(run: ActiveRunState): Promise<void> {
    const tracked = [...run.activeExperimentIds];
    const jobs = await this.prisma.backtestJob.findMany({
      select: { experimentId: true, status: true },
      where: { experimentId: { in: tracked } },
    });
    const stillActiveIds = new Set(
      jobs
        .filter((job) => job.status === 'PENDING' || job.status === 'CLAIMED')
        .map((job) => job.experimentId),
    );

    if (stillActiveIds.size === run.activeExperimentIds.size) return;

    const resolvedCount = run.activeExperimentIds.size - stillActiveIds.size;
    run.activeExperimentIds = stillActiveIds;
    run.inFlightJobs = stillActiveIds.size;

    this.logger?.warn(
      { resolvedCount, searchRunId: run.searchRunId },
      'Reconciled in-flight count against Backtest Job state after it drifted from lost completion events',
    );

    await this.prisma.searchRun.update({
      data: { inFlightJobs: run.inFlightJobs, updatedAt: new Date() },
      where: { id: run.searchRunId },
    });

    this.notifyProgress(run);
    this.notifyInFlightAvailable(run);
    await this.checkTerminalState(run);
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
      let inferredDatasetSnapshotId: string | null = null;

      for (const exp of experiments) {
        if (exp.datasetSnapshotId && !inferredDatasetSnapshotId) {
          inferredDatasetSnapshotId = exp.datasetSnapshotId;
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

      // Fall back to an Experiment's snapshot for runs restored before this column existed.
      const datasetSnapshotId =
        record.datasetSnapshotId ?? inferredDatasetSnapshotId;

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

      // Only a RUNNING run needs a snapshot to resume generating candidates.
      if (record.status === 'RUNNING' && !datasetSnapshotId) {
        this.logger?.error(
          { searchRunId: record.id },
          'Cannot restore SearchRun: no Dataset Snapshot is recorded for further candidate generation',
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
        datasetSnapshotId,
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

      if (inFlight !== record.inFlightJobs) {
        await this.prisma.searchRun.update({
          data: { inFlightJobs: inFlight, updatedAt: new Date() },
          where: { id: record.id },
        });
      }

      if (record.status === 'RUNNING') {
        void this.runGenerationLoop(runState);
      } else if (record.status === 'STOPPING') {
        await this.checkTerminalState(runState);
      }
    }
  }
}
