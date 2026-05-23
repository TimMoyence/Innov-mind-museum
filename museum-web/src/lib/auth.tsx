'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAdminDict } from '@/lib/admin-dictionary';
import { apiGet, apiPost, registerLogoutHandler } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import type { AuthSessionResponse, UserRole } from '@/lib/admin-types';

// Re-export the canonical UserRole so existing `import { UserRole } from '@/lib/auth'`
// call sites keep working. Single source of truth lives in `admin-types.ts`.
export type { UserRole } from '@/lib/admin-types';

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

function hasAdminAuthzCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c.startsWith(`${ADMIN_AUTHZ_COOKIE}=1`));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  /** True while the mount-time `/api/auth/me` probe is in flight. */
  isHydrating: boolean;
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

interface AuthMeResponse {
  user: {
    id: number;
    email: string;
    firstname: string | null;
    lastname: string | null;
    role: string;
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // `isHydrating` is the mount-time `/api/auth/me` probe state. Kept
  // separate from `isLoading` so LoginForm's submit-button text doesn't
  // flicker through "..." on first render of the login page (where the
  // probe never runs because admin-authz is absent).
  const [isHydrating, setIsHydrating] = useState(true);
  const router = useRouter();

  // Hydrate session from the HttpOnly access_token cookie on mount.
  // Gated on the readable `admin-authz` hint cookie so the public-route
  // / unit-test cases (no admin session ever) skip the fetch entirely
  // and resolve to `isLoading=false` synchronously.
  // The mutable ref is the standard "ignore late response after unmount"
  // pattern — `let cancelled = false` would trip
  // `@typescript-eslint/no-unnecessary-condition` because the linter
  // can't see that cleanup runs in a different tick.
  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false;
    if (!hasAdminAuthzCookie()) {
      setIsHydrating(false);
      return;
    }
    void (async () => {
      try {
        const data = await apiGet<AuthMeResponse>('/api/auth/me');
        if (cancelledRef.current) return;
        const u = data.user;
        const nameParts = [u.firstname, u.lastname].filter(Boolean);
        const name = nameParts.length > 0 ? nameParts.join(' ') : u.email;
        setUser({ id: u.id, email: u.email, name, role: u.role as UserRole });
      } catch {
        if (cancelledRef.current) return;
        setUser(null);
      } finally {
        if (!cancelledRef.current) setIsHydrating(false);
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const logout = useCallback(() => {
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
      // F7 — backend sets access_token + refresh_token + csrf_token HttpOnly cookies
      // on the response. JS cannot touch them; we just record the admin-authz hint
      // cookie so the middleware stops bouncing /admin/* requests to login.
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
      isHydrating,
      login,
      logout,
    }),
    [user, isLoading, isHydrating, login, logout],
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
  const { isAuthenticated, isLoading, isHydrating } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const blocking = isLoading || isHydrating;

  useEffect(() => {
    if (!blocking && !isAuthenticated) {
      // Derive locale from pathname (e.g. /fr/admin/… → fr)
      const locale = pathname.split('/')[1] ?? 'fr';
      router.replace(`/${locale}/admin/login`);
    }
  }, [isAuthenticated, blocking, router, pathname]);

  if (blocking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
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
  const { user, isAuthenticated, isLoading, isHydrating } = useAuth();
  const adminDict = useAdminDict();
  const router = useRouter();
  const pathname = usePathname();
  const blocking = isLoading || isHydrating;

  useEffect(() => {
    if (!blocking && !isAuthenticated) {
      const locale = pathname.split('/')[1] ?? 'fr';
      router.replace(`/${locale}/admin/login`);
    }
  }, [isAuthenticated, blocking, router, pathname]);

  if (blocking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // `super_admin` implicitly satisfies any role check — mirrors the BE
  // `requireRole` middleware (`require-role.middleware.ts:28`) and honors the
  // JSDoc contract in `admin-types.ts:UserRole`. Closes audit-2026-05-12 P0-6
  // + F4 Claim 1 latent bug (the previous `.includes()`-only check would
  // wrongly 403 a super_admin against `allowedRoles={['admin']}`).
  const hasRole = user && (user.role === 'super_admin' || allowedRoles.includes(user.role));
  if (!user || !hasRole) {
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
