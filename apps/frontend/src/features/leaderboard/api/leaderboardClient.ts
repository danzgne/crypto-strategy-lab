import type { LeaderboardResponse } from '@crypto-strategy-lab/shared';

import { browserHttpClient } from '../../../shared/api/browserHttpClient';

export interface LeaderboardClient {
  get(): Promise<LeaderboardResponse>;
}

export const leaderboardClient: LeaderboardClient = {
  get: () => browserHttpClient<LeaderboardResponse>('/api/v1/leaderboard'),
};
