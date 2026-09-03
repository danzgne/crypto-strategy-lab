import type {
  BestCandidateSummary,
  DiscoveryProgressPayload,
  DiscoverySessionState,
  DiscoverySessionStatus,
  EnabledStrategyDescriptor,
  EvaluatingCandidateSummary,
  SearchRunStatus,
  SearchRunSummary,
  SearchSpace,
  StopPolicy,
  StopReason,
} from '@crypto-strategy-lab/shared';
import {
  DEFAULT_STOP_POLICY,
  isVersionMember,
  RANDOM_SEARCH_ALGORITHM_ID,
} from '@crypto-strategy-lab/shared';
import type { AppPrismaClient } from '../../../../database/prismaClient';
import type { AppLogger } from '../../../../utils/logger';
import {
  InvalidSearchSpaceError,
  StrategyGeneratorRegistry,
  UnsupportedAlgorithmError,
} from '../generators';
import type {
  SearchCoordinator,
  SearchCoordinatorProgressEvent,
} from './searchCoordinator';
import type { TradeRetentionService } from './tradeRetentionService';
import { assertSearchSpaceBacktestable } from './searchSpaceBuilder';

export interface StartSessionOptions {
  userId: string;
  searchSpace: SearchSpace;
  algorithm?: string | undefined;
  stopPolicy?: StopPolicy | undefined;
}

export interface ReSeedHookInput {
  userId: string;
  previousRunSummary: SearchRunSummary;
  searchSpace: SearchSpace;
}

export interface SearchSchedulerDependencies {
  prisma: AppPrismaClient;
  coordinator: SearchCoordinator;
  tradeRetentionService?: TradeRetentionService | undefined;
  perUserMaxInFlight?: number | undefined;
  interRunDelayMs?: number | undefined;
  onProgress?:
    ((progress: DiscoveryProgressPayload) => void | Promise<void>) | undefined;
  onRunComplete?:
    ((input: ReSeedHookInput) => void | Promise<void>) | undefined;
  logger?: AppLogger | undefined;
}

interface ActiveUserSession {
  sessionId: string;
  userId: string;
  status: DiscoverySessionStatus;
  algorithm: string;
  searchSpace: SearchSpace;
  stopPolicy: StopPolicy;
  currentRunId?: string | undefined;
  totalRunsCompleted: number;
  totalAcceptedCandidates: number;
  bestScore: number | null;
  startedAt: number;
  lastRunStopReason?: StopReason | undefined;
  latestCandidate?: EvaluatingCandidateSummary | undefined;
  bestCandidate?: BestCandidateSummary | undefined;
  isLooping: boolean;
}

export class SearchScheduler {
  private readonly prisma: AppPrismaClient;
  private readonly coordinator: SearchCoordinator;
  private readonly tradeRetentionService?: TradeRetentionService | undefined;
  private readonly perUserMaxInFlight: number;
  private readonly interRunDelayMs: number;
  private readonly onProgress?:
    ((progress: DiscoveryProgressPayload) => void | Promise<void>) | undefined;
  private readonly reSeedHook?:
    ((input: ReSeedHookInput) => void | Promise<void>) | undefined;
  private readonly logger?: AppLogger | undefined;

  private readonly activeSessions = new Map<string, ActiveUserSession>();
  private isRunning = false;

  public constructor(deps: SearchSchedulerDependencies) {
    this.prisma = deps.prisma;
    this.coordinator = deps.coordinator;
    this.tradeRetentionService = deps.tradeRetentionService;
    this.perUserMaxInFlight = deps.perUserMaxInFlight ?? 5;
    this.interRunDelayMs = deps.interRunDelayMs ?? 500;
    this.onProgress = deps.onProgress;
    this.reSeedHook = deps.onRunComplete;
    this.logger = deps.logger;
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    this.logger?.info({}, 'SearchScheduler started');
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    for (const userId of this.activeSessions.keys()) {
      await this.stopSession(userId);
    }
    this.activeSessions.clear();
    this.logger?.info({}, 'SearchScheduler stopped');
  }

