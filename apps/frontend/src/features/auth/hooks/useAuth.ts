'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../api/authClient';
import type {
  LoginCredentials,
  RegisterCredentials,
} from '../schemas/authSchemas';

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const login = async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      setError(null);
      await authClient.login(credentials);
      router.push('/'); // Default authenticated route
      router.refresh(); // Refresh the layout to trigger session check
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (credentials: RegisterCredentials) => {
    try {
      setIsLoading(true);
      setError(null);
      await authClient.register(credentials);
      router.push('/');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await authClient.logout();
      router.push('/login');
      router.refresh();
    } catch {
      // ignore logout errors on client
    } finally {
      setIsLoading(false);
    }
  };

  return {
    login,
    register,
    logout,
    isLoading,
    error,
    setError,
  };
}
