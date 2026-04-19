'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiPost, ApiError } from '@/lib/api';
import Button from '@/components/ui/Button';

type Status = 'loading' | 'success' | 'invalidToken' | 'error';

export interface EmailTokenFlowDict {
  title: string;
  loading: string;
  success: string;
  successHint: string;
  invalidToken: string;
  invalidTokenHint: string;
  error: string;
  errorHint: string;
  backToHome: string;
  openApp: string;
}

interface EmailTokenFlowProps {
  /** Backend POST endpoint that exchanges `{ token }` for a confirmation response. */
  endpoint: `/api/${string}`;
  /** Locale segment already validated by the server page, used for the Back-to-Home link. */
  locale: string;
  /** Localised strings for all four states. */
  dict: EmailTokenFlowDict;
  /** Deep-link scheme for the "Open App" CTA. Defaults to the Musaium app scheme. */
  appScheme?: string;
}

function EmailTokenFlowInner({
  endpoint,
  locale,
  dict,
  appScheme = 'musaium://',
}: EmailTokenFlowProps) {
  const token = useSearchParams().get('token');
  const [status, setStatus] = useState<Status>(token ? 'loading' : 'invalidToken');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    apiPost(endpoint, { token })
      .then(() => {
        if (!cancelled) setStatus('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus(err instanceof ApiError && err.status === 400 ? 'invalidToken' : 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [token, endpoint]);

  // Move keyboard focus to the outcome heading once the flow resolves.
  useEffect(() => {
    if (status !== 'loading') headingRef.current?.focus();
  }, [status]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-primary-100 to-[var(--sem-web-auth-gradient)] px-4">
      <div
        className="w-full max-w-md rounded-2xl border border-primary-100 bg-white p-8 shadow-lg text-center"
        aria-live="polite"
      >
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-primary-700">Musaium</h1>
          <p className="mt-2 text-sm text-text-secondary">{dict.title}</p>
        </div>

        {status === 'loading' && (
          <div className="py-6" role="status" aria-label={dict.loading}>
            <div
              className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-500"
              aria-hidden="true"
            />
            <p className="mt-4 text-sm text-text-secondary">{dict.loading}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-2">
            <div className="mb-4 text-4xl" aria-hidden="true">
              ✓
            </div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-bold text-primary-700 focus:outline-none"
            >
              {dict.success}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">{dict.successHint}</p>
            <div className="mt-6 flex flex-col gap-3">
              <a href={appScheme}>
                <Button className="w-full">{dict.openApp}</Button>
              </a>
              <Link
                href={`/${locale}`}
                className="text-sm font-medium text-primary-600 hover:text-primary-700 underline underline-offset-2"
              >
                {dict.backToHome}
              </Link>
            </div>
          </div>
        )}

        {status === 'invalidToken' && (
          <div className="py-2">
            <div className="mb-4 text-4xl" aria-hidden="true">
              🔗
            </div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-bold text-primary-700 focus:outline-none"
            >
              {dict.invalidToken}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">{dict.invalidTokenHint}</p>
            <Link
              href={`/${locale}`}
              className="mt-6 inline-block text-sm font-medium text-primary-600 hover:text-primary-700 underline underline-offset-2"
            >
              {dict.backToHome}
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="py-2">
            <div className="mb-4 text-4xl" aria-hidden="true">
              ⚠
            </div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-bold text-primary-700 focus:outline-none"
            >
              {dict.error}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">{dict.errorHint}</p>
            <Link
              href={`/${locale}`}
              className="mt-6 inline-block text-sm font-medium text-primary-600 hover:text-primary-700 underline underline-offset-2"
            >
              {dict.backToHome}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Shared UI flow for one-shot token exchange endpoints (email verification,
 * email-change confirmation). Posts `{ token }` to `endpoint` on mount and
 * renders one of four states: loading / success / invalidToken / error.
 *
 * `useSearchParams` requires a Suspense boundary in Next.js 15 — the default
 * export wraps the inner component accordingly.
 */
export default function EmailTokenFlow(props: EmailTokenFlowProps) {
  return (
    <Suspense>
      <EmailTokenFlowInner {...props} />
    </Suspense>
  );
}
