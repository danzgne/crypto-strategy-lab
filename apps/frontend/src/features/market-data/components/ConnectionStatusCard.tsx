import { Server } from 'lucide-react';
import type { ReactElement } from 'react';

import { Panel } from '../../../shared/ui/Panel';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import type { RealtimeConnectionState } from '../hooks/useRealtimeConnection';

const PHASE_COPY = {
  connecting: {
    label: 'Connecting',
    connection: 'Checking',
    tone: 'pending',
  },
  live: { label: 'Connected', connection: 'Stable', tone: 'positive' },
  reconnecting: {
    label: 'Reconnecting',
    connection: 'Retrying',
    tone: 'pending',
  },
  stale: { label: 'Unavailable', connection: 'Unstable', tone: 'negative' },
} as const;

export function ConnectionStatusCard({
  connection,
}: {
  connection: RealtimeConnectionState;
}) {
  const phase = PHASE_COPY[connection.phase];

  return (
    <Panel
      aria-label="Connection status"
      className="overflow-hidden"
      data-testid="connection-status-card"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Connection status
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Realtime market-data transport
          </p>
        </div>
        <StatusBadge
          pulse={connection.phase === 'live'}
          testId="connection-indicator"
          tone={phase.tone}
        >
          {phase.label}
        </StatusBadge>
      </div>

      <dl className="divide-y divide-slate-100 px-5">
        <ConnectionMetric label="Data source" value={connection.dataSource} />
        <ConnectionMetric
          label="Latency (round trip)"
          value={
            connection.latencyMs === null
              ? 'Measuring'
              : `${connection.latencyMs} ms`
          }
        />
        <ConnectionMetric
          label="Last data"
          value={formatClock(connection.lastDataAt)}
        />
        <ConnectionMetric
          label="Server time"
          value={formatClock(connection.serverTime)}
        />
        <ConnectionMetric label="Connection" value={phase.connection} />
      </dl>

      <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-600">
        <Server aria-hidden="true" className="size-3.5 text-indigo-500" />
        {connection.detail}
      </div>
    </Panel>
  );
}

interface ConnectionMetricProperties {
  label: string;
  value: string;
}

function ConnectionMetric({
  label,
  value,
}: ConnectionMetricProperties): ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function formatClock(value: string | null): string {
  if (value === null) return 'Waiting';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waiting';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
