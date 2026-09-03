'use client';

import { useState } from 'react';
import type {
  NewsProviderType,
  ExtractionPanelData,
  DriftStatus,
} from '../types';
import type { ExtractionActionState } from '../hooks/useExtractionPanel';
import { TemplateDiffView } from './TemplateDiffView';

interface SelfHealingDiagramPanelProps {
  isAdmin?: boolean;
  selectedTab: NewsProviderType | 'ALL';
  hasWebsiteSources: boolean;
  panel: ExtractionPanelData | null;
  isLoading: boolean;
  actionState: ExtractionActionState;
  onActivate: (versionId: string) => void;
  onReject: (versionId: string) => void;
  onUpdateSettings: (patch: {
    driftDetectionEnabled?: boolean;
    driftThreshold?: number;
  }) => void;
}

const DRIFT_STATUS_LABEL: Record<DriftStatus, string> = {
  OK: 'Stable',
  DRIFTED: 'Drifted',
  INSUFFICIENT_DATA: 'Insufficient data',
};

const DRIFT_STATUS_CLASS: Record<DriftStatus, string> = {
  OK: 'text-emerald-600',
  DRIFTED: 'text-rose-600',
  INSUFFICIENT_DATA: 'text-slate-500',
};

export function SelfHealingDiagramPanel({
  isAdmin = false,
  selectedTab,
  hasWebsiteSources,
  panel,
  isLoading,
  actionState,
  onActivate,
  onReject,
  onUpdateSettings,
}: SelfHealingDiagramPanelProps) {
  const [showDiff, setShowDiff] = useState(false);
  const isNonWebsiteTab = selectedTab === 'RSS' || selectedTab === 'HTML';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900">Drift detection</h3>
        {panel && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Auto-detect</span>
              {isAdmin ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={panel.settings.driftDetectionEnabled}
                  onClick={() =>
                    onUpdateSettings({
                      driftDetectionEnabled:
                        !panel.settings.driftDetectionEnabled,
                    })
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    panel.settings.driftDetectionEnabled
                      ? 'bg-emerald-500'
                      : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      panel.settings.driftDetectionEnabled
                        ? 'translate-x-4'
                        : 'translate-x-0'
                    }`}
                  />
                </button>
              ) : (
                <span className="font-medium text-slate-500">
                  {panel.settings.driftDetectionEnabled
                    ? 'Enabled'
                    : 'Disabled'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Threshold</span>
              {isAdmin ? (
                <input
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={panel.settings.driftThreshold}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isFinite(value) && value > 0 && value <= 1) {
                      onUpdateSettings({ driftThreshold: value });
                    }
                  }}
                  className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
                />
              ) : (
                <span className="font-medium text-slate-500">
                  {(panel.settings.driftThreshold * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {isNonWebsiteTab ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-400">
          Drift detection only applies to Website sources.
        </p>
      ) : !hasWebsiteSources ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-400">
          No Website Sources configured yet.
        </p>
      ) : isLoading ? (
        <p className="mt-4 text-center text-xs text-slate-400">Loading…</p>
      ) : !panel?.activeVersion ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-400">
          No active version yet to evaluate drift against.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 text-[11px]">
            <p className="font-semibold text-slate-700">Source health:</p>
            <div className="mt-1.5 flex justify-between">
              <span className="text-slate-500">Enabled:</span>
              <span className="font-semibold text-slate-700">
                {panel.health.enabled ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-slate-500">Active (health):</span>
              <span
                className={`font-semibold ${panel.health.active ? 'text-emerald-600' : 'text-rose-600'}`}
              >
                {panel.health.active ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-slate-500">Last attempt:</span>
              <span className="font-semibold text-slate-700">
                {panel.health.lastAttemptStatus ?? '—'}
              </span>
            </div>
            <div className="mt-2.5 border-t border-slate-100 pt-1.5 flex justify-between">
              <span className="text-slate-500">Avg. confidence (24h):</span>
              <span className="font-semibold text-slate-700">
                {panel.health.avgConfidence24h !== null
                  ? panel.health.avgConfidence24h.toFixed(2)
                  : '—'}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-slate-500">Items analysed (24h):</span>
              <span className="font-semibold text-slate-700">
                {panel.health.itemsAnalysed24h}
              </span>
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 text-[11px]">
            <p className="font-semibold text-slate-700">
              Validation metrics (since v{panel.activeVersion.version} was
              activated):
            </p>
            {panel.drift.status === 'INSUFFICIENT_DATA' ? (
              <p className="mt-2 text-slate-400">
                Not enough data yet to evaluate (needs ≥ 3 crawl attempts and ≥
                10 items).
              </p>
            ) : (
              <>
                <div className="mt-1.5 flex justify-between">
                  <span className="text-slate-500">
                    Total error (empty + malformed):
                  </span>
                  <span className="font-semibold text-slate-700">
                    {((panel.drift.combinedRate ?? 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-slate-500">Threshold:</span>
                  <span className="font-semibold text-slate-700">
                    {(panel.drift.threshold * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-slate-500">Sample:</span>
                  <span className="font-semibold text-slate-700">
                    {panel.drift.sampleAttempts} crawl attempts /{' '}
                    {panel.drift.sampleItems} items
                  </span>
                </div>
              </>
            )}
            <div className="mt-2.5 border-t border-slate-100 pt-1.5 flex justify-between text-[11px] font-bold">
              <span>Status:</span>
              <span className={DRIFT_STATUS_CLASS[panel.drift.status]}>
                {DRIFT_STATUS_LABEL[panel.drift.status]}
              </span>
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 text-[11px]">
            {!panel.proposedVersion ? (
              <p className="text-slate-400">
                No proposal is pending review. When drift crosses the threshold,
                the system automatically generates a PROPOSED version here — it
                is never applied automatically.
              </p>
            ) : (
              <>
                <p className="font-semibold text-slate-700">
                  Proposal: v{panel.proposedVersion.version} (based on v
                  {panel.activeVersion.version})
                </p>
                <div className="mt-1 space-y-1 text-slate-600">
                  <p>
                    Confidence: {panel.proposedVersion.confidence.toFixed(2)}
                  </p>
                  {panel.proposedVersion.projectedEmptyFieldRate !== null &&
                    panel.proposedVersion.projectedEmptyFieldRate !==
                      undefined && (
                      <p>
                        Projected empty fields:{' '}
                        {(
                          panel.proposedVersion.projectedEmptyFieldRate * 100
                        ).toFixed(1)}
                        %
                      </p>
                    )}
                  {panel.proposedVersion.projectedMalformedFieldRate !== null &&
                    panel.proposedVersion.projectedMalformedFieldRate !==
                      undefined && (
                      <p>
                        Projected malformed fields:{' '}
                        {(
                          panel.proposedVersion.projectedMalformedFieldRate *
                          100
                        ).toFixed(1)}
                        %
                      </p>
                    )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowDiff((v) => !v)}
                  className="mt-2 rounded-lg border border-slate-200 bg-slate-50 py-1 text-center text-[10px] font-semibold text-slate-700 hover:bg-slate-100 transition"
                >
                  {showDiff ? 'Hide diff' : 'View diff'}
                </button>

                {showDiff && (
                  <div className="mt-2">
                    <TemplateDiffView
                      active={panel.activeVersion.template}
                      proposed={panel.proposedVersion.template}
                    />
                  </div>
                )}

                {isAdmin ? (
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      disabled={actionState === 'activating'}
                      onClick={() => onActivate(panel.proposedVersion!.id)}
                      className="flex-1 rounded-lg bg-blue-600 py-1.5 text-center text-[10px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      {actionState === 'activating'
                        ? 'Activating…'
                        : 'Activate now'}
                    </button>
                    <button
                      type="button"
                      disabled={actionState === 'rejecting'}
                      onClick={() => onReject(panel.proposedVersion!.id)}
                      className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-center text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
                    >
                      {actionState === 'rejecting' ? 'Rejecting…' : 'Reject'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 rounded-lg bg-slate-50 py-1 text-center text-[10px] font-medium text-slate-500 border border-slate-200">
                    Pending approval
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
