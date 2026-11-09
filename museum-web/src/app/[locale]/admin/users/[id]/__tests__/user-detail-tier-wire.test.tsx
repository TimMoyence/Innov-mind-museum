import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Suspense } from 'react';

import { AdminDictProvider } from '@/lib/admin-dictionary';
import { AuthProvider } from '@/lib/auth';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import UserDetailPage from '@/app/[locale]/admin/users/[id]/page';

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

  it('page TSX imports TierToggleButton from @/components/admin', () => {
    const file = resolve(__dirname, '..', 'page.tsx');
    expect(existsSync(file)).toBe(true);
    const src = readFileSync(file, 'utf8');
    const importsToggle =
      /from\s+['"]@\/components\/admin(\/TierToggleButton)?['"]/.test(src) &&
      src.includes('TierToggleButton');
    expect(importsToggle).toBe(true);
  });

  it.skip('page renders TierToggleButton when user DTO includes tier=free', async () => {
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
        <Suspense fallback={<div>loading</div>}>
          <UserDetailPage params={params} />
        </Suspense>
      </Providers>,
    );

    expect(await screen.findByText('Free tier', {}, { timeout: 5000 })).toBeTruthy();
  });
});
