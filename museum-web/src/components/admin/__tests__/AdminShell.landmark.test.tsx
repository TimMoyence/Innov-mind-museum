import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminShell from '@/components/admin/AdminShell';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';

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

vi.mock('@/lib/api', () => ({
  apiGet: () =>
    Promise.resolve({
      user: { id: 1, email: 'admin@musaium.com', firstname: null, lastname: null, role: 'admin' },
    }),
  apiPost: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

describe('ADMIN-LANDMARK', () => {
  afterEach(() => {
    document.cookie = 'admin-authz=; Path=/; Max-Age=0';
  });

  it('ADMIN-LANDMARK · dans le <main> du layout de locale, la page admin n’expose qu’un seul repère principal', async () => {
    document.cookie = 'admin-authz=1; Path=/';
    render(
      <main id="main">
        <AdminShell locale="en" adminDict={mockAdminDict}>
          <div>Admin page body</div>
        </AdminShell>
      </main>,
    );

    await screen.findByRole('button', { name: 'Log out' });
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByText('Admin page body')).toBeInTheDocument();
  });
});
