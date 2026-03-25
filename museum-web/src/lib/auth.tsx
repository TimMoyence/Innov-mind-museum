'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  apiPost,
  setTokens,
  clearTokens,
  registerLogoutHandler,
} from '@/lib/api';
import type { LoginResponse } from '@/lib/admin-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Matches backend UserRole enum exactly. */
export type UserRole = 'visitor' | 'moderator' | 'museum_manager' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    // Redirect to login — extract locale from current path
    const segments = window.location.pathname.split('/');
    const locale = segments[1] ?? 'fr';
    router.push(`/${locale}/admin/login`);
  }, [router]);

  // Register the logout handler so api.ts can trigger it on refresh failure
  useEffect(() => {
    registerLogoutHandler(logout);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const data = await apiPost<LoginResponse>('/api/auth/login', {
        email,
        password,
      });
      // Store both tokens in the api.ts in-memory store
      setTokens(data.tokens.accessToken, data.tokens.refreshToken);
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Guard — redirects unauthenticated users to the login page
// ---------------------------------------------------------------------------

export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Derive locale from pathname (e.g. /fr/admin/… → fr)
      const locale = pathname.split('/')[1] ?? 'fr';
      router.replace(`/${locale}/admin/login`);
    }
  }, [isAuthenticated, isLoading, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
