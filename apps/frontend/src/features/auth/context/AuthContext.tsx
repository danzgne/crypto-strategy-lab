'use client';

import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from 'react';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  role: 'ADMIN' | 'USER' | null;
  isAdmin: boolean;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: User | null | undefined;
}) {
  const [user, setUser] = useState<User | null>(initialUser ?? null);

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      role: user?.role ?? null,
      isAdmin: user?.role === 'ADMIN',
      setUser,
    };
  }, [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCurrentUser(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    // Return safe fallback if not wrapped in AuthProvider
    return {
      user: null,
      role: null,
      isAdmin: false,
      setUser: () => {},
    };
  }
  return context;
}
