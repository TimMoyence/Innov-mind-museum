import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AdminShell from '@/components/admin/AdminShell';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import type { UserRole } from '@/lib/admin-types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockApiGet = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPost: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

function renderShellAsRole(role: UserRole): void {
  document.cookie = 'admin-authz=1; Path=/';
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/api/auth/me') {
      return Promise.resolve({
        user: { id: 1, email: `${role}@test.com`, firstname: 'Test', lastname: null, role },
      });
    }
    return Promise.resolve({});
  });

  render(
    <AdminShell locale="en" adminDict={mockAdminDict}>
      <div>Admin page body</div>
    </AdminShell>,
  );
}

describe('AdminShell nav prune (C1B / R8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.cookie = 'admin-authz=; Path=/; Max-Age=0';
  });

  it('museum_manager sees ONLY Dashboard, Reviews, Tickets, NPS', async () => {
    renderShellAsRole('museum_manager');

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Reviews' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tickets' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'NPS' })).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audit Logs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Support' })).not.toBeInTheDocument();

    const emptyItems = Array.from(document.querySelectorAll('nav[aria-label="Admin"] li')).filter(
      (li) => li.querySelector('a') === null,
    );
    expect(emptyItems).toHaveLength(0);
  });

  it('admin (regression) still sees the full nav set', async () => {
    renderShellAsRole('admin');

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    });
    for (const label of [
      'Dashboard',
      'Users',
      'Audit Logs',
      'Reports',
      'Analytics',
      'Tickets',
      'Support',
      'Reviews',
      'NPS',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });
});
