import { Clock3, Radio, Server, TimerReset } from 'lucide-react';

import { Panel } from '../../../shared/ui/Panel';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import type { RealtimeConnectionState } from '../hooks/useRealtimeConnection';

const PHASE_COPY = {
  connecting: { label: 'Connecting', tone: 'pending' },
  live: { label: 'Transport live', tone: 'positive' },
  reconnecting: { label: 'Transport reconnecting', tone: 'pending' },
  stale: { label: 'Transport stale', tone: 'negative' },
} as const;

export function ConnectionStatusCard({
  connection,
}: {
  connection: RealtimeConnectionState;
}) {
  const phase = PHASE_COPY[connection.phase];
  const serverTime = connection.serverTime
    ? new Intl.DateTimeFormat('en', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(connection.serverTime))
    : 'Waiting';

  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-6 py-6 text-white sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              Realtime transport
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Frontend ↔ backend channel
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              This status is verified by a Socket.IO acknowledgement from the
              backend market-data boundary.
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
      </div>

      <div className="grid gap-px bg-slate-100 sm:grid-cols-3">
        <StatusMetric icon={Radio} label="Transport" value="Socket.IO" />
        <StatusMetric
          icon={TimerReset}
          label="Round trip"
          value={
            connection.latencyMs === null
              ? 'Measuring'
              : `${connection.latencyMs} ms`
          }
        />
        <StatusMetric icon={Clock3} label="Server time" value={serverTime} />
      </div>

      <div className="flex items-center gap-3 border-t border-slate-100 px-6 py-4 text-sm text-slate-600 sm:px-7">
        <Server aria-hidden="true" className="size-4 text-indigo-500" />
        {connection.detail}
      </div>
    </Panel>
  );
}

interface StatusMetricProperties {
  icon: typeof Radio;
  label: string;
  value: string;
}

function StatusMetric({ icon: Icon, label, value }: StatusMetricProperties) {
  return (
    <div className="bg-white px-6 py-5 sm:px-7">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Icon aria-hidden="true" className="size-4 text-slate-400" />
        {label}
      </div>
      <p className="mt-2 text-lg font-semibold tracking-tight text-slate-900">
        {value}
      </p>
    </div>
  );
}
