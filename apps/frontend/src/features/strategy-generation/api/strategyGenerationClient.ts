import { browserHttpClient } from '../../../shared/api/browserHttpClient';
import type {
  GenerateStrategyRequest,
  GenerateStrategyResponse,
  SaveStrategyRequest,
  StrategyLibraryEntry,
  StrategyLibrarySummary,
  ValidateStrategyResult,
} from '../types';

export async function generateStrategy(
  request: GenerateStrategyRequest,
): Promise<GenerateStrategyResponse> {
  return browserHttpClient<GenerateStrategyResponse>(
    '/api/v1/strategies/generate',
    {
      method: 'POST',
      body: JSON.stringify(request),
    },
  );
}

export async function saveStrategy(
  request: SaveStrategyRequest,
): Promise<StrategyLibraryEntry> {
  return browserHttpClient<StrategyLibraryEntry>('/api/v1/strategies', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function validateStrategy(
  params: unknown,
): Promise<ValidateStrategyResult> {
  return browserHttpClient<ValidateStrategyResult>(
    '/api/v1/strategies/validate',
    {
      method: 'POST',
      body: JSON.stringify({ params }),
    },
  );
}

interface LibraryListResponse {
  entries: StrategyLibraryEntry[];
}

export async function fetchRecentStrategies(
  limit = 10,
): Promise<StrategyLibrarySummary[]> {
  const response = await browserHttpClient<LibraryListResponse>(
    `/api/v1/strategies?limit=${limit}`,
  );
  return response.entries
    .filter(
      (entry) =>
        entry.source === 'USER_PROMPT' || entry.source === 'WEB_IMPORT',
    )
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      source: entry.source,
      createdAt: entry.createdAt,
      libraryVersion: entry.latestVersion.libraryVersion,
      tags: entry.tags,
    }));
}
