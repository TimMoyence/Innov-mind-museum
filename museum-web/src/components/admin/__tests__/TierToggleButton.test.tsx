import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AdminUserDTO } from '@/lib/admin-types';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import { AuthProvider } from '@/lib/auth';
import { mockAdminDict } from '@/__tests__/helpers/admin-dict.fixture';

import { TierToggleButton } from '@/components/admin/TierToggleButton';

const mockApiPatch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiPatch: (...args: unknown[]) => mockApiPatch(...args) as Promise<unknown>,
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/users/42',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const tierDictExt = {
  label: 'Tier',
  currentFree: 'Free tier',
  currentPremium: 'Premium tier',
  toggleToPremium: 'Promote to premium',
  toggleToFree: 'Demote to free',
  confirmTitle: 'Change user tier?',
  confirmBody: 'This change is logged in the audit chain. The user is not notified automatically.',
  confirmCta: 'Confirm tier change',
  cancel: 'Cancel',
  success: 'Tier updated.',
  error: 'Could not update tier.',
} as const;

const extendedDict = {
  ...mockAdminDict,
  userDetailPage: {
    ...mockAdminDict.userDetailPage,
    tier: tierDictExt,
  },
};

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDictProvider dict={extendedDict as unknown as typeof mockAdminDict} locale="en">
      <AuthProvider>{children}</AuthProvider>
    </AdminDictProvider>
  );
}

function makeUser(
  overrides: Partial<AdminUserDTO & { tier: 'free' | 'premium' }> = {},
): AdminUserDTO {
  return {
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
    ...overrides,
  } as unknown as AdminUserDTO;
}

describe('TierToggleButton (R1 §1 R31-R33)', () => {
  beforeEach(() => {
    mockApiPatch.mockReset();
  });

  it('R32: viewer role admin (not super_admin) → no button, read-only label only', () => {
    render(
      <Providers>
        <TierToggleButton user={makeUser({ tier: 'free' })} viewerRole="admin" />
      </Providers>,
    );
    expect(screen.getByText(tierDictExt.currentFree)).toBeTruthy();
    expect(screen.queryByRole('button', { name: tierDictExt.toggleToPremium })).toBeNull();
  });

  it('R31: free user + super_admin viewer → button labelled "Promote to premium"', () => {
    render(
      <Providers>
        <TierToggleButton user={makeUser({ tier: 'free' })} viewerRole="super_admin" />
      </Providers>,
    );
    expect(screen.getByRole('button', { name: tierDictExt.toggleToPremium })).toBeTruthy();
  });

  it('R31: premium user + super_admin viewer → button labelled "Demote to free"', () => {
    render(
      <Providers>
        <TierToggleButton user={makeUser({ tier: 'premium' })} viewerRole="super_admin" />
      </Providers>,
    );
    expect(screen.getByRole('button', { name: tierDictExt.toggleToFree })).toBeTruthy();
  });

  it('R33: clicking the button opens a confirm modal with confirmTitle + confirmBody', () => {
    render(
      <Providers>
        <TierToggleButton user={makeUser({ tier: 'free' })} viewerRole="super_admin" />
      </Providers>,
    );
    fireEvent.click(screen.getByRole('button', { name: tierDictExt.toggleToPremium }));
    expect(screen.getByText(tierDictExt.confirmTitle)).toBeTruthy();
    expect(screen.getByText(tierDictExt.confirmBody)).toBeTruthy();
  });

  it('R33: confirm CTA → apiPatch(/api/admin/users/42/tier, {tier:premium}) called once', async () => {
    mockApiPatch.mockResolvedValueOnce({ user: makeUser({ tier: 'premium' }) });
    const onUpdated = vi.fn();
    render(
      <Providers>
        <TierToggleButton
          user={makeUser({ tier: 'free' })}
          viewerRole="super_admin"
          onUpdated={onUpdated}
        />
      </Providers>,
    );
    fireEvent.click(screen.getByRole('button', { name: tierDictExt.toggleToPremium }));
    fireEvent.click(screen.getByRole('button', { name: tierDictExt.confirmCta }));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledTimes(1);
    });
    expect(mockApiPatch).toHaveBeenCalledWith('/api/admin/users/42/tier', {
      tier: 'premium',
    });
    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalled();
    });
  });

  it('apiPatch failure → renders error text from dict, modal stays open', async () => {
    mockApiPatch.mockRejectedValueOnce(new Error('boom'));
    render(
      <Providers>
        <TierToggleButton user={makeUser({ tier: 'free' })} viewerRole="super_admin" />
      </Providers>,
    );
    fireEvent.click(screen.getByRole('button', { name: tierDictExt.toggleToPremium }));
    fireEvent.click(screen.getByRole('button', { name: tierDictExt.confirmCta }));

    await waitFor(() => {
      expect(screen.getByText(tierDictExt.error)).toBeTruthy();
    });
    expect(screen.getByText(tierDictExt.confirmTitle)).toBeTruthy();
  });

  it('cancel button → closes modal, no apiPatch call', () => {
    render(
      <Providers>
        <TierToggleButton user={makeUser({ tier: 'free' })} viewerRole="super_admin" />
      </Providers>,
    );
    fireEvent.click(screen.getByRole('button', { name: tierDictExt.toggleToPremium }));
    fireEvent.click(screen.getByRole('button', { name: tierDictExt.cancel }));
    expect(screen.queryByText(tierDictExt.confirmTitle)).toBeNull();
    expect(mockApiPatch).not.toHaveBeenCalled();
  });
});
