'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../api/authClient';
import type {
  LoginCredentials,
  RegisterCredentials,
} from '../schemas/authSchemas';

import { useCurrentUser } from '../context/AuthContext';

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { user, role, isAdmin, setUser } = useCurrentUser();

  const login = async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      setError(null);
      const loggedInUser = await authClient.login(credentials);
      setUser(loggedInUser);
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
      const registeredUser = await authClient.register(credentials);
      setUser(registeredUser);
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
      setUser(null);
      router.push('/login');
      router.refresh();
    } catch {
      // ignore logout errors on client
    } finally {
      setIsLoading(false);
    }
  };

  return {
    user,
    role,
    isAdmin,
    login,
    register,
    logout,
    isLoading,
    error,
    setError,
  };
}
