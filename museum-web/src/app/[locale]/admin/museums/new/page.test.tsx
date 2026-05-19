/**
 * NewMuseumPage — W4 W2.1.
 * Verifies: required-field validation (name + slug), slug format check,
 * lat/lng range check, successful POST → redirect to branding page.
 * Uses fireEvent + change/click directly (no @testing-library/user-event
 * dep in this workspace — see existing admin tests for the pattern).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewMuseumPage from './page';

// ── Next.js mocks ─────────────────────────────────────────────────────────

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

// ── API mock ──────────────────────────────────────────────────────────────

const mockApiPost = vi.fn();

vi.mock('@/lib/api', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args) as Promise<unknown>,
  apiGet: vi.fn(),
  registerLogoutHandler: vi.fn(),
}));

function typeInto(el: HTMLElement, value: string): void {
  fireEvent.change(el, { target: { value } });
}

// ── Tests ────────────────────────────────────────────────────────────────

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

  it('includes optional config.kbLocale when provided', async () => {
    mockApiPost.mockResolvedValueOnce({
      museum: { id: 1, name: 'X', slug: 'x', museumType: 'art', config: {}, isActive: true },
    });
    render(<NewMuseumPage />);
    typeInto(screen.getByLabelText(/^name$/i), 'X');
    typeInto(screen.getByLabelText(/^slug$/i), 'x');
    typeInto(screen.getByLabelText(/kb locale/i), 'fr');
    fireEvent.click(screen.getByRole('button', { name: /create museum/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalled();
    });
    const body = mockApiPost.mock.calls[0]?.[1] as { config?: { kbLocale?: string } };
    expect(body.config?.kbLocale).toBe('fr');
  });
});