  public async startSession(
    options: StartSessionOptions,
  ): Promise<DiscoverySessionState> {
    const { userId } = options;
    const searchSpace: SearchSpace = {
      ...options.searchSpace,
      enabledStrategies: await this.resolveEnabledStrategies(
        userId,
        options.searchSpace.enabledStrategies,
      ),
    };
    assertSearchSpaceBacktestable(searchSpace);
    const algorithm = options.algorithm ?? RANDOM_SEARCH_ALGORITHM_ID;
    if (!StrategyGeneratorRegistry.has(algorithm)) {
      throw new UnsupportedAlgorithmError(algorithm);
    }
    const stopPolicy: StopPolicy = {
      ...options.stopPolicy,
      maxInFlight: Math.min(
        options.stopPolicy?.maxInFlight ?? DEFAULT_STOP_POLICY.maxInFlight,
        this.perUserMaxInFlight,
      ),
    };

    // If an existing session is running for this user, stop it first
    if (this.activeSessions.has(userId)) {
      await this.stopSession(userId);
    }

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const session: ActiveUserSession = {
      algorithm,
      bestScore: null,
      isLooping: false,
      searchSpace,
      sessionId,
      startedAt: Date.now(),
      status: 'ACTIVE',
      stopPolicy,
      totalAcceptedCandidates: 0,
      totalRunsCompleted: 0,
      userId,
    };

    // Await the first run so a startup failure fails this call, not the background loop.
    await this.startNewRun(session);

    this.activeSessions.set(userId, session);

    // Launch continuous chaining loop for this user session asynchronously
    void this.runUserLoop(session);

    return this.toSessionState(session);
  }

  // Re-resolves every version member to its owner's *current* latest Strategy Version (ADR-0028):
  // whatever the client sent for a version member is a pointer only, never trusted params or a
  // trusted versionTag. The result is pinned into this session's searchSpace for its whole
  // lifetime, reseeds included, so a run in flight never has its members change under it.
  private async resolveEnabledStrategies(
    ownerId: string,
    enabledStrategies: SearchSpace['enabledStrategies'],
  ): Promise<SearchSpace['enabledStrategies']> {
    const resolved: EnabledStrategyDescriptor[] = [];

    for (const descriptor of enabledStrategies) {
      if (!isVersionMember(descriptor)) {
        resolved.push(descriptor);
        continue;
      }

      const version = await this.prisma.strategyVersion.findFirst({
        include: {
          strategyDefinition: {
            include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } },
          },
        },
        where: {
          id: descriptor.strategyVersionId,
          ownerId,
          strategyDefinition: { archivedAt: null, recordKind: 'LIBRARY_ENTRY' },
        },
      });

      if (!version) {
        throw new InvalidSearchSpaceError(
          `Strategy Library entry for version "${descriptor.strategyVersionId}" was not found, is archived, or does not belong to this user`,
        );
      }

      const { strategyDefinition: definition } = version;
      if (definition.type === 'composite') {
        throw new InvalidSearchSpaceError(
          `Composite Strategy Library entries cannot be added to a Search Space: "${definition.name}"`,
        );
      }

      const latest = definition.versions[0];
      if (!latest) {
        throw new InvalidSearchSpaceError(
          `Strategy Library entry "${definition.name}" has no versions`,
        );
      }

      const latestParams = latest.params as Record<string, unknown> | null;

