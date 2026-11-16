import { Suspense, useEffect, useMemo } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AuthProvider, useAuth } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import UserDetailPage from '@/app/[locale]/admin/users/[id]/page';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import { requireIndex } from '@/__tests__/helpers/require-index';
import type { AdminUserDTO } from '@/lib/admin-types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/users/42',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const TARGET: AdminUserDTO = {
  id: 42,
  email: 'bob@test.com',
  firstname: 'Bob',
  lastname: 'Smith',
  role: 'admin',
  museumId: null,
  emailVerified: true,
  suspended: false,
  deletedAt: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-06-01T00:00:00Z',
};

const json = (status: number, body: unknown): Response =>
  ({
    ok: status < 400,
    status,
    statusText: status === 409 ? 'Conflict' : 'OK',
    json: () => Promise.resolve(body),
  }) as Response;

const serverRefuses = (method: string, path: string, code: string) => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    const verb = init?.method ?? 'GET';
    if (url.endsWith('/api/auth/login')) {
      return Promise.resolve(
        json(200, {
          accessToken: 'at',
          refreshToken: 'rt',
          expiresIn: 900,
          refreshExpiresIn: 86400,
          user: {
            id: 99,
            email: 'owner@musaium.test',
            firstname: 'Owner',
            lastname: null,
            role: 'super_admin',
            onboardingCompleted: true,
          },
        }),
      );
    }
    if (verb === method && url.endsWith(path)) {
      return Promise.resolve(json(409, { error: { code, message: code, requestId: 'req-1' } }));
    }
    return Promise.resolve(json(200, { user: TARGET }));
  });
};

function AuthenticatedDetailPage() {
  const { login, isAuthenticated } = useAuth();
  useEffect(() => {
    if (!isAuthenticated) void login('owner@musaium.test', 'pass');
  }, [isAuthenticated, login]);
  const params = useMemo(() => Promise.resolve({ locale: 'en', id: '42' }), []);
  if (!isAuthenticated) return <div>Logging in…</div>;
  return <UserDetailPage params={params} />;
}

const renderPage = async () => {
  render(
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>
        <Suspense fallback={<div>Loading…</div>}>
          <AuthenticatedDetailPage />
        </Suspense>
      </AuthProvider>
    </AdminDictProvider>,
  );
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1, name: 'Bob Smith' })).toBeInTheDocument();
  });
};

const confirmIn = (name: string) => {
  const buttons = screen
    .getAllByRole('button', { name })
    .filter((button) => button.closest('[role="dialog"]') !== null);
  fireEvent.click(requireIndex(buttons, 0, `${name} confirm`));
};

describe('CODES-ADMIN', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.cookie = 'admin-authz=; Path=/; Max-Age=0; SameSite=Lax';
  });

  it('CODES-ADMIN · le serveur refuse de supprimer le dernier administrateur (409 { error: { code: CANNOT_DELETE_LAST_ADMIN } }) : la page affiche « Cannot delete the last admin. », jamais le libellé HTTP', async () => {
    serverRefuses('DELETE', '/api/admin/users/42', 'CANNOT_DELETE_LAST_ADMIN');
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.change(await screen.findByLabelText('Type email to confirm'), {
      target: { value: 'bob@test.com' },
    });
    confirmIn('Delete');

    expect(await screen.findByText('Cannot delete the last admin.')).toBeInTheDocument();
    expect(screen.queryByText('Conflict')).not.toBeInTheDocument();
  });

  it('CODES-ADMIN · le serveur refuse une suspension de soi-même (409 { error: { code: CANNOT_SUSPEND_SELF } }) : la page affiche « You cannot perform this action on your own account. »', async () => {
    serverRefuses('POST', '/api/admin/users/42/suspend', 'CANNOT_SUSPEND_SELF');
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await screen.findByRole('dialog');
    confirmIn('Suspend');

    expect(
      await screen.findByText('You cannot perform this action on your own account.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Conflict')).not.toBeInTheDocument();
  });
});
