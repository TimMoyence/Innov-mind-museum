import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

function museumWith(primaryColor: string) {
  return {
    museum: {
      id: 7,
      name: 'Orsay',
      slug: 'orsay',
      museumType: 'art' as const,
      address: null,
      description: null,
      latitude: null,
      longitude: null,
      config: { branding: { primaryColor } },
      isActive: true,
      createdAt: '2026-05-17T00:00:00Z',
      updatedAt: '2026-05-17T00:00:00Z',
    },
  };
}

describe('M6 · l’aperçu Branding montre la couleur de texte de l’appli', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it.each([
    ['#38A169', '#000000'],
    ['#808080', '#FFFFFF'],
    ['#0a2540', '#FFFFFF'],
    ['#FFEB3B', '#000000'],
  ])('fond %s : texte %s, comme dans l’appli', async (primaryColor, textColor) => {
    mockApiGet.mockResolvedValueOnce(museumWith(primaryColor));
    render(<MuseumBrandingPage />);

    const preview = await screen.findByRole('group', { name: 'Preview' });
    const header = preview.querySelector('div');
    expect(header).not.toBeNull();
    expect(header).toHaveStyle({ color: textColor });
  });
});
