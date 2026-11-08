import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import MuseumBrandingPage from '../page';
import type * as ApiModule from '@/lib/api';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '7' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockApiGet = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
    registerLogoutHandler: vi.fn(),
  };
});

describe('M6 · l’aperçu reste lisible pendant la saisie d’une couleur invalide', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
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
        config: { branding: { primaryColor: '#0a2540' } },
        isActive: true,
        createdAt: '2026-05-17T00:00:00Z',
        updatedAt: '2026-05-17T00:00:00Z',
      },
    });
  });

  it.each(['#fff', 'red', '#12345'])(
    'couleur en cours de saisie %s : fond blanc et texte noir, comme un musée sans couleur',
    async (typed) => {
      render(<MuseumBrandingPage />);
      fireEvent.change(await screen.findByLabelText('primaryColor hex value'), {
        target: { value: typed },
      });

      const header = screen.getByRole('group', { name: 'Preview' }).querySelector('div');
      expect(header).not.toBeNull();
      expect(header).toHaveStyle({ backgroundColor: '#ffffff', color: '#000000' });
    },
  );
});
