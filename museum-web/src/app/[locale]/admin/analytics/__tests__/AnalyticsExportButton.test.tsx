import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportCsvButton } from '@/components/admin/ExportCsvButton';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import type { UserRole } from '@/lib/admin-types';

const mockUser = { id: 1, email: 'a@b.com', name: 'a', role: 'super_admin' as UserRole };
const useAuthMock = vi.fn(() => ({
  user: mockUser,
  isAuthenticated: true,
  isLoading: false,
  isHydrating: false,
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useAuth: () => useAuthMock(),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/analytics',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

type AdminDictWithExport = typeof mockAdminDict & {
  export: {
    sessions: { label: string; downloading: string; error: string };
    reviews: { label: string; downloading: string; error: string };
    tickets: { label: string; downloading: string; error: string };
  };
};
const dictWithExport: AdminDictWithExport = {
  ...mockAdminDict,
  export: {
    sessions: { label: 'Export Sessions', downloading: 'Downloading...', error: 'Failed' },
    reviews: { label: 'Export Reviews', downloading: 'Downloading...', error: 'Failed' },
    tickets: { label: 'Export Tickets', downloading: 'Downloading...', error: 'Failed' },
  },
};

function Providers({ children, userRole }: { children: React.ReactNode; userRole: UserRole }) {
  mockUser.role = userRole;
  return (
    <AdminDictProvider dict={dictWithExport as unknown as typeof mockAdminDict} locale="en">
      {children}
    </AdminDictProvider>
  );
}

describe('ExportCsvButton kind=sessions (R2 R21 / R22 / R23 / R24)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('renders the button label from dict.admin.export.sessions.label (R21)', () => {
    render(
      <Providers userRole="super_admin">
        <ExportCsvButton kind="sessions" />
      </Providers>,
    );
    expect(screen.getByRole('button', { name: /Export Sessions/i })).toBeInTheDocument();
  });

  it('is hidden for visitor role', () => {
    render(
      <Providers userRole="visitor">
        <ExportCsvButton kind="sessions" />
      </Providers>,
    );
    expect(screen.queryByRole('button', { name: /Export Sessions/i })).toBeNull();
  });

  it('is hidden for moderator role (Q3)', () => {
    render(
      <Providers userRole="moderator">
        <ExportCsvButton kind="sessions" />
      </Providers>,
    );
    expect(screen.queryByRole('button', { name: /Export Sessions/i })).toBeNull();
  });

  it('is visible for museum_manager on sessions (Risk7 — museum_manager can pull sessions)', () => {
    render(
      <Providers userRole="museum_manager">
        <ExportCsvButton kind="sessions" />
      </Providers>,
    );
    expect(screen.getByRole('button', { name: /Export Sessions/i })).toBeInTheDocument();
  });

  it('click → fetches /api/admin/export/sessions.csv with credentials (R23)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(new Blob(['id,user_id\r\n1,2\r\n'], { type: 'text/csv' }), {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="sessions-2026-05-14.csv"' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <Providers userRole="super_admin">
        <ExportCsvButton kind="sessions" />
      </Providers>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Export Sessions/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/export/sessions.csv',
        expect.objectContaining({ credentials: 'include' }),
      );
    });
  });

  it('loading state — button is aria-busy during fetch (R22)', async () => {
    let resolveFetch: (r: Response) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <Providers userRole="super_admin">
        <ExportCsvButton kind="sessions" />
      </Providers>,
    );
    const btn = screen.getByRole('button', { name: /Export Sessions/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn.getAttribute('aria-busy')).toBe('true');
    });

    resolveFetch(new Response(new Blob([]), { status: 200 }));
  });

  it('error state surfaces on non-2xx response (R24)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('boom', { status: 500 })));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <Providers userRole="super_admin">
        <ExportCsvButton kind="sessions" />
      </Providers>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Export Sessions/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed/i)).toBeInTheDocument();
    });
  });
});
