import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminShell from '@/components/admin/AdminShell';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin',
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
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
const mockApiPost = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPost: (...args: unknown[]) => mockApiPost(...args) as Promise<unknown>,
  registerLogoutHandler: vi.fn(),
}));

function renderShellAsAdmin(): void {
  document.cookie = 'admin-authz=1; Path=/';
  mockApiGet.mockResolvedValue({
    user: { id: 1, email: 'admin@musaium.com', firstname: null, lastname: null, role: 'admin' },
  });
  render(
    <AdminShell locale="en" adminDict={mockAdminDict}>
      <div>Admin page body</div>
    </AdminShell>,
  );
}

describe('WEB-SESSION-LOGOUT-UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.cookie = 'admin-authz=; Path=/; Max-Age=0';
  });

  it('WEB-SESSION-LOGOUT-UI · se déconnecter appelle POST /api/auth/logout puis renvoie vers la connexion', async () => {
    mockApiPost.mockResolvedValueOnce({ success: true });
    renderShellAsAdmin();

    const button = await screen.findByRole('button', { name: 'Log out' });
    expect(screen.getByText('admin@musaium.com')).toBeInTheDocument();
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/en/admin/login');
    });
    expect(mockApiPost).toHaveBeenCalledWith('/api/auth/logout', {}, { skipAuthRefresh: true });
  });

  it('WEB-SESSION-LOGOUT-UI · si l’appel de déconnexion échoue, l’admin quitte quand même la session', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('offline'));
    renderShellAsAdmin();

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/en/admin/login');
    });
    expect(mockApiPost).toHaveBeenCalledWith('/api/auth/logout', {}, { skipAuthRefresh: true });
  });
});
