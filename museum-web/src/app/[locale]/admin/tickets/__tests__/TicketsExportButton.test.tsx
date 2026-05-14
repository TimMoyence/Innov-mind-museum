/**
 * R2 RED — `<ExportCsvButton kind="tickets" />` on /admin/tickets.
 *
 * Pins R2 §1 R21 + Q1 BLOCKER down BEFORE implementation. The tickets page
 * and the support page render the SAME `kind=tickets` (both surfaces point
 * at `support_tickets`, per spec Appendix A note).
 *
 *  - Button visible for super_admin only.
 *  - Click → fetch /api/admin/export/tickets.csv.
 *
 * MUST FAIL at baseline `a77e48aa`.
 */
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
  return { ...actual, useAuth: () => useAuthMock() };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/tickets',
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

describe('ExportCsvButton kind=tickets — tickets page (R2 R21 / Q1 BLOCKER)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('super_admin sees the button', () => {
    render(
      <Providers userRole="super_admin">
        <ExportCsvButton kind="tickets" />
      </Providers>,
    );
    expect(screen.getByRole('button', { name: /Export Tickets/i })).toBeInTheDocument();
  });

  it('museum_manager does NOT see the button (Q1 BLOCKER)', () => {
    render(
      <Providers userRole="museum_manager">
        <ExportCsvButton kind="tickets" />
      </Providers>,
    );
    expect(screen.queryByRole('button', { name: /Export Tickets/i })).toBeNull();
  });

  it('moderator does NOT see the button (Q3)', () => {
    render(
      <Providers userRole="moderator">
        <ExportCsvButton kind="tickets" />
      </Providers>,
    );
    expect(screen.queryByRole('button', { name: /Export Tickets/i })).toBeNull();
  });

  it('click → fetches /api/admin/export/tickets.csv', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(new Blob(['id\r\n']), {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="tickets-2026-05-14.csv"' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <Providers userRole="super_admin">
        <ExportCsvButton kind="tickets" />
      </Providers>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Export Tickets/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/export/tickets.csv',
        expect.objectContaining({ credentials: 'include' }),
      );
    });
  });
});
