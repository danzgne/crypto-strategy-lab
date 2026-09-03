'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Loader2,
  Eye,
  RotateCcw,
  Settings2,
} from 'lucide-react';
import type {
  NewsSource,
  NewsProviderType,
  ExtractionPanelData,
  ExtractionTemplate,
  ExtractionTemplateVersion,
  TemplateGenerateResult,
  TemplatePreviewResult,
  TemplateFieldName,
  DriftStatus,
} from '../types';
import type { ExtractionActionState } from '../hooks/useExtractionPanel';
import { WebsiteSourcePicker } from './WebsiteSourcePicker';
import { TemplateDiffView } from './TemplateDiffView';
import { CollapsibleSection } from './CollapsibleSection';

interface ExtractionTemplatePanelProps {
  isAdmin?: boolean;
  selectedTab: NewsProviderType | 'ALL';
  websiteSources: NewsSource[];
  selectedSourceId: string | null;
  onSelectSource: (id: string) => void;
  panel: ExtractionPanelData | null;
  isLoading: boolean;
  candidate: TemplateGenerateResult | null;
  actionState: ExtractionActionState;
  pastedHtml: string;
  onPastedHtmlChange: (html: string) => void;
  previewResult: TemplatePreviewResult | null;
  isPreviewing: boolean;
  onGenerate: () => void;
  onPreview: (template?: ExtractionTemplate) => void;
  onSaveProposal: (
    template: TemplateGenerateResult['template'],
    generatedBy: string,
  ) => void;
  onActivate: (versionId: string) => void;
  onReject: (versionId: string) => void;
  onUpdateSettings: (patch: {
    driftDetectionEnabled?: boolean;
    driftThreshold?: number;
  }) => void;
}

const FIELD_ORDER: TemplateFieldName[] = [
  'title',
  'summary',
  'publishedAt',
  'url',
];

const DRIFT_STATUS_LABEL: Record<DriftStatus, string> = {
  OK: 'Stable',
  DRIFTED: 'Drifted',
  INSUFFICIENT_DATA: 'Insufficient data',
};

const DRIFT_STATUS_DOT: Record<DriftStatus, string> = {
  OK: 'bg-emerald-500',
  DRIFTED: 'bg-rose-500',
  INSUFFICIENT_DATA: 'bg-slate-300',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function versionLabel(version: { version: number }): string {
  return `v${version.version}`;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-400">
      {children}
    </p>
  );
}

