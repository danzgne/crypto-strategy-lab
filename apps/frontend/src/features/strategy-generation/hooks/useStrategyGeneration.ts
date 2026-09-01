'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchRecentStrategies,
  generateStrategy,
  saveStrategy,
  validateStrategy,
} from '../api/strategyGenerationClient';
import type {
  GenerateStrategyResponse,
  GenerationKind,
  RuleStrategyParams,
  StrategyLibrarySummary,
  StrategyProvenance,
} from '../types';

const DEFAULT_LIBRARY_VERSION = '1.0.0';
const VALIDATE_DEBOUNCE_MS = 500;

export interface GenerationReview {
  response: GenerateStrategyResponse;
  source: StrategyProvenance;
  sourceInput: string;
}

export type ParamsValidationState =
  | { status: 'valid' }
  | { status: 'checking' }
  | { status: 'invalid'; message: string }
  | { status: 'syntax-error'; message: string };

export function useStrategyGeneration() {
  const [promptText, setPromptText] = useState('');
  const [urlText, setUrlText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeKind, setActiveKind] = useState<GenerationKind | null>(null);
  const [generation, setGeneration] = useState<GenerationReview | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [paramsText, setParamsText] = useState('');
  const [renderedParams, setRenderedParams] =
    useState<RuleStrategyParams | null>(null);
  const [paramsValidation, setParamsValidation] =
    useState<ParamsValidationState>({ status: 'valid' });
  const [isParamsDirty, setIsParamsDirty] = useState(false);
  const validationSequence = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  useEffect(() => {
    return () => {
      clearTimeout(debounceTimer.current);
    };
  }, []);

  const seedParams = useCallback((params: RuleStrategyParams) => {
    validationSequence.current += 1;
    clearTimeout(debounceTimer.current);
    setParamsText(JSON.stringify(params, null, 2));
    setRenderedParams(params);
    setParamsValidation({ status: 'valid' });
    setIsParamsDirty(false);
  }, []);

  const runGeneration = useCallback(
    async (kind: GenerationKind, input: string) => {
      setIsGenerating(true);
      setActiveKind(kind);
      setGenerationError(null);
      setGeneration(null);
      validationSequence.current += 1;
      clearTimeout(debounceTimer.current);
      try {
        const response = await generateStrategy({ kind, input });
        setGeneration({ response, source: kind, sourceInput: input });
        seedParams(response.params);
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
    [seedParams],
  );

  const handleParamsTextChange = useCallback((text: string) => {
    setParamsText(text);
    setIsParamsDirty(true);
    clearTimeout(debounceTimer.current);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      setParamsValidation({
        status: 'syntax-error',
        message: (error as Error).message,
      });
      return;
    }

    setParamsValidation({ status: 'checking' });
    const sequence = ++validationSequence.current;
    debounceTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const result = await validateStrategy(parsed);
          if (sequence !== validationSequence.current) return;
          if (result.valid) {
            setParamsValidation({ status: 'valid' });
            setRenderedParams(parsed as RuleStrategyParams);
          } else {
            setParamsValidation({
              status: 'invalid',
              message: result.message ?? 'These parameters are not valid.',
            });
          }
        } catch (error) {
          if (sequence !== validationSequence.current) return;
          setParamsValidation({
            status: 'invalid',
            message: (error as Error).message,
          });
        }
      })();
    }, VALIDATE_DEBOUNCE_MS);
  }, []);

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
    if (!generation || paramsValidation.status !== 'valid') return;
    if (renderedParams === null) return;
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
        params: renderedParams,
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
      validationSequence.current += 1;
      clearTimeout(debounceTimer.current);
      setParamsText('');
      setRenderedParams(null);
      setParamsValidation({ status: 'valid' });
      setIsParamsDirty(false);
      setSaveName('');
      setSaveDescription('');
      setSaveTags([]);
      setSaveLibraryVersion(DEFAULT_LIBRARY_VERSION);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  }, [
    generation,
    paramsValidation,
    renderedParams,
    saveDescription,
    saveLibraryVersion,
    saveName,
    saveTags,
  ]);

  return {
    promptText,
    setPromptText,
    urlText,
    setUrlText,
    isGenerating,
    activeKind,
    generation,
    generationError,
    paramsText,
    handleParamsTextChange,
    paramsValidation,
    renderedParams,
    isParamsDirty,
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
