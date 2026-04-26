'use client';

import { useEffect, useState, type ReactElement } from 'react';
import QRCode from 'qrcode';

import { apiPost } from '@/lib/api';

/**
 * R16 — admin MFA enrollment page (web). Mirrors the RN screen's three-step
 * flow against the web API client:
 *   1. POST /api/auth/mfa/enroll → render QR + manual key + recovery codes.
 *   2. POST /api/auth/mfa/enroll/verify → confirm with a 6-digit code.
 *   3. Surface success and (optionally) redirect back to /admin.
 *
 * The recovery codes are shown ONCE; "Copy all" stresses persistence and the
 * page never re-fetches them.
 */

interface EnrollResponse {
  otpauthUrl: string;
  manualSecret: string;
  recoveryCodes: string[];
}

export default function AdminMfaPage(): ReactElement {
  const [enroll, setEnroll] = useState<EnrollResponse | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!enroll) return;
    void QRCode.toString(enroll.otpauthUrl, { type: 'svg', margin: 1, width: 220 }).then(setQrSvg);
  }, [enroll]);

  const handleGenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<EnrollResponse>('/api/auth/mfa/enroll');
      setEnroll(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPost('/api/auth/mfa/enroll/verify', { code: code.trim() });
      setVerified(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!enroll) return;
    await navigator.clipboard.writeText(enroll.recoveryCodes.join('\n'));
  };

  if (verified) {
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-2xl font-bold text-primary-700">Two-factor authentication enabled</h1>
        <p className="text-text-secondary">
          You will be asked for a code from your authenticator app on every future login.
        </p>
        <a
          href="../"
          className="inline-block rounded-md bg-primary-700 px-4 py-2 font-semibold text-white"
        >
          Back to dashboard
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-primary-700">Set up two-factor authentication</h1>
      <p className="text-text-secondary">
        Scan the QR code with Google Authenticator, 1Password, or any TOTP app.
      </p>

      {!enroll ? (
        <button
          type="button"
          onClick={() => {
            void handleGenerate();
          }}
          disabled={busy}
          className="rounded-md bg-primary-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Generating…' : 'Generate'}
        </button>
      ) : (
        <>
          <div className="mx-auto h-56 w-56" dangerouslySetInnerHTML={{ __html: qrSvg ?? '' }} />
          <p className="text-sm text-text-secondary">Or enter this key manually:</p>
          <p className="font-mono tracking-wider">{enroll.manualSecret}</p>

          <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <h2 className="font-bold">Recovery codes</h2>
            <p className="text-sm">
              Save these now — each can be used once if you lose access to your authenticator. We
              cannot show them again.
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
              {enroll.recoveryCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                void handleCopy();
              }}
              className="mt-2 rounded-md bg-amber-500 px-3 py-1 text-sm font-semibold text-white"
            >
              Copy all
            </button>
          </section>

          <section className="space-y-2">
            <label htmlFor="mfa-code" className="text-sm font-semibold">
              Enter the 6-digit code
            </label>
            <input
              id="mfa-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
              }}
              className="w-full rounded-md border border-primary-100 p-2 text-center text-lg tracking-widest"
              placeholder="123456"
            />
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={() => {
                void handleVerify();
              }}
              className="w-full rounded-md bg-primary-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          </section>
        </>
      )}

      {error && <p className="text-red-600">{error}</p>}
    </main>
  );
}
