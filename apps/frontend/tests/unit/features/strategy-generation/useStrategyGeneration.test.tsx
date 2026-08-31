import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStrategyGeneration } from '../../../../src/features/strategy-generation/hooks/useStrategyGeneration';
import * as client from '../../../../src/features/strategy-generation/api/strategyGenerationClient';
import type { GenerateStrategyResponse } from '../../../../src/features/strategy-generation/types';

vi.mock(
  '../../../../src/features/strategy-generation/api/strategyGenerationClient',
  () => ({
    generateStrategy: vi.fn(),
    saveStrategy: vi.fn(),
    fetchRecentStrategies: vi.fn(),
  }),
);

function sampleGenerated(): GenerateStrategyResponse {
  return {
    name: 'RSI_LONG',
    description: 'Long when RSI drops below 30',
    tags: ['rsi'],
    params: {
      indicators: [{ name: 'RSI', period: 14 }],
      conditions: {
        long: [{ indicator: 'RSI', operator: '<', value: 30 }],
        short: [],
      },
      timeframe: '1h',
    },
    unsupportedRequests: [],
    generatedBy: 'groq',
  };
}

describe('useStrategyGeneration hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.fetchRecentStrategies).mockResolvedValue([]);
  });

  it('loads recent strategies on mount', async () => {
    vi.mocked(client.fetchRecentStrategies).mockResolvedValue([
      {
        id: 'entry-1',
        name: 'EXISTING',
        source: 'USER_PROMPT',
        createdAt: '2026-01-01T00:00:00.000Z',
        libraryVersion: '1.0.0',
        tags: [],
      },
    ]);

    const { result } = renderHook(() => useStrategyGeneration());

    await waitFor(() => {
      expect(result.current.recentStrategies).toHaveLength(1);
    });
    expect(result.current.recentStrategies[0]?.name).toBe('EXISTING');
  });

  it('analyzes a natural-language prompt and prefills the save form', async () => {
    vi.mocked(client.generateStrategy).mockResolvedValue(sampleGenerated());
    const { result } = renderHook(() => useStrategyGeneration());

    act(() => result.current.setPromptText('Long when RSI under 30'));
    await act(async () => {
      await result.current.handleAnalyzePrompt();
    });

    expect(client.generateStrategy).toHaveBeenCalledWith({
      kind: 'USER_PROMPT',
      input: 'Long when RSI under 30',
    });
    expect(result.current.generation?.response.name).toBe('RSI_LONG');
    expect(result.current.generation?.source).toBe('USER_PROMPT');
    expect(result.current.generation?.sourceInput).toBe(
      'Long when RSI under 30',
    );
    expect(result.current.saveName).toBe('RSI_LONG');
    expect(result.current.saveTags).toEqual(['rsi']);
    expect(result.current.generationError).toBeNull();
    expect(result.current.isGenerating).toBe(false);
  });

  it('surfaces a plain-language error and leaves the prompt editable on failure', async () => {
    vi.mocked(client.generateStrategy).mockRejectedValue(
      new Error('The generated strategy did not match the expected shape.'),
    );
    const { result } = renderHook(() => useStrategyGeneration());

    act(() => result.current.setPromptText('gibberish input'));
    await act(async () => {
      await result.current.handleAnalyzePrompt();
    });

    expect(result.current.generationError).toBe(
      'The generated strategy did not match the expected shape.',
    );
    expect(result.current.generation).toBeNull();
    expect(result.current.promptText).toBe('gibberish input');
  });

  it('extracts from a URL using the WEB_IMPORT kind', async () => {
    vi.mocked(client.generateStrategy).mockResolvedValue(sampleGenerated());
    const { result } = renderHook(() => useStrategyGeneration());

    act(() => result.current.setUrlText('https://example.com/strategy'));
    await act(async () => {
      await result.current.handleExtractUrl();
    });

    expect(client.generateStrategy).toHaveBeenCalledWith({
      kind: 'WEB_IMPORT',
      input: 'https://example.com/strategy',
    });
    expect(result.current.generation?.source).toBe('WEB_IMPORT');
    expect(result.current.generation?.sourceInput).toBe(
      'https://example.com/strategy',
    );
  });

  it('clears a stale successful result once a new attempt fails', async () => {
    vi.mocked(client.generateStrategy).mockResolvedValueOnce(sampleGenerated());
    const { result } = renderHook(() => useStrategyGeneration());

    act(() => result.current.setPromptText('first prompt'));
    await act(async () => {
      await result.current.handleAnalyzePrompt();
    });
    expect(result.current.generation).not.toBeNull();

    vi.mocked(client.generateStrategy).mockRejectedValueOnce(
      new Error('bad output'),
    );
    act(() => result.current.setPromptText('second prompt'));
    await act(async () => {
      await result.current.handleAnalyzePrompt();
    });

    expect(result.current.generation).toBeNull();
    expect(result.current.generationError).toBe('bad output');
  });

  it('saves the reviewed strategy and prepends it to the recent list', async () => {
    vi.mocked(client.generateStrategy).mockResolvedValue(sampleGenerated());
    vi.mocked(client.saveStrategy).mockResolvedValue({
      id: 'entry-9',
      name: 'RSI_LONG',
      description: 'Long when RSI drops below 30',
      tags: ['rsi'],
      source: 'USER_PROMPT',
      sourceInput: 'Long when RSI under 30',
      createdAt: '2026-02-01T00:00:00.000Z',
      version: {
        id: 'version-9',
        params: sampleGenerated().params,
        versionTag: 'deadbeef',
        libraryVersion: '1.0.0',
      },
    });

    const { result } = renderHook(() => useStrategyGeneration());
    act(() => result.current.setPromptText('Long when RSI under 30'));
    await act(async () => {
      await result.current.handleAnalyzePrompt();
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(client.saveStrategy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'RSI_LONG',
        source: 'USER_PROMPT',
        sourceInput: 'Long when RSI under 30',
        libraryVersion: '1.0.0',
      }),
    );
    expect(result.current.recentStrategies[0]?.id).toBe('entry-9');
    expect(result.current.generation).toBeNull();
    expect(result.current.saveError).toBeNull();
  });

  it('keeps the review editable and reports an error when saving fails', async () => {
    vi.mocked(client.generateStrategy).mockResolvedValue(sampleGenerated());
    vi.mocked(client.saveStrategy).mockRejectedValue(
      new Error('params failed validation'),
    );

    const { result } = renderHook(() => useStrategyGeneration());
    act(() => result.current.setPromptText('Long when RSI under 30'));
    await act(async () => {
      await result.current.handleAnalyzePrompt();
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.saveError).toBe('params failed validation');
    expect(result.current.generation).not.toBeNull();
    expect(result.current.recentStrategies).toHaveLength(0);
  });

  it('clears the prompt text without touching the current result', async () => {
    vi.mocked(client.generateStrategy).mockResolvedValue(sampleGenerated());
    const { result } = renderHook(() => useStrategyGeneration());

    act(() => result.current.setPromptText('Long when RSI under 30'));
    await act(async () => {
      await result.current.handleAnalyzePrompt();
    });

    act(() => result.current.handleClearPrompt());

    expect(result.current.promptText).toBe('');
    expect(result.current.generation).not.toBeNull();
  });
});
