import { browserHttpClient } from '../../../shared/api/browserHttpClient';
import type {
  GenerateStrategyRequest,
  GenerateStrategyResponse,
  SaveStrategyRequest,
  StrategyLibraryEntry,
  StrategyLibrarySummary,
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

export async function fetchRecentStrategies(
  limit = 10,
): Promise<StrategyLibrarySummary[]> {
  return browserHttpClient<StrategyLibrarySummary[]>(
    `/api/v1/strategies?limit=${limit}`,
  );
}
