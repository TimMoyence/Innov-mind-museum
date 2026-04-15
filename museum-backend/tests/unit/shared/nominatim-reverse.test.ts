import { reverseGeocodeWithNominatim } from '@shared/http/nominatim.client';

// Suppress logger output during tests
jest.mock('@shared/logger/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('reverseGeocodeWithNominatim', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns parsed result for a valid Nominatim response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Musee du Louvre, Rue de Rivoli, 1er Arrondissement, Paris, France',
        name: 'Musee du Louvre',
        address: {
          road: 'Rue de Rivoli',
          neighbourhood: '1er Arrondissement',
          suburb: 'Paris Centre',
          city: 'Paris',
          country: 'France',
        },
      }),
    });

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(result).not.toBeNull();
    expect(result!.displayName).toContain('Musee du Louvre');
    expect(result!.name).toBe('Musee du Louvre');
    expect(result!.address.road).toBe('Rue de Rivoli');
    expect(result!.address.city).toBe('Paris');
    expect(result!.address.country).toBe('France');
    expect(result!.address.suburb).toBe('Paris Centre');
  });

  it('falls back to town when city is absent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Some Place, Small Town, France',
        address: {
          road: 'Main Street',
          town: 'Small Town',
          country: 'France',
        },
      }),
    });

    const result = await reverseGeocodeWithNominatim(47.0, 3.0);

    expect(result).not.toBeNull();
    expect(result!.address.city).toBe('Small Town');
  });

  it('falls back to village when city and town are absent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Some Place, Tiny Village, France',
        address: {
          village: 'Tiny Village',
          country: 'France',
        },
      }),
    });

    const result = await reverseGeocodeWithNominatim(47.0, 3.0);

    expect(result).not.toBeNull();
    expect(result!.address.city).toBe('Tiny Village');
  });

  it('returns null when response is not OK', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(result).toBeNull();
  });

  it('returns null when display_name is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: '',
        address: {},
      }),
    });

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(result).toBeNull();
  });

  it('returns null on fetch error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(result).toBeNull();
  });

  it('returns null on abort (timeout simulation)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376, 100);

    expect(result).toBeNull();
  });

  it('sets name to undefined when response has no name', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Some address, Paris, France',
        address: {
          road: 'Rue Test',
          city: 'Paris',
          country: 'France',
        },
      }),
    });

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(result).not.toBeNull();
    expect(result!.name).toBeUndefined();
  });

  it('sends correct query parameters', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Test',
        address: {},
      }),
    });

    await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = new URL((global.fetch as jest.Mock).mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/reverse');
    expect(calledUrl.searchParams.get('lat')).toBe('48.8606');
    expect(calledUrl.searchParams.get('lon')).toBe('2.3376');
    expect(calledUrl.searchParams.get('format')).toBe('json');
    expect(calledUrl.searchParams.get('addressdetails')).toBe('1');
    expect(calledUrl.searchParams.get('zoom')).toBe('18');
  });

  it('sends User-Agent header', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: 'Test', address: {} }),
    });

    await reverseGeocodeWithNominatim(48.8606, 2.3376);

    const fetchOptions = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(fetchOptions.headers).toEqual({ 'User-Agent': 'Musaium/1.0' });
  });
});
