'use client';

import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Layers,
  Zap,
} from 'lucide-react';
import type { UseDiscoverySessionResult } from '../hooks/useDiscoverySession';

interface DiscoveryProgressCardProps {
  discovery: UseDiscoverySessionResult;
}

export function DiscoveryProgressCard({
  discovery,
}: DiscoveryProgressCardProps) {
  const { progress, session } = discovery;

  const currentAccepted =
    progress?.acceptedCandidates ?? session?.totalAcceptedCandidates ?? 0;
  const maxCandidates =
    progress?.maxCandidates ?? session?.stopPolicy?.maxCandidates ?? 100;
  const inFlight = progress?.inFlightJobs ?? 0;
  const bestScore = progress?.bestScore ?? session?.bestScore ?? null;
  const sessionStatus = progress?.sessionStatus ?? session?.status ?? 'STOPPED';
  const runStatus = progress?.runStatus;
  const stopReason = progress?.stopReason ?? session?.lastRunStopReason;
  const totalRuns =
    progress?.totalRunsCompleted ?? session?.totalRunsCompleted ?? 0;

  const progressPercent = Math.min(
    100,
    Math.round((currentAccepted / maxCandidates) * 100),
  );

  return (
    <article
      aria-labelledby="discovery-progress-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="discovery-progress-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Activity className="size-5" />
          </span>
          <div>
            <h2
              className="text-base font-semibold text-slate-900"
              id="discovery-progress-heading"
            >
              Tiến trình Discovery
            </h2>
            <p className="text-xs text-slate-500">
              Live generation, candidate deduplication &amp; backtest evaluation
            </p>
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex items-center gap-2">
          {sessionStatus === 'ACTIVE' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              <span className="size-2 animate-ping rounded-full bg-emerald-600" />
              Session Active (Run #{totalRuns + 1})
            </span>
          )}
          {sessionStatus === 'PAUSED' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              Session Paused
            </span>
          )}
          {sessionStatus === 'STOPPED' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              Idle
            </span>
          )}
          {runStatus === 'STOPPING' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
              Draining in-flight ({inFlight})
            </span>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Candidates Progress */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Layers className="size-3.5" />
            <span>Candidates</span>
          </div>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {currentAccepted}{' '}
            <span className="text-xs font-normal text-slate-500">
              / {maxCandidates}
            </span>
          </p>
        </div>

        {/* Best Score */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Award className="size-3.5 text-amber-600" />
            <span>Best Score</span>
          </div>
          <p className="mt-1 text-lg font-bold text-amber-600">
            {bestScore !== null ? Number(bestScore).toFixed(4) : '—'}
          </p>
        </div>

        {/* In Flight Jobs */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Zap className="size-3.5 text-indigo-600" />
            <span>In-Flight Backtests</span>
          </div>
          <p className="mt-1 text-lg font-bold text-indigo-600">
            {inFlight}{' '}
            <span className="text-xs font-normal text-slate-500">jobs</span>
          </p>
        </div>

        {/* Total Runs Chained */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="size-3.5 text-slate-500" />
            <span>Completed Runs</span>
          </div>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {totalRuns}{' '}
            <span className="text-xs font-normal text-slate-500">runs</span>
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-5">
        <div className="flex justify-between text-xs font-medium text-slate-600">
          <span>Run Candidate Target</span>
          <span>
            {progressPercent}% ({currentAccepted} / {maxCandidates})
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Terminal Stop Reason Box */}
      {stopReason && (
        <div
          className="mt-5 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5 text-xs text-indigo-900"
          data-testid="stop-reason-box"
        >
          {stopReason === 'CONSECUTIVE_FAILURES' ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-indigo-600" />
          )}
          <div>
            <p className="font-semibold">
              Stop Reason:{' '}
              <span className="font-mono text-indigo-700">{stopReason}</span>
            </p>
            <p className="mt-0.5 text-indigo-800/80">
              {stopReason === 'CANDIDATE_CAP' &&
                'Reached candidate quota of 100 accepted unique strategies.'}
              {stopReason === 'TIME_BUDGET' &&
                '15-minute search time budget elapsed.'}
              {stopReason === 'NO_IMPROVEMENT' &&
                'Stopped after 25 evaluated candidates with no score improvement.'}
              {stopReason === 'CONSECUTIVE_FAILURES' &&
                'Safety stop fired after 5 consecutive backtest failures.'}
              {stopReason === 'USER_STOPPED' &&
                'Discovery session paused or stopped by user.'}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
