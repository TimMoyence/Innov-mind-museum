'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Button from '@/components/ui/Button';
import type { Dictionary } from '@/lib/i18n';

interface LoginFormProps {
  dict: Dictionary['admin']['login'];
}

/**
 * Inline Google "G" mark used as the button icon. Static SVG keeps the bundle
 * thin (no logo dependency) and makes the button render server-side without
 * waiting for an icon font.
 */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function LoginForm({ dict }: LoginFormProps) {
  const { login, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const locale = pathname.split('/')[1] ?? 'fr';

  // Surface a Google OAuth callback failure (the backend redirects here with
  // ?oauth_error=<reason> on any failure path).
  useEffect(() => {
    if (searchParams.get('oauth_error')) {
      setError(dict.oauthError);
    }
  }, [searchParams, dict.oauthError]);

  function handleGoogleSignIn() {
    const returnTo = `/${locale}/admin`;
    window.location.href = `/api/auth/google/initiate?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      router.push(`/${locale}/admin`);
    } catch {
      setError(dict.error);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-primary-100 to-[var(--sem-web-auth-gradient)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-primary-100 bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-primary-700">Musaium</h1>
          <p className="mt-2 text-sm text-text-secondary">{dict.title}</p>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-5"
        >
          <div>
            <label htmlFor="admin-email" className="sr-only">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              required
              autoComplete="email"
              placeholder={dict.emailPlaceholder}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="sr-only">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              required
              autoComplete="current-password"
              placeholder={dict.passwordPlaceholder}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-center text-sm text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? '...' : dict.submit}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-primary-100" />
          <span className="text-xs uppercase tracking-wide text-text-secondary">
            {dict.divider}
          </span>
          <div className="h-px flex-1 bg-primary-100" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          aria-label={dict.googleButton}
          className="inline-flex w-full items-center justify-center gap-3 rounded-lg border border-primary-200 bg-white px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          <GoogleIcon />
          {dict.googleButton}
        </button>
      </div>
    </div>
  );
}
