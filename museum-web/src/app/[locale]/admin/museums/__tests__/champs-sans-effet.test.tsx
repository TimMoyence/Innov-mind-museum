import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import NewMuseumPage from '../new/page';
import MuseumBrandingPage from '../[id]/branding/page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '7' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockApiGet = vi.fn();
vi.mock('@/lib/api', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

describe('M7 · les champs sans effet disparaissent de l’admin', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('Nouveau musée : plus de champ KB locale', () => {
    render(<NewMuseumPage />);

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByLabelText(/KB locale/i)).toBeNull();
  });

  it('Branding : seules la couleur principale et le logo restent', async () => {
    mockApiGet.mockResolvedValueOnce({
      museum: {
        id: 7,
        name: 'Orsay',
        slug: 'orsay',
        museumType: 'art',
        address: null,
        description: null,
        latitude: null,
        longitude: null,
        config: { branding: { primaryColor: '#aa0000' } },
        isActive: true,
        createdAt: '2026-05-17T00:00:00Z',
        updatedAt: '2026-05-17T00:00:00Z',
      },
    });
    render(<MuseumBrandingPage />);

    expect(await screen.findByLabelText('Primary color')).toBeInTheDocument();
    expect(screen.getByLabelText('Logo URL')).toBeInTheDocument();
    expect(screen.queryByLabelText('Secondary color')).toBeNull();
    expect(screen.queryByLabelText('Accent color')).toBeNull();
  });
});