      resolved.push({
        applicability: latestParams?.applicability,
        displayName: definition.name,
        id: definition.type,
        kind: 'version',
        params: { ...latestParams },
        strategyVersionId: latest.id,
        timeframe: latestParams?.timeframe as string | undefined,
        versionTag: latest.versionTag,
      });
    }

    return resolved;
  }

  public async pauseSession(userId: string): Promise<boolean> {
    const session = this.activeSessions.get(userId);
    if (!session || session.status !== 'ACTIVE') {
      return false;
    }

    session.status = 'PAUSED';
    if (session.currentRunId) {
      await this.coordinator.stopRun(session.currentRunId, 'USER_STOPPED');
    }

    this.emitProgress(session);
    return true;
  }

  public async resumeSession(userId: string): Promise<boolean> {
    const session = this.activeSessions.get(userId);
    if (!session || session.status !== 'PAUSED') {
      return false;
    }

    session.status = 'ACTIVE';
    if (!session.isLooping) {
      void this.runUserLoop(session);
    }

    this.emitProgress(session);
    return true;
  }

  public async stopSession(userId: string): Promise<boolean> {
    const session = this.activeSessions.get(userId);
    if (!session) {
      return false;
    }

    session.status = 'STOPPED';
    if (session.currentRunId) {
      await this.coordinator.stopRun(session.currentRunId, 'USER_STOPPED');
    }

    this.emitProgress(session);
    this.activeSessions.delete(userId);
    return true;
  }

  public getSession(userId: string): DiscoverySessionState | null {
    const session = this.activeSessions.get(userId);
    return session ? this.toSessionState(session) : null;
  }

  public getSessionProgress(userId: string): DiscoveryProgressPayload | null {
    const session = this.activeSessions.get(userId);
    return session ? this.buildProgressPayload(session) : null;
  }

  public getActiveSessions(): DiscoverySessionState[] {
    return Array.from(this.activeSessions.values()).map((s) =>
      this.toSessionState(s),
    );
  }

  public async getHistoricalRuns(userId: string): Promise<SearchRunSummary[]> {
    const runs = await this.prisma.searchRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      where: { ownerId: userId },
    });

    return runs.map((r) => ({
      acceptedCandidates: r.acceptedCandidates,
      algorithm: r.algorithm,
      bestScore: r.bestScore ? Number(r.bestScore) : null,
      id: r.id,
      ownerId: r.ownerId,
      startedAt: r.startedAt.toISOString(),
      status: r.status as SearchRunStatus,
      stopReason: r.stopReason as StopReason | null,
      stoppedAt: r.stoppedAt ? r.stoppedAt.toISOString() : null,
    }));
  }

  private async startNewRun(session: ActiveUserSession): Promise<string> {
    const runId = await this.coordinator.startRun({
      algorithmName: session.algorithm,
      ownerId: session.userId,
      searchSpace: session.searchSpace,
      stopPolicy: session.stopPolicy,
    });
    session.currentRunId = runId;
    this.emitProgress(session);
    return runId;
  }

  /**
   * Continuous Discovery chaining loop for a user.
   * Runs bounded SearchRuns sequentially until the session is paused or stopped.
   */
  private async runUserLoop(session: ActiveUserSession): Promise<void> {
    session.isLooping = true;

    try {
      while (this.isRunning && session.status === 'ACTIVE') {
        // startSession already starts the first run; only chain a fresh one here.
        const runId = session.currentRunId ?? (await this.startNewRun(session));

        // Wait for the bounded SearchRun to reach terminal state (COMPLETED / FAILED)
        const finalRun = await this.coordinator.waitForRunCompletion(runId);

        session.totalRunsCompleted++;
        session.totalAcceptedCandidates += finalRun.acceptedCandidates;
        if (
          finalRun.bestScore !== null &&
          (session.bestScore === null || finalRun.bestScore > session.bestScore)
        ) {
          session.bestScore = finalRun.bestScore;
        }
        session.lastRunStopReason = finalRun.stopReason ?? undefined;
        session.currentRunId = undefined;

        // Trigger the re-seeding hook for future DomainGuidedGenerator pluggability
        if (this.reSeedHook) {
          try {
            await this.reSeedHook({
              previousRunSummary: {
                acceptedCandidates: finalRun.acceptedCandidates,
                algorithm: session.algorithm,
                bestScore: finalRun.bestScore,
                id: finalRun.id,
                ownerId: session.userId,
                startedAt: new Date(finalRun.startedAt).toISOString(),
                status: finalRun.status,
                stopReason: finalRun.stopReason,
                stoppedAt: new Date().toISOString(),
              },
              searchSpace: session.searchSpace,
              userId: session.userId,
            });
          } catch (err) {
            this.logger?.warn({ err }, 'Re-seeding hook threw error');
          }
        }

        if (this.tradeRetentionService) {
          try {
            await this.tradeRetentionService.pruneTrades();
          } catch (err) {
            this.logger?.warn({ err }, 'Error during trade retention pruning');
          }
        }

        this.emitProgress(session);

        // If session was paused or stopped during run drain, exit loop
        if (session.status !== 'ACTIVE' || !this.isRunning) {
          break;
        }

        if (this.interRunDelayMs > 0) {
          await new Promise((r) => setTimeout(r, this.interRunDelayMs));
        }
      }
    } catch (err) {
      this.logger?.error(
        { err, userId: session.userId },
        'Error in SearchScheduler user loop',
      );
    } finally {
      session.isLooping = false;
    }
  }

  public handleCoordinatorProgress(
    event: SearchCoordinatorProgressEvent,
  ): void {
    const session = this.activeSessions.get(event.ownerId);
    if (!session) return;

    if (session.currentRunId === event.searchRunId) {
      if (event.latestCandidate) {
        session.latestCandidate = event.latestCandidate;
      }
      if (event.bestCandidate) {
        session.bestCandidate = event.bestCandidate;
      }
      if (
        event.bestScore !== null &&
        (session.bestScore === null || event.bestScore > session.bestScore)
      ) {
        session.bestScore = event.bestScore;
      }
      if (event.stopReason) {
        session.lastRunStopReason = event.stopReason;
      }
      this.emitProgress(session, event);
    }
  }

  private buildProgressPayload(
    session: ActiveUserSession,
    activeRunProgress?: SearchCoordinatorProgressEvent,
  ): DiscoveryProgressPayload {
    const run = session.currentRunId
      ? this.coordinator.getRun(session.currentRunId)
      : undefined;

    const currentAccepted =
      activeRunProgress?.acceptedCandidates ??
      run?.acceptedCandidates ??
      session.totalAcceptedCandidates;

    const inFlight = activeRunProgress?.inFlightJobs ?? run?.inFlightJobs ?? 0;

    const runStatus = activeRunProgress?.status ?? run?.status ?? undefined;

    const bestScore =
      activeRunProgress?.bestScore ?? run?.bestScore ?? session.bestScore;

    const latestCandidate =
      activeRunProgress?.latestCandidate ?? session.latestCandidate;

    const bestCandidate =
      activeRunProgress?.bestCandidate ?? session.bestCandidate;

    return {
      acceptedCandidates: currentAccepted,
      bestCandidate,
      bestScore,
      currentRunId: session.currentRunId,
      inFlightJobs: inFlight,
      latestCandidate,
      maxCandidates:
        session.stopPolicy.maxCandidates ?? DEFAULT_STOP_POLICY.maxCandidates,
      runStatus,
      sessionId: session.sessionId,
      sessionStatus: session.status,
      stopReason: session.lastRunStopReason,
      totalRunsCompleted: session.totalRunsCompleted,
      userId: session.userId,
    };
  }

  private emitProgress(
    session: ActiveUserSession,
    activeRunProgress?: SearchCoordinatorProgressEvent,
  ): void {
    if (!this.onProgress) {
      return;
    }

    void this.onProgress(this.buildProgressPayload(session, activeRunProgress));
  }

  private toSessionState(session: ActiveUserSession): DiscoverySessionState {
    return {
      algorithm: session.algorithm,
      bestCandidate: session.bestCandidate,
      bestScore: session.bestScore,
      currentRunId: session.currentRunId,
      lastRunStopReason: session.lastRunStopReason,
      latestCandidate: session.latestCandidate,
      searchSpace: session.searchSpace,
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      status: session.status,
      stopPolicy: session.stopPolicy,
      totalAcceptedCandidates: session.totalAcceptedCandidates,
      totalRunsCompleted: session.totalRunsCompleted,
      userId: session.userId,
    };
  }
}
