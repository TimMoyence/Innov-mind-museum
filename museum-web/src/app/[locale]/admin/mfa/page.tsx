'use client';

import { useEffect, useState, type ReactElement } from 'react';
import QRCode from 'qrcode';

import { apiPost } from '@/lib/api';
import { useAdminDict } from '@/lib/admin-dictionary';

interface EnrollResponse {
  otpauthUrl: string;
  manualSecret: string;
  recoveryCodes: string[];
}

export default function AdminMfaPage(): ReactElement {
  const t = useAdminDict().mfaPage;
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
        <h1 className="text-2xl font-bold text-primary-700">{t.successTitle}</h1>
        <p className="text-text-secondary">{t.successBody}</p>
        <a
          href="../"
          className="inline-block rounded-md bg-primary-700 px-4 py-2 font-semibold text-white"
        >
          {t.backToDashboard}
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-primary-700">{t.setupTitle}</h1>
      <p className="text-text-secondary">{t.setupIntro}</p>

      {!enroll ? (
        <button
          type="button"
          onClick={() => {
            void handleGenerate();
          }}
          disabled={busy}
          className="rounded-md bg-primary-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {busy ? t.generating : t.generateButton}
        </button>
      ) : (
        <>
          <div
            role="img"
            aria-label={t.qrAriaLabel}
            className="mx-auto h-56 w-56"
            dangerouslySetInnerHTML={{ __html: qrSvg ?? '' }}
          />
          <p className="text-sm text-text-secondary">{t.manualSecretIntro}</p>
          <p className="font-mono tracking-wider">{enroll.manualSecret}</p>

          <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <h2 className="font-bold">{t.recoveryTitle}</h2>
            <p className="text-sm">{t.recoveryWarning}</p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
              {enroll.recoveryCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <button
              type="button"
              aria-label={t.copyAllAria}
              onClick={() => {
                void handleCopy();
              }}
              className="mt-2 rounded-md bg-amber-700 px-3 py-1 text-sm font-semibold text-white"
            >
              {t.copyAll}
            </button>
          </section>

          <section className="space-y-2">
            <label htmlFor="mfa-code" className="text-sm font-semibold">
              {t.codeLabel}
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
              placeholder={t.codePlaceholder}
            />
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={() => {
                void handleVerify();
              }}
              className="w-full rounded-md bg-primary-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
              {busy ? t.verifying : t.verifyButton}
            </button>
          </section>
        </>
      )}

      {error && (
        <p className="text-red-600">
          {t.errorPrefix}
          {error}
        </p>
      )}
    </main>
  );
}