export function ExtractionTemplatePanel({
  isAdmin = false,
  selectedTab,
  websiteSources,
  selectedSourceId,
  onSelectSource,
  panel,
  isLoading,
  candidate,
  actionState,
  pastedHtml,
  onPastedHtmlChange,
  previewResult,
  isPreviewing,
  onGenerate,
  onPreview,
  onSaveProposal,
  onActivate,
  onReject,
  onUpdateSettings,
}: ExtractionTemplatePanelProps) {
  const [showDiff, setShowDiff] = useState(false);
  const isNonWebsiteTab = selectedTab === 'RSS' || selectedTab === 'HTML';

  return (
    <div className="h-full rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Extraction Template
          </h3>
          <p className="text-xs text-slate-500">
            How this Website Source&apos;s listing page gets read, and how
            it&apos;s kept working
          </p>
        </div>
        <WebsiteSourcePicker
          sources={websiteSources}
          selectedSourceId={selectedSourceId}
          onSelect={onSelectSource}
        />
      </div>

      <div className="p-5">
        {isNonWebsiteTab ? (
          <EmptyState>
            Extraction Templates only apply to Website sources. Select the
            &quot;Website&quot; tab to view them.
          </EmptyState>
        ) : websiteSources.length === 0 ? (
          <EmptyState>No Website Sources configured yet.</EmptyState>
        ) : !panel?.activeVersion && isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : !panel?.activeVersion ? (
          <EmptyState>
            This source has no Extraction Template yet. Version 1 is generated
            and activated automatically on its first crawl.
          </EmptyState>
        ) : (
          // Stays mounted during a background refresh so the <details> sections below don't lose their open/closed state.
          <div className="space-y-4">
            {/* Status strip */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
                <CheckCircle2 className="size-4" />
                {versionLabel(panel.activeVersion)} active
              </span>
              <span className="text-slate-600">
                Confidence{' '}
                <span className="font-semibold text-slate-800">
                  {panel.activeVersion.confidence.toFixed(2)}
                </span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-600">
                <span
                  className={`size-2 rounded-full ${panel.health.active ? 'bg-emerald-500' : 'bg-rose-500'}`}
                />
                {panel.health.active ? 'Healthy' : 'Unhealthy'}
              </span>
              <span className="flex items-center gap-1.5 text-slate-600">
                <span
                  className={`size-2 rounded-full ${DRIFT_STATUS_DOT[panel.drift.status]}`}
                />
                Drift: {DRIFT_STATUS_LABEL[panel.drift.status]}
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
                {isLoading && <Loader2 className="size-3 animate-spin" />}
                Generated by {panel.activeVersion.generatedBy} ·{' '}
                {formatDate(panel.activeVersion.activatedAt)}
              </span>
            </div>

            {/* Pending proposal: the one thing that actually needs attention */}
            {panel.proposedVersion && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900">
                        Replacement proposed:{' '}
                        {versionLabel(panel.proposedVersion)} (based on{' '}
                        {versionLabel(panel.activeVersion)})
                      </p>
                      <p className="mt-0.5 text-xs text-amber-800">
                        Confidence {panel.proposedVersion.confidence.toFixed(2)}
                        {panel.proposedVersion.projectedEmptyFieldRate !=
                          null &&
                          ` · ${(panel.proposedVersion.projectedEmptyFieldRate * 100).toFixed(1)}% empty`}
                        {panel.proposedVersion.projectedMalformedFieldRate !=
                          null &&
                          ` · ${(panel.proposedVersion.projectedMalformedFieldRate * 100).toFixed(1)}% malformed`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDiff((v) => !v)}
                      className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      {showDiff ? 'Hide diff' : 'View diff'}
                    </button>
                    {isAdmin ? (
                      <>
                        <button
                          type="button"
                          disabled={actionState === 'activating'}
                          onClick={() => onActivate(panel.proposedVersion!.id)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                          {actionState === 'activating'
                            ? 'Activating…'
                            : 'Activate'}
                        </button>
                        <button
                          type="button"
                          disabled={actionState === 'rejecting'}
                          onClick={() => onReject(panel.proposedVersion!.id)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {actionState === 'rejecting'
                            ? 'Rejecting…'
                            : 'Reject'}
                        </button>
                      </>
                    ) : (
                      <span className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700">
                        Pending admin approval
                      </span>
                    )}
                  </div>
                </div>
                {showDiff && (
                  <div className="mt-3">
                    <TemplateDiffView
                      active={panel.activeVersion.template}
                      proposed={panel.proposedVersion.template}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Active template fields */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Field</th>
                    <th className="px-3 py-2 font-semibold">Selector</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100 bg-slate-50/60">
                    <td className="px-3 py-2 font-semibold text-slate-700">
                      item container
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700">
                      {panel.activeVersion.template.item}
                    </td>
                  </tr>
                  {FIELD_ORDER.map((field) => {
                    const locator = panel.activeVersion?.template.fields[field];
                    return (
                      <tr key={field} className="border-t border-slate-100">
                        <td className="px-3 py-2 pl-6 text-slate-500">
                          {field}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700">
                          {locator?.selector}
                          {locator?.attr && (
                            <span className="text-blue-600">
                              {' '}
                              [{locator.attr}]
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Version history */}
            <CollapsibleSection
              title="Version history"
              subtitle={`${panel.versionHistory.length} version${panel.versionHistory.length === 1 ? '' : 's'}`}
            >
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {panel.versionHistory.map(
                  (version: ExtractionTemplateVersion) => (
                    <div
                      key={version.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
                        version.status === 'ACTIVE'
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-slate-100 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">
                          {versionLabel(version)}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {version.status}
                        </span>
                        <span className="text-slate-400">
                          {formatDate(version.createdAt)}
                        </span>
                      </div>
                      {isAdmin && version.status === 'SUPERSEDED' && (
                        <button
                          type="button"
                          disabled={actionState === 'activating'}
                          onClick={() => onActivate(version.id)}
                          className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                          title="Roll back to this version"
                        >
                          <RotateCcw className="size-3" />
                          Roll back
                        </button>
                      )}
                    </div>
                  ),
                )}
              </div>
            </CollapsibleSection>

            {/* Health & drift details */}
            <CollapsibleSection
              title="Source health &amp; drift detection"
              subtitle={DRIFT_STATUS_LABEL[panel.drift.status]}
              badge={
                <Settings2 className="size-3.5 text-slate-300" aria-hidden />
              }
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Enabled</dt>
                    <dd className="font-semibold text-slate-700">
                      {panel.health.enabled ? 'Yes' : 'No'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Last attempt</dt>
                    <dd className="font-semibold text-slate-700">
                      {panel.health.lastAttemptStatus ?? '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Avg. confidence (24h)</dt>
                    <dd className="font-semibold text-slate-700">
                      {panel.health.avgConfidence24h !== null
                        ? panel.health.avgConfidence24h.toFixed(2)
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Items analysed (24h)</dt>
                    <dd className="font-semibold text-slate-700">
                      {panel.health.itemsAnalysed24h}
                    </dd>
                  </div>
                </dl>
                <dl className="space-y-1.5 text-xs">
                  {panel.drift.status === 'INSUFFICIENT_DATA' ? (
                    <p className="text-slate-400">
                      Not enough data yet to evaluate (needs ≥ 3 crawl attempts
                      and ≥ 10 items).
                    </p>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">
                          Total error (empty + malformed)
                        </dt>
                        <dd className="font-semibold text-slate-700">
                          {((panel.drift.combinedRate ?? 0) * 100).toFixed(1)}%
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Sample</dt>
                        <dd className="font-semibold text-slate-700">
                          {panel.drift.sampleAttempts} attempts /{' '}
                          {panel.drift.sampleItems} items
                        </dd>
                      </div>
                    </>
                  )}
                  <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-slate-500">Auto-detect</span>
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
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Threshold</span>
                    {isAdmin ? (
                      <input
                        type="number"
                        min={0.01}
                        max={1}
                        step={0.01}
                        value={panel.settings.driftThreshold}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (
                            Number.isFinite(value) &&
                            value > 0 &&
                            value <= 1
                          ) {
                            onUpdateSettings({ driftThreshold: value });
                          }
                        }}
                        className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-right text-xs font-semibold text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
                      />
                    ) : (
                      <span className="font-medium text-slate-500">
                        {(panel.settings.driftThreshold * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </dl>
              </div>
            </CollapsibleSection>

            {/* Authoring bench, admin only */}
            {isAdmin && (
              <CollapsibleSection
                title="Authoring bench"
                subtitle="Test or draft a new version"
              >
                <p className="text-xs text-slate-500">
                  Generate a candidate template with the LLM, preview it, and
                  save it as a proposal — nothing here is applied until an admin
                  explicitly activates it.
                </p>

                <textarea
                  value={pastedHtml}
                  onChange={(e) => onPastedHtmlChange(e.target.value)}
                  placeholder="Optional: paste HTML to test against instead of the live page…"
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-slate-200 p-2 font-mono text-[11px] text-slate-700 focus:border-blue-500 focus:outline-none"
                />

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={onGenerate}
                    disabled={actionState === 'generating'}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {actionState === 'generating' ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    {actionState === 'generating' ? 'Generating…' : 'Generate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onPreview(candidate?.template)}
                    disabled={isPreviewing}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {isPreviewing ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Eye className="size-3.5" />
                    )}
                    {isPreviewing ? 'Previewing…' : 'Preview'}
                  </button>
                </div>

                {previewResult && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">
                    <p className="font-semibold text-slate-700">
                      {previewResult.items.length} item(s) extracted
                    </p>
                    <p className="mt-0.5">
                      Empty:{' '}
                      {(previewResult.metrics.emptyFieldRate * 100).toFixed(1)}%
                      · Malformed:{' '}
                      {(previewResult.metrics.malformedFieldRate * 100).toFixed(
                        1,
                      )}
                      %
                    </p>
                  </div>
                )}

                {candidate && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
                    <p className="font-mono text-slate-700">
                      {candidate.template.item}
                    </p>
                    <p className="mt-1 text-slate-500">
                      Empty:{' '}
                      {(candidate.metrics.emptyFieldRate * 100).toFixed(1)}% ·
                      Malformed:{' '}
                      {(candidate.metrics.malformedFieldRate * 100).toFixed(1)}%
                    </p>
                    <button
                      type="button"
                      disabled={actionState === 'saving'}
                      onClick={() =>
                        onSaveProposal(
                          candidate.template,
                          candidate.generatedBy,
                        )
                      }
                      className="mt-2 w-full rounded-lg border border-blue-200 bg-blue-50 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    >
                      {actionState === 'saving'
                        ? 'Saving…'
                        : 'Save as proposal (PROPOSED)'}
                    </button>
                  </div>
                )}
              </CollapsibleSection>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
