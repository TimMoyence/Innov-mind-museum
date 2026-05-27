/**
 * C1B (RED — UFR-022 fresh-context red phase 2026-05-26).
 *
 * AdminShell nav-prune contract (spec-c1b.md AC-6 / R8, design-c1b.md §2 web,
 * tasks-c1b.md T-R4). A `museum_manager` must see EXACTLY the nav links it can
 * use after C1B's BE work — `{ Dashboard, Reviews, Tickets, NPS }` — and NONE
 * of the surfaces that remain admin-only or out of this slice's scope
 * (`Users`, `Audit Logs`, `Reports`, `Analytics`, `Support`).
 *
 * The usable set is derived from the backend `requireRole` allow-list per
 * endpoint (`admin.route.ts`), tenant-scoped to the manager's own museum:
 *   - dashboard → GET /api/admin/stats    requireRole(admin,moderator,museum_manager)  ✓
 *   - nps       → GET /api/admin/nps       requireRole(admin,moderator,museum_manager)  ✓ (route line 291)
 *   - reviews   → GET /api/admin/reviews   ✓ post-green (C1B BE adds museum_manager + scope)
 *   - tickets   → GET /api/admin/tickets   ✓ post-green (C1B BE adds museum_manager + scope)
 *   - users     → GET /api/admin/users          admin,moderator only          → hidden
 *   - auditLogs → GET /api/admin/audit-logs     admin only                    → hidden
 *   - reports   → GET /api/admin/reports        admin,moderator only          → hidden
 *   - analytics → GET /api/admin/analytics/*    admin only                    → hidden
 *   - support   → /admin/support (user-self-scoped /api/support/tickets/:id,
 *                 NOT a museum-scoped admin surface)                          → hidden
 * Today `AdminShell.tsx:85` maps every `NAV_KEYS` entry unconditionally for any
 * role that clears the shell `RoleGuard` (which now admits `museum_manager`),
 * so a manager gets five dead 403 links. A panel that is mostly dead links is
 * not usable.
 *
 * Auth strategy : `AdminShell` hosts its own `AuthProvider` + `RoleGuard`, so
 * the sidebar only renders for an authenticated, allow-listed user. The clean
 * in-band way to reach that state is the provider's mount-time hydration path
 * (`auth.tsx:117-141`): if the readable `admin-authz` cookie is present, the
 * provider probes `GET /api/auth/me` and sets the user from the response. We
 * therefore set that cookie and mock `apiGet('/api/auth/me')` to return a user
 * with the target role — no login-button round-trip needed, and it exercises
 * the real guard → real sidebar render.
 *
 * Labels asserted come from `mockAdminDict` (`admin-dict.fixture.ts`):
 *   dashboard→'Dashboard', reviewsAdmin→'Reviews', tickets→'Tickets',
 *   users→'Users', auditLogs→'Audit Logs', reports→'Reports',
 *   analytics→'Analytics', supportAdmin→'Support', nps→'NPS'.
 *
 * Baseline failure : `AdminShell.tsx` renders all nine NAV_KEYS for the
 * manager → the "manager does NOT see Users/Audit Logs/Reports/Analytics/
 * Support" assertions FAIL (those four/five links are still rendered).
 *
 * Frozen-test invariant (UFR-022 phase red) : immutable byte-for-byte once
 * committed. Suspect a test is wrong → `BLOCK-TEST-WRONG <path>:<line>
 * <reason>`, never edit.
 *
 * Lib-docs consulted : `lib-docs/react/PATTERNS.md` (§8 testing patterns —
 * observable DOM assertions, generous async `findBy*`/`waitFor`; `next` nav
 * mocking mirrors admin-auth.test.tsx). Testing Library is a dev test util
 * with no dedicated lib-docs entry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AdminShell from '@/components/admin/AdminShell';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import type { UserRole } from '@/lib/admin-types';

// ── Next.js mocks ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  // NOT `/admin/login` — otherwise AdminShell returns the login-only branch.
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

// ── API mock ────────────────────────────────────────────────────────────────

const mockApiGet = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPost: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

// ── Helper: render AdminShell with a hydrated user of the given role ─────────

/**
 * Sets the `admin-authz` hint cookie and stubs `GET /api/auth/me` to return a
 * user with `role`, so AdminShell's AuthProvider hydrates an authenticated
 * session and the RoleGuard renders the sidebar.
 */
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
    // Clear the auth hint cookie so suites don't bleed into each other.
    document.cookie = 'admin-authz=; Path=/; Max-Age=0';
  });

  it('museum_manager sees ONLY Dashboard, Reviews, Tickets, NPS', async () => {
    renderShellAsRole('museum_manager');

    // Allowed links present once the session hydrates (each maps to an
    // endpoint whose requireRole admits museum_manager, tenant-scoped).
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Reviews' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tickets' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'NPS' })).toBeInTheDocument();

    // Out-of-scope links MUST be hidden (these FAIL on baseline — all nine
    // keys render for the manager today).
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audit Logs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Support' })).not.toBeInTheDocument();

    // No empty <li> in the manager sidebar (every list item carries a link).
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
    // All base labels present for admin (no regression).
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
