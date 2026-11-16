import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import MuseumsListPage from '@/app/[locale]/admin/museums/page';
import NewMuseumPage from '@/app/[locale]/admin/museums/new/page';
import MuseumBrandingPage from '@/app/[locale]/admin/museums/[id]/branding/page';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import fr from '@/dictionaries/fr.json';
import type * as ApiModule from '@/lib/api';
import type { Dictionary } from '@/lib/i18n';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '7' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  registerLogoutHandler: vi.fn(),
}));

const { ApiError } = await import('@/lib/api');

const frAdmin = (fr as unknown as Dictionary).admin;

const inFrench = (page: React.ReactNode) =>
  render(
    <AdminDictProvider dict={frAdmin} locale="fr">
      {page}
    </AdminDictProvider>,
  );

describe('MUSEES-FR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MUSEES-FR · la liste des musées parle français, chargement refusé compris', async () => {
    mockApiGet.mockRejectedValueOnce(new ApiError(500, 'Error', 'boom', 'INTERNAL_ERROR'));
    inFrench(<MuseumsListPage />);

    expect(screen.getByRole('heading', { name: 'Musées' })).toBeInTheDocument();
    expect(await screen.findByText('Impossible de charger les musées.')).toBeInTheDocument();
  });

  it('MUSEES-FR · la création parle français : champs obligatoires, puis slug déjà pris', async () => {
    mockApiPost.mockRejectedValueOnce(new ApiError(409, 'Conflict', 'slug exists', 'CONFLICT'));
    inFrench(<NewMuseumPage />);

    expect(screen.getByRole('heading', { name: 'Ajouter un musée' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Créer le musée' }));
    expect(await screen.findByText('Le nom est obligatoire.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Orsay' } });
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'orsay' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le musée' }));

    expect(
      await screen.findByText('Ce slug est déjà pris. Choisissez-en un autre.'),
    ).toBeInTheDocument();
  });

  it('MUSEES-FR · l’image de marque parle français, chargement refusé compris', async () => {
    mockApiGet.mockRejectedValueOnce(new ApiError(404, 'Not Found', 'nope', 'NOT_FOUND'));
    inFrench(<MuseumBrandingPage />);

    expect(await screen.findByText('Impossible de charger le musée.')).toBeInTheDocument();
  });
});
