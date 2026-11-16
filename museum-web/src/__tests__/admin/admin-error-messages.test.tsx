import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AuthProvider } from '@/lib/auth';
import { AdminDictProvider } from '@/lib/admin-dictionary';
import TicketsPage from '@/app/[locale]/admin/tickets/page';
import NewMuseumPage from '@/app/[locale]/admin/museums/new/page';
import { mockAdminDict, withAdminDict } from '@/__tests__/helpers/admin-dict.fixture';
import { requireIndex } from '@/__tests__/helpers/require-index';
import type * as ApiModule from '@/lib/api';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/admin/tickets',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { mockApiGet, mockApiPatch, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPatch: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiGet: mockApiGet,
  apiPatch: mockApiPatch,
  apiPost: mockApiPost,
}));

const { ApiError } = await import('@/lib/api');

const SERVER_TEXT = 'status must be one of: open, in_progress, resolved, closed';
const serverRejects = (code: string) => new ApiError(400, 'Bad Request', SERVER_TEXT, code);

const ticket = {
  id: 't-1',
  userId: 42,
  subject: 'Cannot upload photo',
  description: 'The photo upload fails repeatedly.',
  status: 'open',
  priority: 'high',
  category: 'bug',
  assignedTo: null,
  createdAt: '2025-06-01T08:00:00Z',
  updatedAt: '2025-06-01T08:00:00Z',
  messageCount: 3,
};

const renderTickets = () =>
  render(
    <AdminDictProvider dict={mockAdminDict} locale="en">
      <AuthProvider>
        <TicketsPage />
      </AuthProvider>
    </AdminDictProvider>,
  );

describe('MESSAGES-ADMIN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MESSAGES-ADMIN · un chargement refusé par le serveur affiche le message traduit de l’écran (« Could not load the tickets. »), jamais le texte du serveur', async () => {
    mockApiGet.mockRejectedValueOnce(serverRejects('VALIDATION_ERROR'));
    renderTickets();

    expect(await screen.findByText('Could not load the tickets.')).toBeInTheDocument();
    expect(screen.queryByText(SERVER_TEXT)).not.toBeInTheDocument();
  });

  it('MESSAGES-ADMIN · une mise à jour de ticket refusée affiche « Could not update the ticket. », jamais le texte du serveur', async () => {
    mockApiGet.mockResolvedValueOnce({
      data: [ticket],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    mockApiPatch.mockRejectedValueOnce(serverRejects('VALIDATION_ERROR'));
    renderTickets();

    fireEvent.click(requireIndex(await screen.findAllByText('Update'), 0, 'update buttons'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(requireIndex(Array.from(dialog.querySelectorAll('select')), 0, 'status'), {
      target: { value: 'resolved' },
    });
    fireEvent.click(screen.getByText('Confirm'));

    expect(await screen.findByText('Could not update the ticket.')).toBeInTheDocument();
    expect(screen.queryByText(SERVER_TEXT)).not.toBeInTheDocument();
  });

  it('MESSAGES-ADMIN · un slug déjà pris (409 CONFLICT) affiche « This slug is already taken. Choose another one. » ; tout autre refus affiche « Could not create museum. »', async () => {
    mockApiPost
      .mockRejectedValueOnce(new ApiError(409, 'Conflict', SERVER_TEXT, 'CONFLICT'))
      .mockRejectedValueOnce(serverRejects('VALIDATION_ERROR'));
    render(<NewMuseumPage />, withAdminDict);
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Louvre' } });
    fireEvent.change(screen.getByLabelText(/^slug$/i), { target: { value: 'louvre' } });

    fireEvent.click(screen.getByRole('button', { name: /create museum/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This slug is already taken. Choose another one.',
    );

    fireEvent.click(screen.getByRole('button', { name: /create museum/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not create museum.');
    });
    expect(screen.queryByText(SERVER_TEXT)).not.toBeInTheDocument();
  });
});
