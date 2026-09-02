'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  NewsSource,
  ExtractionPanelData,
  ExtractionTemplate,
  TemplateGenerateResult,
} from '../types';
import {
  fetchExtractionPanel,
  generateTemplate,
  previewTemplate,
  saveProposedTemplateVersion,
  activateTemplateVersion,
  rejectTemplateVersion,
  updateExtractionSettings,
} from '../api/newsClient';

export interface UseExtractionPanelOptions {
  sources: NewsSource[];
  isAdmin?: boolean;
}

export function useExtractionPanel({
  sources,
  isAdmin = false,
}: UseExtractionPanelOptions) {
  const websiteSources = useMemo(
    () => sources.filter((s) => s.providerType === 'WEBSITE'),
    [sources],
  );

  const [manualSourceId, setManualSourceId] = useState<string | null>(null);
  // Derived rather than synced via an effect: falls back to the first Website
  // Source whenever the manual pick is unset or no longer in the list.
  const selectedSourceId =
    manualSourceId && websiteSources.some((s) => s.id === manualSourceId)
      ? manualSourceId
      : (websiteSources[0]?.id ?? null);

  const [panel, setPanel] = useState<ExtractionPanelData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionState, setActionState] = useState<
    'idle' | 'generating' | 'saving' | 'activating' | 'rejecting'
  >('idle');
  const [candidate, setCandidate] = useState<TemplateGenerateResult | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setCandidate(null);
    if (!selectedSourceId) {
      setPanel(null);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchExtractionPanel(selectedSourceId);
      setPanel(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to load extraction template data',
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectedSourceId]);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  const handleGenerate = useCallback(async () => {
    if (!selectedSourceId || !isAdmin) return;
    setActionState('generating');
    setErrorMessage(null);
    try {
      const result = await generateTemplate(selectedSourceId, {});
      setCandidate(result);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to generate template',
      );
    } finally {
      setActionState('idle');
    }
  }, [selectedSourceId, isAdmin]);

  const handlePreviewActive = useCallback(async () => {
    if (!selectedSourceId) return null;
    return previewTemplate(selectedSourceId, {});
  }, [selectedSourceId]);

  const handleSaveProposal = useCallback(
    async (template: ExtractionTemplate, generatedBy: string) => {
      if (!selectedSourceId || !isAdmin) return;
      setActionState('saving');
      setErrorMessage(null);
      try {
        await saveProposedTemplateVersion(selectedSourceId, {
          template,
          generatedBy,
        });
        setCandidate(null);
        await refresh();
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to save the proposal',
        );
      } finally {
        setActionState('idle');
      }
    },
    [selectedSourceId, isAdmin, refresh],
  );

  const handleActivate = useCallback(
    async (versionId: string) => {
      if (!selectedSourceId || !isAdmin) return;
      setActionState('activating');
      setErrorMessage(null);
      try {
        await activateTemplateVersion(selectedSourceId, versionId);
        await refresh();
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to activate the version',
        );
      } finally {
        setActionState('idle');
      }
    },
    [selectedSourceId, isAdmin, refresh],
  );

  const handleReject = useCallback(
    async (versionId: string) => {
      if (!selectedSourceId || !isAdmin) return;
      setActionState('rejecting');
      setErrorMessage(null);
      try {
        await rejectTemplateVersion(selectedSourceId, versionId);
        await refresh();
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to reject the proposal',
        );
      } finally {
        setActionState('idle');
      }
    },
    [selectedSourceId, isAdmin, refresh],
  );

  const handleUpdateSettings = useCallback(
    async (patch: {
      driftDetectionEnabled?: boolean;
      driftThreshold?: number;
    }) => {
      if (!isAdmin) return;
      try {
        await updateExtractionSettings(patch);
        await refresh();
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to update settings',
        );
      }
    },
    [isAdmin, refresh],
  );

  return {
    websiteSources,
    selectedSourceId,
    setSelectedSourceId: setManualSourceId,
    panel,
    isLoading,
    errorMessage,
    setErrorMessage,
    actionState,
    candidate,
    setCandidate,
    refresh,
    handleGenerate,
    handlePreviewActive,
    handleSaveProposal,
    handleActivate,
    handleReject,
    handleUpdateSettings,
  };
}
