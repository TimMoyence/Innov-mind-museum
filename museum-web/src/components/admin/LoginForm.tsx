'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Button from '@/components/ui/Button';
import type { Dictionary } from '@/lib/i18n';

interface LoginFormProps {
  dict: Dictionary['admin']['login'];
}

export default function LoginForm({ dict }: LoginFormProps) {
  const { login, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const locale = pathname.split('/')[1] ?? 'fr';

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-primary-100 to-[#D5F0FF] px-4">
      <div className="w-full max-w-md rounded-2xl border border-primary-100 bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-primary-700">Musaium</h1>
          <p className="mt-2 text-sm text-text-secondary">{dict.title}</p>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
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
              onChange={(e) => { setEmail(e.target.value); }}
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
              onChange={(e) => { setPassword(e.target.value); }}
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
      </div>
    </div>
  );
}
