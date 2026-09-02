'use client';

import {
  History,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import type { UseDiscoverySessionResult } from '../hooks/useDiscoverySession';

interface DiscoveryRunHistoryTableProps {
  discovery: UseDiscoverySessionResult;
}

const PAGE_SIZE = 10;

export function DiscoveryRunHistoryTable({
  discovery,
}: DiscoveryRunHistoryTableProps) {
  const { history } = discovery;
  const [currentPage, setCurrentPage] = useState(1);

  if (history.length === 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, history.length);
  const visibleRuns = history.slice(startIndex, endIndex);

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
            {visibleRuns.map((run) => (
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

      {totalPages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <div data-testid="history-pagination-info">
            Showing{' '}
            <span className="font-semibold text-slate-700">
              {startIndex + 1}
            </span>{' '}
            to <span className="font-semibold text-slate-700">{endIndex}</span>{' '}
            of{' '}
            <span className="font-semibold text-slate-700">
              {history.length}
            </span>{' '}
            runs
          </div>

          <div className="flex items-center gap-2">
            <button
              aria-label="Previous history page"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              type="button"
            >
              <ChevronLeft className="size-3.5" />
              <span>Previous</span>
            </button>

            <span className="px-1.5 font-medium text-slate-700">
              Page {safePage} of {totalPages}
            </span>

            <button
              aria-label="Next history page"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={safePage >= totalPages}
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              type="button"
            >
              <span>Next</span>
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
