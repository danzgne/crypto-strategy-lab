'use client';

import { useState } from 'react';
import { CheckCircle2, Sparkles, Loader2, Eye } from 'lucide-react';
import type {
  NewsSource,
  NewsProviderType,
  ExtractionPanelData,
  ExtractionTemplate,
  ExtractionTemplateVersion,
  TemplateGenerateResult,
  TemplatePreviewResult,
  TemplateFieldName,
} from '../types';
import type { ExtractionActionState } from '../hooks/useExtractionPanel';
import { WebsiteSourcePicker } from './WebsiteSourcePicker';

interface ExtractionDiagramPanelProps {
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
}

const FIELD_ORDER: TemplateFieldName[] = [
  'title',
  'summary',
  'publishedAt',
  'url',
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { hour12: false });
}

function versionLabel(version: ExtractionTemplateVersion): string {
  return `v${version.version}`;
}

export function ExtractionDiagramPanel({
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
}: ExtractionDiagramPanelProps) {
  const [showBench, setShowBench] = useState(false);
  const isNonWebsiteTab = selectedTab === 'RSS' || selectedTab === 'HTML';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900">
          LLM-assisted Extraction
        </h3>
        <div className="flex items-center gap-2">
          <WebsiteSourcePicker
            sources={websiteSources}
            selectedSourceId={selectedSourceId}
            onSelect={onSelectSource}
          />
          {panel?.activeVersion && (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <span>Template: {versionLabel(panel.activeVersion)}</span>
              <CheckCircle2 className="size-3.5" />
            </div>
          )}
        </div>
      </div>

      {isNonWebsiteTab ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-400">
          Extraction Templates only apply to Website sources. Select the
          &quot;Website&quot; tab to view them.
        </p>
      ) : websiteSources.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-400">
          No Website Sources configured yet.
        </p>
      ) : isLoading ? (
        <p className="mt-4 text-center text-xs text-slate-400">Loading…</p>
      ) : !panel?.activeVersion ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center text-xs text-slate-400">
          This source has no Extraction Template yet. Version 1 is generated and
          activated automatically on its first crawl.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <span className="text-xs font-bold text-slate-800">
              Item container
            </span>
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-900 p-2 font-mono text-[11px] text-emerald-300 overflow-x-auto">
              {panel.activeVersion.template.item}
            </div>
            <div className="mt-2.5 space-y-1 font-mono text-[10px] text-slate-600">
              {FIELD_ORDER.map((field) => {
                const locator = panel.activeVersion?.template.fields[field];
                return (
                  <div key={field} className="flex justify-between gap-2">
                    <span className="text-slate-500">{field}</span>
                    <span className="truncate text-blue-600">
                      {locator?.selector}
                      {locator?.attr ? ` [${locator.attr}]` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 border-t border-slate-100 pt-1.5 text-[11px] font-bold text-emerald-600">
              Confidence: {panel.activeVersion.confidence.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400">
              Generated by {panel.activeVersion.generatedBy} ·{' '}
              {formatDate(panel.activeVersion.activatedAt)}
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <span className="text-xs font-bold text-slate-800">Versions</span>
            <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
              {panel.versionHistory.map((version) => (
                <div
                  key={version.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-[10px] font-medium ${
                    version.status === 'ACTIVE'
                      ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
                      : 'border-slate-100 bg-slate-50 text-slate-600'
                  }`}
                >
                  <div>
                    <span className="font-bold">{versionLabel(version)}</span>{' '}
                    <span className="text-[9px] uppercase">
                      {version.status}
                    </span>
                    <p className="text-[9px] opacity-70">
                      {formatDate(version.createdAt)}
                    </p>
                  </div>
                  {isAdmin && version.status === 'SUPERSEDED' && (
                    <button
                      type="button"
                      disabled={actionState === 'activating'}
                      onClick={() => onActivate(version.id)}
                      className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      title="Roll back to this version"
                    >
                      Roll back
                    </button>
                  )}
                </div>
              ))}
              {panel.versionHistory.length === 0 && (
                <p className="text-[10px] text-slate-400">
                  No version history yet.
                </p>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Authoring bench
                </span>
                <button
                  type="button"
                  onClick={() => setShowBench((v) => !v)}
                  className="text-[10px] font-semibold text-blue-600 hover:text-blue-700"
                >
                  {showBench ? 'Use live page' : 'Paste HTML…'}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Generate or preview a candidate template, then save it as a
                proposal for review before it can ever be activated.
              </p>

              {showBench && (
                <textarea
                  value={pastedHtml}
                  onChange={(e) => onPastedHtmlChange(e.target.value)}
                  placeholder="Paste HTML to test against instead of the live page…"
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-slate-200 p-1.5 font-mono text-[10px] text-slate-700 focus:border-blue-500 focus:outline-none"
                />
              )}

              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={actionState === 'generating'}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
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
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
                <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-[10px] text-slate-600">
                  <p className="font-semibold text-slate-700">
                    {previewResult.items.length} item(s) extracted
                  </p>
                  <p className="mt-0.5">
                    Empty:{' '}
                    {(previewResult.metrics.emptyFieldRate * 100).toFixed(1)}% ·
                    Malformed:{' '}
                    {(previewResult.metrics.malformedFieldRate * 100).toFixed(
                      1,
                    )}
                    %
                  </p>
                </div>
              )}

              {candidate && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-[10px]">
                  <p className="font-mono text-slate-700">
                    {candidate.template.item}
                  </p>
                  <p className="mt-1 text-slate-500">
                    Empty fields:{' '}
                    {(candidate.metrics.emptyFieldRate * 100).toFixed(1)}% ·
                    Malformed fields:{' '}
                    {(candidate.metrics.malformedFieldRate * 100).toFixed(1)}%
                  </p>
                  <button
                    type="button"
                    disabled={actionState === 'saving' || !panel.activeVersion}
                    onClick={() =>
                      onSaveProposal(candidate.template, candidate.generatedBy)
                    }
                    className="mt-2 w-full rounded-lg border border-blue-200 bg-blue-50 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    {actionState === 'saving'
                      ? 'Saving…'
                      : 'Save as proposal (PROPOSED)'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
