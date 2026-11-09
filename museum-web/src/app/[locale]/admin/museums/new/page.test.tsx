import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewMuseumPage from './page';

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn() }),
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

const mockApiPost = vi.fn();

vi.mock('@/lib/api', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args) as Promise<unknown>,
  apiGet: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

function typeInto(el: HTMLElement, value: string): void {
  fireEvent.change(el, { target: { value } });
}

describe('NewMuseumPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the form with name + slug + type fields', () => {
    render(<NewMuseumPage />);
    expect(screen.getByRole('heading', { name: /onboard a new museum/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^slug$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^type$/i)).toBeInTheDocument();
  });

  it('blocks submission when name and slug are empty', async () => {
    render(<NewMuseumPage />);
    fireEvent.click(screen.getByRole('button', { name: /create museum/i }));
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/slug is required/i)).toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('rejects an invalid slug format', async () => {
    render(<NewMuseumPage />);
    typeInto(screen.getByLabelText(/^name$/i), 'Louvre');
    typeInto(screen.getByLabelText(/^slug$/i), 'Louvre With Spaces!');
    fireEvent.click(screen.getByRole('button', { name: /create museum/i }));
    expect(
      await screen.findByText(/slug must be lowercase letters, digits, and hyphens only/i),
    ).toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('rejects out-of-range latitude', async () => {
    render(<NewMuseumPage />);
    typeInto(screen.getByLabelText(/^name$/i), 'X');
    typeInto(screen.getByLabelText(/^slug$/i), 'x');
    typeInto(screen.getByLabelText(/^latitude/i), '120');
    fireEvent.click(screen.getByRole('button', { name: /create museum/i }));
    expect(await screen.findByText(/latitude must be between/i)).toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('POSTs valid payload and redirects to branding page on success', async () => {
    mockApiPost.mockResolvedValueOnce({
      museum: {
        id: 42,
        name: 'Louvre',
        slug: 'louvre',
        museumType: 'art',
        address: null,
        description: null,
        latitude: null,
        longitude: null,
        config: {},
        isActive: true,
        createdAt: '2026-05-17T00:00:00Z',
        updatedAt: '2026-05-17T00:00:00Z',
      },
    });
    render(<NewMuseumPage />);
    typeInto(screen.getByLabelText(/^name$/i), 'Louvre');
    typeInto(screen.getByLabelText(/^slug$/i), 'louvre');
    fireEvent.click(screen.getByRole('button', { name: /create museum/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/museums',
        expect.objectContaining({ name: 'Louvre', slug: 'louvre', museumType: 'art' }),
      );
    });
    expect(pushSpy).toHaveBeenCalledWith('42/branding');
  });

  it('surfaces server error message and keeps form values', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('slug already taken'));
    render(<NewMuseumPage />);
    typeInto(screen.getByLabelText(/^name$/i), 'Louvre');
    typeInto(screen.getByLabelText(/^slug$/i), 'louvre');
    fireEvent.click(screen.getByRole('button', { name: /create museum/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/slug already taken/i);
    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Louvre');
    expect(pushSpy).not.toHaveBeenCalled();
  });
});
