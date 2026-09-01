import type {
  CandidateStrategy,
  DomainEventEnvelope,
  DomainEventName,
  SearchRunStatus,
  SearchSpace,
  StopPolicy,
  StopReason,
  StrategyEvaluatedPayload,
  StrategyGenerator,
} from '@crypto-strategy-lab/shared';
import {
  createDomainEvent,
  DEFAULT_STOP_POLICY,
} from '@crypto-strategy-lab/shared';
import { canonicalizeValue } from '@crypto-strategy-lab/shared/strategy';
import { computeStrategyVersionTag } from '@crypto-strategy-lab/shared/strategy-version';
import { Prisma } from '../../../../../../../generated/prisma/client';
import type { AppPrismaClient } from '../../../../database/prismaClient';
import type { DomainEventPublisher } from '../../marketData/application/interfaces/domainEventPublisher.interface';
import { RandomGenerator } from '../generators/randomGenerator';
import { MathRandomSource } from '../generators/randomSource';

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
}

export interface EnqueueJobInput {
  experimentId: string;
  searchRunId: string;
  ownerId: string;
}

export interface SearchCoordinatorDependencies {
  prisma: AppPrismaClient;
  eventBus: SearchEventBus;
  enqueueJob?: ((input: EnqueueJobInput) => Promise<string>) | undefined;
  logger?:
    | {
        info(obj: Record<string, unknown>, msg?: string): void;
        warn(obj: Record<string, unknown>, msg?: string): void;
        error(obj: Record<string, unknown>, msg?: string): void;
        debug(obj: Record<string, unknown>, msg?: string): void;
      }
    | undefined;
}

interface ActiveRunState {
  searchRunId: string;
  ownerId: string;
  searchSpace: SearchSpace;
  stopPolicy: ResolvedStopPolicy;
  generator: StrategyGenerator;
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
  drainResolvers: (() => void)[];
  inFlightResolvers: (() => void)[];
  timeBudgetTimer?: NodeJS.Timeout | undefined;
}

export class SearchCoordinator {
  private readonly prisma: AppPrismaClient;
  private readonly eventBus: SearchEventBus;
  private readonly enqueueJobFn: (input: EnqueueJobInput) => Promise<string>;
  private readonly logger: SearchCoordinatorDependencies['logger'];
  private readonly activeRuns = new Map<string, ActiveRunState>();
  private unsubscribeEvaluated?: (() => void) | undefined;
  private unsubscribeCompleted?: (() => void) | undefined;

  public constructor(deps: SearchCoordinatorDependencies) {
    this.prisma = deps.prisma;
    this.eventBus = deps.eventBus;
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

    const algorithmName = options.algorithmName ?? 'random';
    const generator =
      options.generator ??
      new RandomGenerator(
        options.searchSpace,
        new MathRandomSource(),
        algorithmName,
      );

    const searchRun = await this.prisma.searchRun.create({
      data: {
        algorithm: algorithmName,
        ownerId: options.ownerId,
        searchConfig: {
          searchSpace: options.searchSpace,
          stopPolicy,
        } as unknown as Prisma.InputJsonValue,
        status: 'RUNNING',
      },
    });

    const runState: ActiveRunState = {
      acceptedCandidates: 0,
      activeExperimentIds: new Set<string>(),
      bestScore: null,
      consecutiveFailures: 0,
      consecutiveNoImprovement: 0,
      drainResolvers: [],
      generator,
      inFlightJobs: 0,
      inFlightResolvers: [],
      ownerId: options.ownerId,
      searchRunId: searchRun.id,
      searchSpace: options.searchSpace,
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

  public getRunState(searchRunId: string): ActiveRunState | undefined {
    return this.activeRuns.get(searchRunId);
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
        isPrivate: true,
        name: `${strategyId} search candidate`,
        ownerId,
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

        if (run.bestScore === null) {
          run.bestScore = score;
          run.consecutiveNoImprovement = 0;
        } else if (score > run.bestScore + scoreEpsilon) {
          run.bestScore = score;
          run.consecutiveNoImprovement = 0;
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

      for (const resolver of run.drainResolvers) {
        resolver();
      }
      run.drainResolvers = [];
    }
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
          fingerprint: true,
          id: true,
          score: true,
        },
        where: { searchRunId: record.id },
      });

      const seenFingerprints = new Set<string>();
      const activeExperimentIds = new Set<string>();
      let inFlight = 0;

      for (const exp of experiments) {
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

      const generator = new RandomGenerator(
        searchSpace,
        new MathRandomSource(),
        record.algorithm,
      );

      const runState: ActiveRunState = {
        acceptedCandidates: record.acceptedCandidates,
        activeExperimentIds,
        bestScore: record.bestScore ? Number(record.bestScore) : null,
        consecutiveFailures: record.consecutiveFailures,
        consecutiveNoImprovement: record.consecutiveNoImprovement,
        drainResolvers: [],
        generator,
        inFlightJobs: inFlight,
        inFlightResolvers: [],
        ownerId: record.ownerId,
        searchRunId: record.id,
        searchSpace,
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
