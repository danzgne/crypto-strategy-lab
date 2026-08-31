'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  fetchRecentStrategies,
  generateStrategy,
  saveStrategy,
} from '../api/strategyGenerationClient';
import type {
  GenerateStrategyResponse,
  GenerationKind,
  StrategyLibrarySummary,
  StrategyProvenance,
} from '../types';

const DEFAULT_LIBRARY_VERSION = '1.0.0';

export interface GenerationReview {
  response: GenerateStrategyResponse;
  source: StrategyProvenance;
  sourceInput: string;
}

export function useStrategyGeneration() {
  const [promptText, setPromptText] = useState('');
  const [urlText, setUrlText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeKind, setActiveKind] = useState<GenerationKind | null>(null);
  const [generation, setGeneration] = useState<GenerationReview | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveTags, setSaveTags] = useState<string[]>([]);
  const [saveLibraryVersion, setSaveLibraryVersion] = useState(
    DEFAULT_LIBRARY_VERSION,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [recentStrategies, setRecentStrategies] = useState<
    StrategyLibrarySummary[]
  >([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadRecentStrategies() {
      try {
        const entries = await fetchRecentStrategies();
        if (!active) return;
        setRecentStrategies(entries);
      } catch {
        // The recently-imported table is a convenience view; leave it empty on failure.
      } finally {
        if (active) setIsLoadingRecent(false);
      }
    }

    void loadRecentStrategies();
    return () => {
      active = false;
    };
  }, []);

  const runGeneration = useCallback(
    async (kind: GenerationKind, input: string) => {
      setIsGenerating(true);
      setActiveKind(kind);
      setGenerationError(null);
      setGeneration(null);
      try {
        const response = await generateStrategy({ kind, input });
        setGeneration({ response, source: kind, sourceInput: input });
        setSaveName(response.name);
        setSaveDescription(response.description);
        setSaveTags(response.tags);
        setSaveLibraryVersion(DEFAULT_LIBRARY_VERSION);
      } catch (error) {
        setGenerationError((error as Error).message);
      } finally {
        setIsGenerating(false);
        setActiveKind(null);
      }
    },
    [],
  );

  const handleAnalyzePrompt = useCallback(async () => {
    await runGeneration('USER_PROMPT', promptText);
  }, [promptText, runGeneration]);

  const handleExtractUrl = useCallback(async () => {
    await runGeneration('WEB_IMPORT', urlText);
  }, [urlText, runGeneration]);

  const handleClearPrompt = useCallback(() => {
    setPromptText('');
  }, []);

  const handleSave = useCallback(async () => {
    if (!generation) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const entry = await saveStrategy({
        name: saveName,
        description: saveDescription || undefined,
        tags: saveTags,
        source: generation.source,
        sourceInput: generation.sourceInput,
        libraryVersion: saveLibraryVersion,
        params: generation.response.params,
      });
      setRecentStrategies((current) => [
        {
          id: entry.id,
          name: entry.name,
          source: entry.source,
          createdAt: entry.createdAt,
          libraryVersion: entry.version.libraryVersion,
          tags: entry.tags,
        },
        ...current,
      ]);
      setGeneration(null);
      setSaveName('');
      setSaveDescription('');
      setSaveTags([]);
      setSaveLibraryVersion(DEFAULT_LIBRARY_VERSION);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  }, [generation, saveDescription, saveLibraryVersion, saveName, saveTags]);

  return {
    promptText,
    setPromptText,
    urlText,
    setUrlText,
    isGenerating,
    activeKind,
    generation,
    generationError,
    handleAnalyzePrompt,
    handleExtractUrl,
    handleClearPrompt,
    saveName,
    setSaveName,
    saveDescription,
    setSaveDescription,
    saveTags,
    setSaveTags,
    saveLibraryVersion,
    setSaveLibraryVersion,
    isSaving,
    saveError,
    handleSave,
    recentStrategies,
    isLoadingRecent,
  };
}
