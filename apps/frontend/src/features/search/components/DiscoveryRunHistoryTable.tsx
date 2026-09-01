'use client';

import { History, CheckCircle, AlertCircle } from 'lucide-react';
import type { UseDiscoverySessionResult } from '../hooks/useDiscoverySession';

interface DiscoveryRunHistoryTableProps {
  discovery: UseDiscoverySessionResult;
}

export function DiscoveryRunHistoryTable({
  discovery,
}: DiscoveryRunHistoryTableProps) {
  const { history } = discovery;

  if (history.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="run-history-heading"
      className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="discovery-run-history-table"
    >
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <History className="size-4 text-indigo-600" />
        <h3
          className="text-sm font-semibold text-slate-900"
          id="run-history-heading"
        >
          Search Runs History ({history.length})
        </h3>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400">
              <th className="py-2.5 font-medium">Run ID</th>
              <th className="py-2.5 font-medium">Algorithm</th>
              <th className="py-2.5 font-medium">Status</th>
              <th className="py-2.5 font-medium">Candidates</th>
              <th className="py-2.5 font-medium">Best Score</th>
              <th className="py-2.5 font-medium">Stop Reason</th>
              <th className="py-2.5 font-medium">Started At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-slate-700">
            {history.map((run) => (
              <tr key={run.id} className="hover:bg-slate-50/60">
                <td className="py-2.5 font-mono text-slate-500">
                  {run.id.slice(0, 8)}
                </td>
                <td className="py-2.5 capitalize">{run.algorithm}</td>
                <td className="py-2.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      run.status === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-700'
                        : run.status === 'RUNNING'
                          ? 'bg-blue-50 text-blue-700'
                          : run.status === 'STOPPING'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {run.status === 'COMPLETED' && (
                      <CheckCircle className="size-3" />
                    )}
                    {run.status === 'FAILED' && (
                      <AlertCircle className="size-3" />
                    )}
                    {run.status}
                  </span>
                </td>
                <td className="py-2.5 font-medium">{run.acceptedCandidates}</td>
                <td className="py-2.5 font-mono font-medium text-amber-600">
                  {run.bestScore !== null
                    ? Number(run.bestScore).toFixed(4)
                    : '—'}
                </td>
                <td className="py-2.5">
                  {run.stopReason ? (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                      {run.stopReason}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2.5 text-slate-400">
                  {new Date(run.startedAt).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
