import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MuseumBrandingPage from './page';
import type * as ApiModule from '@/lib/api';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '7' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

const mockApiGet = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    apiGet: (...args: unknown[]) => mockApiGet(...args) as Promise<unknown>,
    apiPost: vi.fn(),
    registerLogoutHandler: vi.fn(),
  };
});

const fetchSpy = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy);
  vi.clearAllMocks();
  fetchSpy.mockReset();
});

const baseMuseum = {
  id: 7,
  name: 'Orsay',
  slug: 'orsay',
  museumType: 'art' as const,
  address: null,
  description: null,
  latitude: null,
  longitude: null,
  config: { kbLocale: 'fr', branding: { primaryColor: '#aa0000', logoUrl: 'https://cdn/o.svg' } },
  isActive: true,
  createdAt: '2026-05-17T00:00:00Z',
  updatedAt: '2026-05-17T00:00:00Z',
};

function typeInto(el: HTMLElement, value: string): void {
  fireEvent.change(el, { target: { value } });
}

describe('MuseumBrandingPage', () => {
  it('loads the museum and shows existing branding values', async () => {
    mockApiGet.mockResolvedValueOnce({ museum: baseMuseum });
    render(<MuseumBrandingPage />);

    expect(await screen.findByRole('heading', { name: /branding — orsay/i })).toBeInTheDocument();
    const hexInputs = screen.getAllByDisplayValue('#aa0000');
    expect(hexInputs.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByDisplayValue('https://cdn/o.svg')).toBeInTheDocument();
  });

  it('shows error state when the museum cannot be loaded', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('not found'));
    render(<MuseumBrandingPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not found/i);
  });

  it('blocks save when a hex color is malformed', async () => {
    mockApiGet.mockResolvedValueOnce({
      museum: { ...baseMuseum, config: { kbLocale: 'fr', branding: {} } },
    });
    render(<MuseumBrandingPage />);

    const primaryHex = await screen.findByLabelText(/primaryColor hex value/i);
    typeInto(primaryHex, 'not-hex');
    fireEvent.click(screen.getByRole('button', { name: /save branding/i }));

    expect(await screen.findByText(/must be a #RRGGBB hex color/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks save when logo URL is not HTTPS', async () => {
    mockApiGet.mockResolvedValueOnce({
      museum: { ...baseMuseum, config: { branding: {} } },
    });
    render(<MuseumBrandingPage />);

    typeInto(await screen.findByLabelText(/logo url/i), 'http://insecure/logo.png');
    fireEvent.click(screen.getByRole('button', { name: /save branding/i }));

    expect(await screen.findByText(/must be an https url/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('PUTs merged config preserving non-branding keys (e.g. kbLocale)', async () => {
    mockApiGet.mockResolvedValueOnce({ museum: baseMuseum });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ museum: baseMuseum }),
    });

    render(<MuseumBrandingPage />);
    await screen.findByRole('heading', { name: /branding — orsay/i });

    fireEvent.click(screen.getByRole('button', { name: /save branding/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
    const url = callArgs[0];
    const init = callArgs[1];
    expect(url).toBe('/api/museums/7');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string) as {
      config: { kbLocale?: string; branding?: { primaryColor?: string } };
    };
    expect(body.config.kbLocale).toBe('fr');
    expect(body.config.branding?.primaryColor).toBe('#aa0000');
  });

  it('round-trips an edited value: set → submit (in PUT body) → refetch reflects it', async () => {
    mockApiGet.mockResolvedValueOnce({ museum: baseMuseum });

    const persistedMuseum = {
      ...baseMuseum,
      config: {
        kbLocale: 'fr',
        branding: { primaryColor: '#123456', logoUrl: 'https://cdn/new.svg' },
      },
    };
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ museum: persistedMuseum }),
    });

    mockApiGet.mockResolvedValueOnce({ museum: persistedMuseum });

    render(<MuseumBrandingPage />);
    await screen.findByRole('heading', { name: /branding — orsay/i });

    typeInto(await screen.findByLabelText(/primaryColor hex value/i), '#123456');
    typeInto(screen.getByLabelText(/logo url/i), 'https://cdn/new.svg');

    expect(screen.getByLabelText(/primaryColor hex value/i)).toHaveValue('#123456');
    expect(screen.getByLabelText(/logo url/i)).toHaveValue('https://cdn/new.svg');

    fireEvent.click(screen.getByRole('button', { name: /save branding/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/museums/7');
    expect(init.method).toBe('PUT');
    const sentBody = JSON.parse(init.body as string) as {
      config: { kbLocale?: string; branding?: { primaryColor?: string; logoUrl?: string } };
    };
    expect(sentBody.config.kbLocale).toBe('fr');
    expect(sentBody.config.branding?.primaryColor).toBe('#123456');
    expect(sentBody.config.branding?.logoUrl).toBe('https://cdn/new.svg');

    expect(await screen.findByRole('alert')).toHaveTextContent(/branding saved/i);
    await waitFor(() => {
      expect(screen.getByLabelText(/primaryColor hex value/i)).toHaveValue('#123456');
    });
    expect(screen.getByLabelText(/logo url/i)).toHaveValue('https://cdn/new.svg');

    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('surfaces server error from PUT', async () => {
    mockApiGet.mockResolvedValueOnce({
      museum: { ...baseMuseum, config: { branding: {} } },
    });
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Error',
      json: () => Promise.resolve({ message: 'database write failed' }),
    });

    render(<MuseumBrandingPage />);
    await screen.findByRole('heading');
    fireEvent.click(screen.getByRole('button', { name: /save branding/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/database write failed/i);
  });
});
