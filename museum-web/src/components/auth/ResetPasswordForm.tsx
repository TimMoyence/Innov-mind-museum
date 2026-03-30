'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { apiPost } from '@/lib/api';
import Button from '@/components/ui/Button';
import type { Dictionary } from '@/lib/i18n';

interface ResetPasswordFormProps {
  dict: Dictionary['resetPassword'];
}

function ResetPasswordFormInner({ dict }: ResetPasswordFormProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const token = searchParams.get('token');
  const locale = pathname.split('/')[1] ?? 'fr';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-primary-100 to-[#D5F0FF] px-4">
        <div className="w-full max-w-md rounded-2xl border border-primary-100 bg-white p-8 shadow-lg text-center">
          <div className="mb-4 text-4xl">🔗</div>
          <h1 className="text-xl font-bold text-primary-700">{dict.invalidToken}</h1>
          <Link
            href={`/${locale}/admin/login`}
            className="mt-6 inline-block text-sm font-medium text-primary-600 hover:text-primary-700 underline underline-offset-2"
          >
            {dict.backToLogin}
          </Link>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-primary-100 to-[#D5F0FF] px-4">
        <div className="w-full max-w-md rounded-2xl border border-primary-100 bg-white p-8 shadow-lg text-center">
          <div className="mb-4 text-4xl">✓</div>
          <h1 className="text-xl font-bold text-primary-700">{dict.success}</h1>
          <p className="mt-2 text-sm text-text-secondary">{dict.successHint}</p>
          <Link
            href={`/${locale}/admin/login`}
            className="mt-6 inline-block text-sm font-medium text-primary-600 hover:text-primary-700 underline underline-offset-2"
          >
            {dict.backToLogin}
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError(dict.passwordTooShort);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(dict.passwordMismatch);
      return;
    }

    setIsLoading(true);
    try {
      await apiPost('/api/auth/reset-password', { token, newPassword });
      setIsSuccess(true);
    } catch {
      setError(dict.error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-primary-100 to-[#D5F0FF] px-4">
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
            <label htmlFor="new-password" className="sr-only">
              {dict.newPassword}
            </label>
            <input
              id="new-password"
              type="password"
              required
              autoComplete="new-password"
              placeholder={dict.newPassword}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
              }}
              className="w-full rounded-lg border border-primary-200 bg-white px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="sr-only">
              {dict.confirmPassword}
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              autoComplete="new-password"
              placeholder={dict.confirmPassword}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
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

        <div className="mt-6 text-center">
          <Link
            href={`/${locale}/admin/login`}
            className="text-sm font-medium text-primary-600 hover:text-primary-700 underline underline-offset-2"
          >
            {dict.backToLogin}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordForm({ dict }: ResetPasswordFormProps) {
  return (
    <Suspense>
      <ResetPasswordFormInner dict={dict} />
    </Suspense>
  );
}
