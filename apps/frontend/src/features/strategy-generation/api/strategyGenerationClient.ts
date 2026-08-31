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

export async function fetchRecentStrategies(
  limit = 10,
): Promise<StrategyLibrarySummary[]> {
  return browserHttpClient<StrategyLibrarySummary[]>(
    `/api/v1/strategies?limit=${limit}`,
  );
}
