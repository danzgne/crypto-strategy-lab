'use client';

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  RefreshCw,
  Server,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Panel } from '../../../shared/ui/Panel';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import { useOperationsSnapshot } from '../hooks/useOperationsSnapshot';

function formatDurationMs(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  if (Number(seconds) < 60) return `${seconds}s`;
  const minutes = (ms / 60000).toFixed(1);
  return `${minutes}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return dateStr;
  }
}

export function OperationsDashboard() {
  const {
    error,
    isEmpty,
    isForbidden,
    isLoading,
    isRefreshing,
    isStale,
    lastFetchedAt,
    refetch,
    snapshot,
  } = useOperationsSnapshot();

  if (isForbidden) {
    return (
      <div
        className="rounded-2xl border border-rose-200 bg-rose-50/70 p-8 text-center"
        data-testid="operations-forbidden-state"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <ShieldAlert className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-rose-900">
          Access Restricted: Administrator Privileges Required
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-rose-700">
          You do not have permission to view backend operations and worker
          telemetry. Please switch to an account with the ADMIN role.
        </p>
      </div>
    );
  }

  if (isLoading && !snapshot) {
    return (
      <div
        className="space-y-6 animate-pulse"
        data-testid="operations-loading-state"
      >
        <div className="h-10 w-72 rounded-lg bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-200" />
          ))}
        </div>
        <div className="h-64 rounded-3xl bg-slate-200" />
        <div className="h-64 rounded-3xl bg-slate-200" />
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div
        className="rounded-2xl border border-rose-200 bg-rose-50/70 p-8 text-center"
        data-testid="operations-error-state"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <AlertCircle className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-rose-900">
          Unable to Load Operations Telemetry
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-rose-700">{error}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition"
        >
          <RefreshCw className="size-4" />
          Retry Connection
        </button>
      </div>
    );
  }

  if (isEmpty && snapshot) {
    return (
      <div
        className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm"
        data-testid="operations-empty-state"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <Server className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">
          No Operations Activity Recorded
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          No backtest jobs, worker instances, or transactional outbox events
          have been generated in this environment yet.
        </p>
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="space-y-8" data-testid="operations-dashboard">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Operations & Telemetry Dashboard
            </h1>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
              Read-Only
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Real-time backtest job queue capacity, worker heartbeats, and
            transactional outbox metrics
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isStale ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-300"
              data-testid="stale-data-badge"
            >
              <AlertTriangle className="size-3.5" />
              Stale Telemetry
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-300"
              data-testid="live-status-badge"
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Live (5s Refresh)
            </span>
          )}

          {isRefreshing && (
            <RefreshCw
              className="size-4 animate-spin text-slate-400"
              data-testid="refreshing-spinner"
            />
          )}

          {lastFetchedAt && (
            <span className="text-xs text-slate-400">
              Updated: {lastFetchedAt.toLocaleTimeString([], { hour12: false })}
            </span>
          )}
        </div>
      </div>

      {/* Section 1: Backtest Job Queue Capacity */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Layers className="size-4 text-indigo-600" />
          <h2 className="text-sm font-semibold tracking-wider text-slate-700 uppercase">
            Backtest Job Capacity & Queue
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Pending Jobs"
            value={snapshot.jobs.countByStatus.PENDING}
            subtitle={
              snapshot.jobs.oldestPendingAgeMs !== null
                ? `Oldest: ${formatDurationMs(snapshot.jobs.oldestPendingAgeMs)} ago`
                : 'Queue is clear'
            }
            icon={Clock}
            tone={
              snapshot.jobs.countByStatus.PENDING > 10 ? 'amber' : 'neutral'
            }
          />
          <MetricCard
            title="Claimed (Running)"
            value={snapshot.jobs.countByStatus.CLAIMED}
            subtitle="Currently processing"
            icon={Activity}
            tone="blue"
          />
          <MetricCard
            title="Completed Total"
            value={snapshot.jobs.countByStatus.COMPLETED}
            subtitle="Successfully evaluated"
            icon={CheckCircle2}
            tone="emerald"
          />
          <MetricCard
            title="Failed Total"
            value={snapshot.jobs.countByStatus.FAILED}
            subtitle="Terminal error state"
            icon={XCircle}
            tone={snapshot.jobs.countByStatus.FAILED > 0 ? 'rose' : 'neutral'}
          />
        </div>
      </div>

      {/* Section 2: Rolling 24-Hour Telemetry */}
      <Panel className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-indigo-600" />
            <h2 className="text-sm font-semibold tracking-wider text-slate-700 uppercase">
              Rolling 24-Hour Telemetry & Latencies
            </h2>
          </div>
          <span className="text-xs text-slate-400">Bounded 24h window</span>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <CompactStat
            label="Throughput"
            value={snapshot.rolling24h.throughput}
            unit="jobs"
          />
          <CompactStat
            label="Failures"
            value={snapshot.rolling24h.failures}
            unit="jobs"
            tone={snapshot.rolling24h.failures > 0 ? 'rose' : 'neutral'}
          />
          <CompactStat
            label="Retries"
            value={snapshot.rolling24h.retries}
            unit="attempts"
            tone={snapshot.rolling24h.retries > 0 ? 'amber' : 'neutral'}
          />
          <CompactStat
            label="Lease Losses"
            value={snapshot.rolling24h.leaseLosses}
            unit="events"
            tone={snapshot.rolling24h.leaseLosses > 0 ? 'rose' : 'neutral'}
          />
          <CompactStat
            label="Wait P50"
            value={formatDurationMs(snapshot.rolling24h.queueWaitP50Ms)}
            unit="median"
          />
          <CompactStat
            label="Wait P95"
            value={formatDurationMs(snapshot.rolling24h.queueWaitP95Ms)}
            unit="tail"
          />
          <CompactStat
            label="Exec P50"
            value={formatDurationMs(snapshot.rolling24h.executionP50Ms)}
            unit="median"
          />
          <CompactStat
            label="Exec P95"
            value={formatDurationMs(snapshot.rolling24h.executionP95Ms)}
            unit="tail"
          />
        </div>
      </Panel>

      {/* Section 3: Worker Node Freshness */}
      <Panel className="p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-indigo-600" />
            <h2 className="text-sm font-semibold tracking-wider text-slate-700 uppercase">
              Worker Health & Heartbeats
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge tone="positive">
              {snapshot.workers.activeCount} Active
            </StatusBadge>
            {snapshot.workers.staleCount > 0 && (
              <StatusBadge tone="pending">
                {snapshot.workers.staleCount} Stale
              </StatusBadge>
            )}
            {snapshot.workers.stoppedCount > 0 && (
              <StatusBadge tone="neutral">
                {snapshot.workers.stoppedCount} Stopped
              </StatusBadge>
            )}
          </div>
        </div>

        {snapshot.workers.instances.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No registered worker heartbeat records found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-left text-sm"
              data-testid="worker-instances-table"
            >
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase">
                  <th className="pb-3">Worker Instance ID</th>
                  <th className="pb-3">Service</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Started</th>
                  <th className="pb-3">Last Heartbeat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {snapshot.workers.instances.map((worker) => (
                  <tr
                    key={`${worker.service}-${worker.instanceId}`}
                    className="hover:bg-slate-50/50"
                  >
                    <td className="py-3 font-semibold text-slate-800">
                      {worker.instanceId}
                    </td>
                    <td className="py-3 text-slate-500">{worker.service}</td>
                    <td className="py-3">
                      {worker.status === 'active' && (
                        <StatusBadge tone="positive" pulse>
                          Active
                        </StatusBadge>
                      )}
                      {worker.status === 'stale' && (
                        <StatusBadge tone="pending">Stale</StatusBadge>
                      )}
                      {worker.status === 'stopped' && (
                        <StatusBadge tone="neutral">Stopped</StatusBadge>
                      )}
                    </td>
                    <td className="py-3 text-slate-500 font-sans">
                      {formatDate(worker.startedAt)}
                    </td>
                    <td className="py-3 text-slate-500 font-sans">
                      {formatDate(worker.lastSeenAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Section 4: Transactional Outbox Health */}
      <Panel className="p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-indigo-600" />
            <h2 className="text-sm font-semibold tracking-wider text-slate-700 uppercase">
              Transactional Outbox Health
            </h2>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">
              Eligible Backlog:{' '}
              <strong className="font-semibold text-slate-900">
                {snapshot.outbox.eligibleBacklog}
              </strong>
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">
              Oldest Unpublished:{' '}
              <strong className="font-semibold text-slate-900">
                {formatDurationMs(snapshot.outbox.oldestUnpublishedAgeMs)}
              </strong>
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">
              Retrying:{' '}
              <strong className="font-semibold text-slate-900">
                {snapshot.outbox.retryingCount}
              </strong>
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">
              Dead-lettered:{' '}
              <strong
                className={`font-semibold ${
                  snapshot.outbox.deadLetterCount > 0
                    ? 'text-rose-600'
                    : 'text-slate-900'
                }`}
              >
                {snapshot.outbox.deadLetterCount}
              </strong>
            </span>
          </div>
        </div>

        {snapshot.outbox.recentDeadLetters.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">
            No dead-lettered outbox events. Dispatcher is healthy.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table
              className="w-full text-left text-xs font-mono"
              data-testid="dead-letters-table"
            >
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase">
                  <th className="pb-2">Event ID</th>
                  <th className="pb-2">Event Name</th>
                  <th className="pb-2">Attempts</th>
                  <th className="pb-2">Dead-Lettered At</th>
                  <th className="pb-2">Sanitized Error Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {snapshot.outbox.recentDeadLetters.map((dl) => (
                  <tr key={dl.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 text-slate-700">{dl.eventId}</td>
                    <td className="py-2.5 font-semibold text-slate-800">
                      {dl.name}
                    </td>
                    <td className="py-2.5 text-slate-600">{dl.attemptCount}</td>
                    <td className="py-2.5 font-sans text-slate-500">
                      {formatDate(dl.deadLetteredAt)}
                    </td>
                    <td className="py-2.5 text-rose-600 max-w-xs truncate font-sans">
                      {dl.lastError || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Section 5: Recent Backtest Failures */}
      <Panel className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="size-4 text-rose-600" />
            <h2 className="text-sm font-semibold tracking-wider text-slate-700 uppercase">
              Recent Job Failures (Bounded)
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Max 20 most recent failures
          </span>
        </div>

        {snapshot.recentFailures.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">
            No recent job failures recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-left text-xs font-mono"
              data-testid="recent-failures-table"
            >
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase">
                  <th className="pb-2">Job ID</th>
                  <th className="pb-2">Worker</th>
                  <th className="pb-2">Category</th>
                  <th className="pb-2">Retries</th>
                  <th className="pb-2">Failed At</th>
                  <th className="pb-2">Error Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {snapshot.recentFailures.map((failure) => (
                  <tr key={failure.jobId} className="hover:bg-slate-50/50">
                    <td className="py-2.5 font-semibold text-slate-800">
                      {failure.jobId.slice(0, 8)}...
                    </td>
                    <td className="py-2.5 text-slate-600">
                      {failure.workerId || '—'}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          failure.failureCategory === 'PERMANENT'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {failure.failureCategory || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-600">
                      {failure.retryCount}
                    </td>
                    <td className="py-2.5 font-sans text-slate-500">
                      {formatDate(failure.failedAt || failure.createdAt)}
                    </td>
                    <td className="py-2.5 text-rose-600 max-w-sm truncate font-sans">
                      {failure.errorSummary || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: number | string;
  subtitle: string;
  icon: typeof Activity;
  tone?: 'neutral' | 'blue' | 'emerald' | 'amber' | 'rose';
}

function MetricCard({
  icon: Icon,
  subtitle,
  title,
  tone = 'neutral',
  value,
}: MetricCardProps) {
  const toneMap = {
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    neutral: 'bg-slate-100 text-slate-600',
    rose: 'bg-rose-50 text-rose-600',
  };

  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{title}</span>
        <div className={`rounded-xl p-2 ${toneMap[tone]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-900">
          {value}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
    </Panel>
  );
}

interface CompactStatProps {
  label: string;
  value: ReactNode;
  unit: string;
  tone?: 'neutral' | 'amber' | 'rose';
}

function CompactStat({
  label,
  tone = 'neutral',
  unit,
  value,
}: CompactStatProps) {
  const textTone =
    tone === 'rose'
      ? 'text-rose-600'
      : tone === 'amber'
        ? 'text-amber-600'
        : 'text-slate-900';

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-center">
      <span className="block text-[11px] font-medium text-slate-500 uppercase">
        {label}
      </span>
      <span
        className={`mt-1 block text-lg font-bold tracking-tight ${textTone}`}
      >
        {value}
      </span>
      <span className="block text-[10px] text-slate-400">{unit}</span>
    </div>
  );
}
