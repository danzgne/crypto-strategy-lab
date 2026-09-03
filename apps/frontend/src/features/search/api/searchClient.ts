import type {
  DiscoveryProgressPayload,
  DiscoverySessionState,
  SearchRunSummary,
  StartDiscoverySessionInput,
} from '@crypto-strategy-lab/shared';
import { browserHttpClient } from '../../../shared/api/browserHttpClient';

export const searchClient = {
  async startSession(
    input: StartDiscoverySessionInput,
  ): Promise<{ session: DiscoverySessionState }> {
    return browserHttpClient<{ session: DiscoverySessionState }>(
      '/api/v1/search/sessions',
      {
        body: JSON.stringify(input),
        method: 'POST',
      },
    );
  },

  async getCurrentSession(): Promise<{
    session: DiscoverySessionState | null;
    progress: DiscoveryProgressPayload | null;
  }> {
    return browserHttpClient<{
      session: DiscoverySessionState | null;
      progress: DiscoveryProgressPayload | null;
    }>('/api/v1/search/sessions/current');
  },

  async pauseSession(): Promise<{ status: string }> {
    return browserHttpClient<{ status: string }>(
      '/api/v1/search/sessions/pause',
      {
        method: 'POST',
      },
    );
  },

  async resumeSession(): Promise<{ status: string }> {
    return browserHttpClient<{ status: string }>(
      '/api/v1/search/sessions/resume',
      {
        method: 'POST',
      },
    );
  },

  async stopSession(): Promise<{ status: string }> {
    return browserHttpClient<{ status: string }>(
      '/api/v1/search/sessions/stop',
      {
        method: 'POST',
      },
    );
  },

  async getHistoricalRuns(): Promise<{ runs: SearchRunSummary[] }> {
    return browserHttpClient<{ runs: SearchRunSummary[] }>(
      '/api/v1/search/runs',
    );
  },

  async setExperimentPinned(
    experimentId: string,
    isPinned: boolean,
  ): Promise<{ experimentId: string; isPinned: boolean }> {
    return browserHttpClient<{ experimentId: string; isPinned: boolean }>(
      `/api/v1/search/experiments/${experimentId}/pin`,
      {
        body: JSON.stringify({ isPinned }),
        method: 'POST',
      },
    );
  },
};
