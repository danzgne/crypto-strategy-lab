import { browserHttpClient } from '../../../shared/api/browserHttpClient';
import type { LoginCredentials, RegisterCredentials } from '../schemas/authSchemas';
import type { User } from '../types';

export const authClient = {
  login: async (credentials: LoginCredentials): Promise<User> => {
    return browserHttpClient<User>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  register: async (credentials: RegisterCredentials): Promise<User> => {
    return browserHttpClient<User>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  logout: async (): Promise<void> => {
    return browserHttpClient<void>('/api/v1/auth/logout', {
      method: 'POST',
    });
  },
};
