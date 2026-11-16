import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { ExportCsvButton } from '@/components/admin/ExportCsvButton';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';

vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAuth: () => ({
    user: { id: 1, email: 'owner@musaium.test', name: 'Owner', role: 'super_admin' },
    isAuthenticated: true,
    isLoading: false,
    isHydrating: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const dict = {
  ...mockAdminDict,
  export: {
    sessions: { label: 'Export Sessions', downloading: 'Downloading...', error: 'Export failed' },
    reviews: { label: 'Export Reviews', downloading: 'Downloading...', error: 'Export failed' },
    tickets: { label: 'Export Tickets', downloading: 'Downloading...', error: 'Export failed' },
  },
} as unknown as typeof mockAdminDict;

const response = (status: number, init: { body?: string; headers?: Record<string, string> } = {}) =>
  new Response(init.body ?? '{}', { status, headers: init.headers });

describe('EXPORT-ADMIN', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:csv'), revokeObjectURL: vi.fn() });
  });

  it('EXPORT-ADMIN · un export lancé avec un jeton expiré rafraîchit la session puis télécharge le fichier nommé par le serveur, sans afficher d’erreur', async () => {
    const calls: string[] = [];
    let exportAttempts = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/api/auth/refresh')) return Promise.resolve(response(200));
      exportAttempts += 1;
      return Promise.resolve(
        exportAttempts === 1
          ? response(401, { body: '{"error":{"code":"UNAUTHORIZED","message":"expired"}}' })
          : response(200, {
              body: 'id,subject\n1,Photo\n',
              headers: { 'Content-Disposition': 'attachment; filename="tickets-2026-11-16.csv"' },
            }),
      );
    });
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });

    render(
      <AdminDictProvider dict={dict} locale="en">
        <ExportCsvButton kind="tickets" />
      </AdminDictProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Export Tickets/i }));

    await waitFor(() => {
      expect(clicked).toEqual(['tickets-2026-11-16.csv']);
    });
    expect(calls).toEqual([
      'GET /api/admin/export/tickets.csv',
      'POST /api/auth/refresh',
      'GET /api/admin/export/tickets.csv',
    ]);
    expect(screen.queryByText('Export failed')).not.toBeInTheDocument();
  });
});
