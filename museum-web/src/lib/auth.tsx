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
import { useAdminDict } from '@/lib/admin-dictionary';
import { apiPost, setTokens, clearTokens, registerLogoutHandler } from '@/lib/api';
import type { AuthSessionResponse } from '@/lib/admin-types';

// ---------------------------------------------------------------------------
// Admin authz cookie — middleware redirect hint
// ---------------------------------------------------------------------------

/**
 * Cookie name read by `src/middleware.ts` to decide whether to redirect a
 * request hitting `/{locale}/admin/*` to the login page. Value is intentionally
 * opaque — backend still enforces the real JWT on every admin API call.
 *
 * Keep in sync with {@link ADMIN_AUTHZ_COOKIE} in `src/middleware.ts`.
 */
const ADMIN_AUTHZ_COOKIE = 'admin-authz';

function setAdminAuthzCookie(): void {
  if (typeof document === 'undefined') return;
  // 8h — shorter than the refresh token so the middleware stops redirecting
  // once the real session is effectively dead. Path=/ so it propagates to
  // every admin sub-route. SameSite=Lax is enough: admin login is always
  // first-party. Secure in production; HTTP OK on localhost for dev.
  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${ADMIN_AUTHZ_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 8}; SameSite=Lax${secureFlag}`;
}

function clearAdminAuthzCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${ADMIN_AUTHZ_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Matches backend UserRole enum exactly. */
export type UserRole = 'visitor' | 'moderator' | 'museum_manager' | 'admin';

export interface AuthUser {
  id: number;
  email: string;
  /** Display name derived from firstname + lastname (or email fallback). */
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
    clearAdminAuthzCookie();
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
      const data = await apiPost<AuthSessionResponse>('/api/auth/login', {
        email,
        password,
      });
      // F7 — tokens live in HttpOnly cookies; setTokens is a no-op. Called for
      // legacy compat only. Backend sets access_token + refresh_token cookies.
      setTokens(data.accessToken, data.refreshToken);
      setAdminAuthzCookie();
      // Map AuthSessionResponse.user (AuthUser from spec) to local AuthUser shape.
      const u = data.user;
      const nameParts = [u.firstname, u.lastname].filter(Boolean);
      const name = nameParts.length > 0 ? nameParts.join(' ') : u.email;
      setUser({ id: u.id, email: u.email, name, role: u.role as UserRole });
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

// ---------------------------------------------------------------------------
// RoleGuard — AuthGuard + role-based access control
// ---------------------------------------------------------------------------

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const adminDict = useAdminDict();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
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

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <div className="text-4xl font-bold text-text-secondary">403</div>
        <p className="text-lg text-text-secondary">{adminDict.accessDenied}</p>
        <button
          type="button"
          className="mt-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          onClick={() => {
            const locale = pathname.split('/')[1] ?? 'fr';
            router.push(`/${locale}`);
          }}
        >
          {adminDict.goToHomepage}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
