'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiError, apiPost } from '@/lib/api';
import Button from '@/components/ui/Button';
import type { AuthSessionResponse, MfaRecoverySessionResponse } from '@/lib/admin-types';
import type { Dictionary } from '@/lib/i18n';

interface LoginFormProps {
  dict: Dictionary['admin']['login'];
}

/** Login UI step. `credentials` = email+password; `challenge` = MFA second factor. */
type Step = 'credentials' | 'challenge';
/** Challenge mode — a time-based TOTP code, or a one-time recovery code. */
type Mode = 'totp' | 'recovery';

/** The error-code-derived UX buckets for an MFA submit failure. */
function classifyMfaError(error: unknown): 'expired' | 'rateLimited' | 'invalid' {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'rateLimited';
    const body = error.body;
    const code =
      typeof body === 'object' && body !== null
        ? (body as { error?: { code?: unknown } }).error?.code
        : undefined;
    if (code === 'RATE_LIMITED') return 'rateLimited';
    // INVALID_MFA_SESSION → the short-lived session token elapsed: restart from
    // credentials (R11). All other 401s (wrong/replayed code) are retryable (R8),
    // deliberately collapsed so we never leak the precise sub-reason (NFR security).
    if (code === 'INVALID_MFA_SESSION') return 'expired';
  }
  return 'invalid';
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
  const { login, establishSession } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // MFA challenge-step state. `mfaSession` (the short-lived bearer) lives ONLY
  // here in transient React state — never persisted/logged (R12, NFR privacy).
  const [step, setStep] = useState<Step>('credentials');
  const [mfaSession, setMfaSession] = useState<{ token: string; expiresIn: number } | null>(null);
  const [mode, setMode] = useState<Mode>('totp');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [remainingMessage, setRemainingMessage] = useState('');
  // After a successful recovery-code login (R6/I1) we DELIBERATELY hold off on
  // navigation so the admin can read the "N codes remaining" warning instead of
  // it being unmounted by an immediate router.push. The session is already live
  // (establishSession ran); this flag just gates the Continue affordance + the
  // explicit navigation on acknowledgement. Never holds the mfaSessionToken
  // (R12 / NFR privacy) — only a boolean.
  const [recoveryAcknowledgePending, setRecoveryAcknowledgePending] = useState(false);
  // Single in-flight guard for the credential + challenge + recovery submits so a
  // double-tap (R10) issues exactly one request.
  const [inFlight, setInFlight] = useState(false);

  const codeInputRef = useRef<HTMLInputElement>(null);

  const locale = pathname.split('/')[1] ?? 'fr';

  // Surface a Google OAuth callback failure (the backend redirects here with
  // ?oauth_error=<reason> on any failure path).
  useEffect(() => {
    if (searchParams.get('oauth_error')) {
      setError(dict.oauthError);
    }
  }, [searchParams, dict.oauthError]);

  // R15 — move keyboard focus to the code input when the challenge step mounts.
  // Synchronous (no await) → no cancellation flag needed (react/LESSONS.md:5-22).
  useEffect(() => {
    if (step === 'challenge' && mode === 'totp') {
      codeInputRef.current?.focus();
    }
  }, [step, mode]);

  function resetToCredentials(message: string) {
    setStep('credentials');
    setMfaSession(null);
    setMode('totp');
    setCode('');
    setRecoveryCode('');
    setMfaError('');
    setRemainingMessage('');
    setRecoveryAcknowledgePending(false);
    setError(message);
  }

  function handleGoogleSignIn() {
    const returnTo = `/${locale}/admin`;
    window.location.href = `/api/auth/google/initiate?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function handleCredentialsSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight) return;
    setError('');
    setInFlight(true);
    try {
      const outcome = await login(email, password);
      switch (outcome.kind) {
        case 'success':
          router.push(`/${locale}/admin`);
          break;
        case 'mfa-required':
          setMfaSession({ token: outcome.mfaSessionToken, expiresIn: outcome.mfaSessionExpiresIn });
          setStep('challenge');
          break;
        case 'enrollment-required':
          router.push(`/${locale}/admin/mfa`);
          break;
      }
    } catch {
      setError(dict.error);
    } finally {
      setInFlight(false);
    }
  }

  function goToAdmin(): void {
    router.push(`/${locale}/admin`);
  }

  function finishWithSession(session: AuthSessionResponse): void {
    // Reuse the exact session-establish path a direct login uses (DRY, D1).
    establishSession(session);
    goToAdmin();
  }

  async function handleChallengeSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = mfaSession?.token;
    if (!token || inFlight) return;
    const trimmed = code.trim();
    if (trimmed.length !== 6) return; // R14 — client-side shape guard
    setMfaError('');
    setInFlight(true);
    try {
      const session = await apiPost<AuthSessionResponse>(
        '/api/auth/mfa/challenge',
        { mfaSessionToken: token, code: trimmed },
        { skipAuthRefresh: true },
      );
      finishWithSession(session);
    } catch (err) {
      handleMfaFailure(err);
    } finally {
      setInFlight(false);
    }
  }

  async function handleRecoverySubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = mfaSession?.token;
    const trimmed = recoveryCode.trim();
    if (!token || inFlight || trimmed.length < 6) return; // R14
    setMfaError('');
    setInFlight(true);
    try {
      const session = await apiPost<MfaRecoverySessionResponse>(
        '/api/auth/mfa/recovery',
        { mfaSessionToken: token, recoveryCode: trimmed },
        { skipAuthRefresh: true },
      );
      // R6/I1 — the session is live immediately (mirrors finishWithSession's
      // establishSession step), but we DO NOT navigate yet: navigating here
      // would unmount the remaining-codes warning before the admin can read it.
      // We surface the (possibly low) remaining count and wait for an explicit
      // Continue acknowledgement before router.push.
      establishSession(session);
      setRemainingMessage(
        dict.mfaRecoveryRemaining.replace('{count}', String(session.remainingRecoveryCodes)),
      );
      setRecoveryAcknowledgePending(true);
    } catch (err) {
      handleMfaFailure(err);
    } finally {
      setInFlight(false);
    }
  }

  function handleMfaFailure(err: unknown): void {
    const bucket = classifyMfaError(err);
    if (bucket === 'expired') {
      resetToCredentials(dict.mfaErrorExpired); // R11 — restart from credentials
      return;
    }
    if (bucket === 'rateLimited') {
      setMfaError(dict.mfaErrorRateLimited); // R9 — distinct message, no auto-retry
      return;
    }
    // R8 — retryable: clear + re-focus the code input for another attempt.
    setMfaError(dict.mfaErrorInvalid);
    setCode('');
    setRecoveryCode('');
    if (mode === 'totp') {
      codeInputRef.current?.focus();
    }
  }

  const challengeSubmitDisabled = inFlight || code.trim().length !== 6;
  const recoverySubmitDisabled = inFlight || recoveryCode.trim().length < 6;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-primary-100 to-[var(--sem-web-auth-gradient)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-primary-100 bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-primary-700">Musaium</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {step === 'challenge' ? dict.mfaTitle : dict.title}
          </p>
        </div>

        {step === 'credentials' && (
          <>
            <form
              onSubmit={(e) => {
                void handleCredentialsSubmit(e);
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

              <Button type="submit" className="w-full" disabled={inFlight}>
                {inFlight ? '...' : dict.submit}
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
          </>
        )}

        {step === 'challenge' && (
          <div id="mfa-challenge" className="space-y-5">
            <p className="text-sm text-text-secondary">
              {mode === 'totp' ? dict.mfaInstructions : dict.mfaRecoveryLabel}
            </p>

            {mode === 'totp' ? (
              <form
                onSubmit={(e) => {
                  void handleChallengeSubmit(e);
                }}
                className="space-y-5"
              >
                <div>
                  <label
                    htmlFor="mfa-code"
                    className="mb-1 block text-sm font-medium text-text-primary"
                  >
                    {dict.mfaCodeLabel}
                  </label>
                  <input
                    id="mfa-code"
                    ref={codeInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder={dict.mfaCodePlaceholder}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                    }}
                    className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-center text-lg tracking-widest text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={challengeSubmitDisabled}>
                  {inFlight ? '...' : dict.mfaSubmit}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('recovery');
                    setMfaError('');
                  }}
                  className="w-full text-center text-sm text-primary-600 underline hover:text-primary-700"
                >
                  {dict.mfaUseRecovery}
                </button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  void handleRecoverySubmit(e);
                }}
                className="space-y-5"
              >
                <div>
                  <label
                    htmlFor="mfa-recovery"
                    className="mb-1 block text-sm font-medium text-text-primary"
                  >
                    {dict.mfaRecoveryLabel}
                  </label>
                  <input
                    id="mfa-recovery"
                    type="text"
                    autoComplete="one-time-code"
                    maxLength={32}
                    placeholder={dict.mfaRecoveryPlaceholder}
                    value={recoveryCode}
                    onChange={(e) => {
                      setRecoveryCode(e.target.value);
                    }}
                    className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={recoverySubmitDisabled}>
                  {inFlight ? '...' : dict.mfaRecoverySubmit}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('totp');
                    setMfaError('');
                  }}
                  className="w-full text-center text-sm text-primary-600 underline hover:text-primary-700"
                >
                  {dict.mfaBackToCode}
                </button>
              </form>
            )}

            {/* Single live region for both error + remaining-codes announcements
                (a11y NFR requires exactly one [aria-live] on this step). */}
            <div role="alert" aria-live="assertive">
              {mfaError && (
                <p className="rounded-lg bg-red-50 px-4 py-2 text-center text-sm text-red-600">
                  {mfaError}
                </p>
              )}
              {remainingMessage && (
                <p className="rounded-lg bg-green-50 px-4 py-2 text-center text-sm text-green-700">
                  {remainingMessage}
                </p>
              )}
            </div>

            {/* R6/I1 — explicit acknowledgement: the session is already live, but
                the admin must dismiss the remaining-codes warning before we
                navigate to the admin area. */}
            {recoveryAcknowledgePending && (
              <Button type="button" className="w-full" onClick={goToAdmin}>
                {dict.mfaRecoveryContinue}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
