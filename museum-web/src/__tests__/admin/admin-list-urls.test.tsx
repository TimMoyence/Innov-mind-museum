import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import { getDictionary } from '@/lib/i18n';
import { getAlternates, getOpenGraph } from '@/lib/seo';
import AuditLogsPage from '@/app/[locale]/admin/audit-logs/page';
import ReportsPage from '@/app/[locale]/admin/reports/page';
import ReviewsPage from '@/app/[locale]/admin/reviews/page';
import TicketsPage from '@/app/[locale]/admin/tickets/page';
import UsersPage from '@/app/[locale]/admin/users/page';
import { generateMetadata as accessibilityMetadata } from '@/app/[locale]/accessibility/page';
import { generateMetadata as cookiesMetadata } from '@/app/[locale]/cookies/page';
import { generateMetadata as subprocessorsMetadata } from '@/app/[locale]/subprocessors/page';
import { generateMetadata as termsMetadata } from '@/app/[locale]/terms/page';
import { mockAdminDict } from '../helpers/admin-dict.fixture';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockApiGet = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

const LISTS: [string, ComponentType, string][] = [
  ['audit-logs', AuditLogsPage, '/api/admin/audit-logs?page=1&limit=20'],
  ['reports', ReportsPage, '/api/admin/reports?page=1&limit=20'],
  ['reviews', ReviewsPage, '/api/admin/reviews?page=1&limit=20&status=pending'],
  ['tickets', TicketsPage, '/api/admin/tickets?page=1&limit=20'],
  ['users', UsersPage, '/api/admin/users?page=1&limit=10'],
];

const LEGAL = [
  ['accessibility', accessibilityMetadata],
  ['cookies', cookiesMetadata],
  ['subprocessors', subprocessorsMetadata],
  ['terms', termsMetadata],
] as const;

describe('URL des listes admin et métadonnées des pages légales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockReturnValue(new Promise(() => undefined));
  });

  it.each(LISTS)(
    'la liste %s demande sa première page avec sa taille',
    async (_name, Page, url) => {
      render(
        <AdminDictProvider dict={mockAdminDict} locale="en">
          <AuthProvider>
            <Page />
          </AuthProvider>
        </AdminDictProvider>,
      );
      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(url, expect.anything());
      });
    },
  );

  it.each([
    [
      'tickets',
      TicketsPage,
      [
        ['All statuses', 'in_progress'],
        ['All priorities', 'high'],
      ],
      '/api/admin/tickets?page=1&limit=20&status=in_progress&priority=high',
    ],
    [
      'users',
      UsersPage,
      [
        ['Search...', 'alice'],
        ['All roles', 'admin'],
      ],
      '/api/admin/users?page=1&limit=10&search=alice&role=admin',
    ],
  ] as const)(
    'la liste %s garde l’ordre de ses deux filtres actifs',
    async (_name, Page, filters, url) => {
      render(
        <AdminDictProvider dict={mockAdminDict} locale="en">
          <AuthProvider>
            <Page />
          </AuthProvider>
        </AdminDictProvider>,
      );
      for (const [label, value] of filters) {
        const field = screen.queryByDisplayValue(label) ?? screen.getByPlaceholderText(label);
        fireEvent.change(field, { target: { value } });
      }
      await waitFor(
        () => {
          expect(mockApiGet).toHaveBeenLastCalledWith(url, expect.anything());
        },
        { timeout: 1500 },
      );
    },
  );

  it.each(LEGAL)(
    'la page %s porte son titre de pied de page, ses alternates et son Open Graph',
    async (link, metadata) => {
      const dict = await getDictionary('fr');
      await expect(metadata({ params: Promise.resolve({ locale: 'fr' }) })).resolves.toEqual({
        title: dict.footer.links[link],
        alternates: getAlternates('fr', `/${link}`),
        openGraph: getOpenGraph('fr'),
      });
    },
  );
});
