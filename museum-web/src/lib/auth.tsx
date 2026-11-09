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
import { useRouter } from 'next/navigation';
import { useAdminDict, useAdminLocale } from '@/lib/admin-dictionary';
import { apiGet, apiPost, registerLogoutHandler } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import type { AuthSessionResponse, UserRole } from '@/lib/admin-types';

export type { UserRole } from '@/lib/admin-types';

const ADMIN_AUTHZ_COOKIE = 'admin-authz';

function setAdminAuthzCookie(): void {
  if (typeof document === 'undefined') return;
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

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrating: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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
  const [isHydrating, setIsHydrating] = useState(true);
  const router = useRouter();
  const locale = useAdminLocale();

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
    void apiPost('/api/auth/logout', {}, { skipAuthRefresh: true })
      .catch(() => undefined)
      .finally(() => {
        clearAdminAuthzCookie();
        setUser(null);
        router.push(`/${locale}/admin/login`);
      });
  }, [router, locale]);

  useEffect(() => {
    registerLogoutHandler(logout);
  }, [logout]);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const data = await apiPost<AuthSessionResponse>(
        '/api/auth/login',
        { email, password },
        { skipAuthRefresh: true },
      );
      setAdminAuthzCookie();
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, isHydrating } = useAuth();
  const router = useRouter();
  const locale = useAdminLocale();
  const blocking = isLoading || isHydrating;

  useEffect(() => {
    if (!blocking && !isAuthenticated) {
      router.replace(`/${locale}/admin/login`);
    }
  }, [isAuthenticated, blocking, router, locale]);

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

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { user, isAuthenticated, isLoading, isHydrating } = useAuth();
  const adminDict = useAdminDict();
  const router = useRouter();
  const locale = useAdminLocale();
  const blocking = isLoading || isHydrating;

  useEffect(() => {
    if (!blocking && !isAuthenticated) {
      router.replace(`/${locale}/admin/login`);
    }
  }, [isAuthenticated, blocking, router, locale]);

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
