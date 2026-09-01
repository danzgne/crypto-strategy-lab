import type {
  DiscoveryProgressPayload,
  DiscoverySessionState,
  DiscoverySessionStatus,
  SearchRunStatus,
  SearchRunSummary,
  SearchSpace,
  StopPolicy,
  StopReason,
} from '@crypto-strategy-lab/shared';
import { DEFAULT_STOP_POLICY } from '@crypto-strategy-lab/shared';
import type { AppPrismaClient } from '../../../../database/prismaClient';
import type { SearchCoordinator } from './searchCoordinator';

export interface StartSessionOptions {
  userId: string;
  searchSpace: SearchSpace;
  algorithm?: 'random' | 'domain-guided' | 'genetic' | undefined;
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
  perUserMaxInFlight?: number | undefined;
  interRunDelayMs?: number | undefined;
  onProgress?:
    ((progress: DiscoveryProgressPayload) => void | Promise<void>) | undefined;
  onRunComplete?:
    ((input: ReSeedHookInput) => void | Promise<void>) | undefined;
  logger?:
    | {
        info(obj: Record<string, unknown>, msg?: string): void;
        warn(obj: Record<string, unknown>, msg?: string): void;
        error(obj: Record<string, unknown>, msg?: string): void;
        debug(obj: Record<string, unknown>, msg?: string): void;
      }
    | undefined;
}

interface ActiveUserSession {
  sessionId: string;
  userId: string;
  status: DiscoverySessionStatus;
  algorithm: 'random' | 'domain-guided' | 'genetic';
  searchSpace: SearchSpace;
  stopPolicy: StopPolicy;
  currentRunId?: string | undefined;
  totalRunsCompleted: number;
  totalAcceptedCandidates: number;
  bestScore: number | null;
  startedAt: number;
  lastRunStopReason?: StopReason | undefined;
  isLooping: boolean;
}

export class SearchScheduler {
  private readonly prisma: AppPrismaClient;
  private readonly coordinator: SearchCoordinator;
  private readonly perUserMaxInFlight: number;
  private readonly interRunDelayMs: number;
  private readonly onProgress?:
    ((progress: DiscoveryProgressPayload) => void | Promise<void>) | undefined;
  private readonly reSeedHook?:
    ((input: ReSeedHookInput) => void | Promise<void>) | undefined;
  private readonly logger?: SearchSchedulerDependencies['logger'] | undefined;

  private readonly activeSessions = new Map<string, ActiveUserSession>();
  private isRunning = false;

  public constructor(deps: SearchSchedulerDependencies) {
    this.prisma = deps.prisma;
    this.coordinator = deps.coordinator;
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
    const { userId, searchSpace } = options;
    const algorithm = options.algorithm ?? 'random';
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

    this.activeSessions.set(userId, session);

    // Launch continuous chaining loop for this user session asynchronously
    void this.runUserLoop(session);

    return this.toSessionState(session);
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

  /**
   * Continuous Discovery chaining loop for a user.
   * Runs bounded SearchRuns sequentially until the session is paused or stopped.
   */
  private async runUserLoop(session: ActiveUserSession): Promise<void> {
    session.isLooping = true;

    try {
      while (this.isRunning && session.status === 'ACTIVE') {
        // Start an independent SearchRun sampled from scratch
        const runId = await this.coordinator.startRun({
          ownerId: session.userId,
          searchSpace: session.searchSpace,
          stopPolicy: session.stopPolicy,
        });

        session.currentRunId = runId;
        this.emitProgress(session);

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

  private emitProgress(session: ActiveUserSession): void {
    if (!this.onProgress) {
      return;
    }

    const payload: DiscoveryProgressPayload = {
      acceptedCandidates: session.totalAcceptedCandidates,
      bestScore: session.bestScore,
      currentRunId: session.currentRunId,
      inFlightJobs: session.currentRunId
        ? (this.coordinator.getRun(session.currentRunId)?.inFlightJobs ?? 0)
        : 0,
      maxCandidates:
        session.stopPolicy.maxCandidates ?? DEFAULT_STOP_POLICY.maxCandidates,
      runStatus: session.currentRunId
        ? (this.coordinator.getRun(session.currentRunId)?.status ?? undefined)
        : undefined,
      sessionId: session.sessionId,
      sessionStatus: session.status,
      stopReason: session.lastRunStopReason,
      totalRunsCompleted: session.totalRunsCompleted,
      userId: session.userId,
    };

    void this.onProgress(payload);
  }

  private toSessionState(session: ActiveUserSession): DiscoverySessionState {
    return {
      algorithm: session.algorithm,
      bestScore: session.bestScore,
      currentRunId: session.currentRunId,
      lastRunStopReason: session.lastRunStopReason,
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
