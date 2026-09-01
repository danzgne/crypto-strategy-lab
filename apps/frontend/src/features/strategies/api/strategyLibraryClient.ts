import type {
  SaveStrategyRequest,
  SavedStrategy,
} from '@crypto-strategy-lab/shared';

import { browserHttpClient } from '../../../shared/api/browserHttpClient';

export interface StrategyLibraryClient {
  list(): Promise<SavedStrategy[]>;
  save(request: SaveStrategyRequest): Promise<SavedStrategy>;
}

export const strategyLibraryClient: StrategyLibraryClient = {
  list: () => browserHttpClient<SavedStrategy[]>('/api/v1/strategies'),
  save: (request) =>
    browserHttpClient<SavedStrategy>('/api/v1/strategies', {
      body: JSON.stringify(request),
      method: 'POST',
    }),
};
