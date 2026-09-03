'use client';

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Award,
  CheckCircle2,
  Clock,
  Layers,
  Trophy,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
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
  const latestCandidate = progress?.latestCandidate ?? session?.latestCandidate;
  const bestCandidate = progress?.bestCandidate ?? session?.bestCandidate;

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
              Discovery Progress
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
              {sessionStatus === 'ACTIVE' || totalRuns <= 1
                ? `/ ${maxCandidates}`
                : `total (${totalRuns} runs)`}
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
          <span>
            {sessionStatus !== 'ACTIVE' && totalRuns > 1
              ? 'Discovery Session Summary'
              : 'Run Candidate Target'}
          </span>
          <span>
            {sessionStatus !== 'ACTIVE' && totalRuns > 1
              ? `${currentAccepted} candidates evaluated across ${totalRuns} runs`
              : `${progressPercent}% (${currentAccepted} / ${maxCandidates})`}
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-indigo-600 transition-all duration-300"
            style={{
              width: `${sessionStatus !== 'ACTIVE' && totalRuns > 1 ? 100 : progressPercent}%`,
            }}
          />
        </div>
      </div>

      {/* Live Evaluating Candidate Banner */}
      {latestCandidate && (
        <div
          className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 text-xs"
          data-testid="evaluating-candidate-banner"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5">
                {sessionStatus === 'ACTIVE' && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                )}
                <span className="relative inline-flex size-2.5 rounded-full bg-indigo-600" />
              </span>
              <span className="font-semibold text-slate-700">
                {sessionStatus === 'ACTIVE'
                  ? 'Evaluating:'
                  : 'Last evaluated strategy:'}
              </span>
              <span className="font-mono font-semibold text-indigo-900">
                {latestCandidate.name}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-xs border border-slate-100">
                {latestCandidate.pair} • {latestCandidate.timeframe}
              </span>
              {latestCandidate.mode && (
                <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                  {latestCandidate.mode === 'majority'
                    ? 'Majority Vote'
                    : 'Weighted'}
                </span>
              )}
            </div>
          </div>

          {/* Member strategies tags */}
          {latestCandidate.strategyIds.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-indigo-100/60 pt-2">
              <span className="text-[11px] font-medium text-slate-500">
                Components:
              </span>
              {latestCandidate.strategyIds.map((stratId) => (
                <span
                  key={stratId}
                  className="inline-flex items-center rounded-md border border-indigo-100 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-800 shadow-xs"
                >
                  {stratId.toUpperCase()}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Best Strategy Spotlight Card */}
      {bestCandidate && (
        <div
          className="mt-5 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 p-4 shadow-xs"
          data-testid="best-candidate-spotlight"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Trophy className="size-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    Best Candidate Spotlight
                  </h3>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    Highest Score
                  </span>
                </div>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">
                  {bestCandidate.name}
                </p>
              </div>
            </div>

            <Link
              href={`/backtests/${encodeURIComponent(bestCandidate.experimentId)}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
              data-testid="view-best-backtest-link"
            >
              <span>View trade details</span>
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>

          {/* Sub-strategies badges & metrics */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {bestCandidate.strategyIds.map((id) => (
                <span
                  key={id}
                  className="rounded-md border border-amber-200 bg-white px-2 py-0.5 text-xs font-bold text-amber-950 shadow-xs"
                >
                  {id.toUpperCase()}
                </span>
              ))}
              {bestCandidate.mode && (
                <span className="text-xs font-medium text-slate-500">
                  (
                  {bestCandidate.mode === 'majority'
                    ? 'Majority Vote'
                    : 'Weighted Score'}
                  )
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <div className="rounded-lg border border-slate-100 bg-white/80 px-2.5 py-1">
                <span className="block text-[10px] font-medium uppercase text-slate-400">
                  Score
                </span>
                <span className="font-bold text-amber-700">
                  {bestCandidate.score.toFixed(4)}
                </span>
              </div>
              {bestCandidate.profit !== undefined && (
                <div className="rounded-lg border border-slate-100 bg-white/80 px-2.5 py-1">
                  <span className="block text-[10px] font-medium uppercase text-slate-400">
                    Profit
                  </span>
                  <span
                    className={`font-bold ${bestCandidate.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                  >
                    {bestCandidate.profit >= 0
                      ? `+${bestCandidate.profit.toFixed(2)}`
                      : bestCandidate.profit.toFixed(2)}{' '}
                    USDT
                  </span>
                </div>
              )}
              {bestCandidate.winRate !== undefined && (
                <div className="rounded-lg border border-slate-100 bg-white/80 px-2.5 py-1">
                  <span className="block text-[10px] font-medium uppercase text-slate-400">
                    Win Rate
                  </span>
                  <span className="font-bold text-slate-800">
                    {(bestCandidate.winRate * 100).toFixed(1)}%
                  </span>
                </div>
              )}
              {bestCandidate.returnPct !== undefined && (
                <div className="rounded-lg border border-slate-100 bg-white/80 px-2.5 py-1">
                  <span className="block text-[10px] font-medium uppercase text-slate-400">
                    Return
                  </span>
                  <span
                    className={`font-bold ${bestCandidate.returnPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                  >
                    {bestCandidate.returnPct >= 0
                      ? `+${(bestCandidate.returnPct * 100).toFixed(1)}%`
                      : `${(bestCandidate.returnPct * 100).toFixed(1)}%`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
