import { serverHttpClient } from '../../../shared/api/serverHttpClient';
import type { User } from '../types';

export const authServer = {
  getCurrentUser: async (): Promise<User | null> => {
    try {
      return await serverHttpClient<User>('/api/v1/auth/me', {
        method: 'GET',
      });
    } catch {
      return null;
    }
  },
};
