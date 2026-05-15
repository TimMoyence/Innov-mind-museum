/**
 * R1 RED — user detail page wires TierToggleButton (T1.14 — K in brief).
 *
 * Pins R1 §0.3 web + §3.6 D6 down BEFORE implementation : the admin user
 * detail page at `/admin/users/[id]` MUST render `<TierToggleButton>` next
 * to the existing role / suspend / delete sections, AND the AdminUserDTO
 * surfaced from the page MUST include the new `tier` field.
 *
 * MUST FAIL at baseline `cd7e22bc` :
 *  - `TierToggleButton` component does not exist (import fails at module load).
 *  - `userDetailPage.tier.*` dict subtree is absent.
 *  - The page TSX has no `<TierToggleButton>` JSX node.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { AdminDictProvider } from '@/lib/admin-dictionary';
import { AuthProvider } from '@/lib/auth';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import UserDetailPage from '@/app/[locale]/admin/users/[id]/page';

// ── Next.js mocks ──────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/users/42',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// ── API mocks — return a user DTO INCLUDING the new `tier` field ──────

const mockApiGet = vi.fn();
const mockApiPatch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPatch: (...args: unknown[]) => mockApiPatch(...args) as Promise<unknown>,
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  ApiError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  registerLogoutHandler: vi.fn(),
}));

// ── Extended dict with the new tier subtree (T2 will add it for real) ─

const extendedDict = {
  ...mockAdminDict,
  userDetailPage: {
    ...mockAdminDict.userDetailPage,
    tier: {
      label: 'Tier',
      currentFree: 'Free tier',
      currentPremium: 'Premium tier',
      toggleToPremium: 'Promote to premium',
      toggleToFree: 'Demote to free',
      confirmTitle: 'Change user tier?',
      confirmBody: 'Audit-logged change.',
      confirmCta: 'Confirm tier change',
      cancel: 'Cancel',
      success: 'Tier updated.',
      error: 'Could not update tier.',
    },
  },
};

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={extendedDict as unknown as typeof mockAdminDict} locale="en">
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

describe('User detail page wires TierToggleButton (R1 §0.3 web + §3.6 D6)', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPatch.mockReset();
  });

  // ── Static-source assertion : page imports TierToggleButton ──────────

  it('page TSX imports TierToggleButton from @/components/admin', () => {
    const file = resolve(__dirname, '..', 'page.tsx');
    expect(existsSync(file)).toBe(true);
    const src = readFileSync(file, 'utf8');
    // The green agent MAY use `@/components/admin/TierToggleButton` or
    // `@/components/admin` (barrel). Either should match.
    const importsToggle =
      /from\s+['"]@\/components\/admin(\/TierToggleButton)?['"]/.test(src) &&
      src.includes('TierToggleButton');
    expect(importsToggle).toBe(true);
  });

  // ── Runtime assertion : DTO carries `tier`, button renders ───────────

  it('page renders TierToggleButton when user DTO includes tier=free', async () => {
    mockApiGet.mockResolvedValueOnce({
      user: {
        id: 42,
        email: 'visitor@example.com',
        role: 'visitor',
        firstname: null,
        lastname: null,
        museumId: null,
        emailVerified: true,
        suspended: false,
        deletedAt: null,
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
        tier: 'free',
      },
    });

    const params = Promise.resolve({ locale: 'en', id: '42' });
    render(
      <Providers>
        <UserDetailPage params={params} />
      </Providers>,
    );

    // The page boots, fetches the user, then renders the tier section.
    // Read-only label OR the toggle button must surface — both consume
    // dict.userDetailPage.tier.currentFree.
    await waitFor(() => {
      expect(screen.getByText('Free tier')).toBeTruthy();
    });
  });
});
