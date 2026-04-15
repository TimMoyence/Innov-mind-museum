import { fetchDailyArt } from '@/features/daily-art/infrastructure/dailyArtApi';

jest.mock('@/shared/api/httpRequest', () => ({
  httpRequest: jest.fn(),
}));

import { httpRequest } from '@/shared/api/httpRequest';
const mockHttpRequest = httpRequest as jest.Mock;

const sampleArtwork = {
  title: 'Starry Night',
  artist: 'Van Gogh',
  year: '1889',
  imageUrl: 'https://example.com/starry.jpg',
  description: 'A famous painting',
  funFact: 'Painted from memory',
  museum: 'MoMA',
};

describe('fetchDailyArt', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls httpRequest with locale query parameter (via openApiRequest)', async () => {
    mockHttpRequest.mockResolvedValue({ artwork: sampleArtwork });

    const result = await fetchDailyArt('fr');

    // openApiRequest now handles the query-string encoding, so the URL arrives
    // at httpRequest already-formatted. The second arg is the openApiRequest
    // options envelope (method/body/headers/requiresAuth).
    expect(mockHttpRequest).toHaveBeenCalledWith(
      '/api/daily-art?locale=fr',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual(sampleArtwork);
  });

  it('defaults locale to en when not specified', async () => {
    mockHttpRequest.mockResolvedValue({ artwork: sampleArtwork });

    await fetchDailyArt();

    expect(mockHttpRequest).toHaveBeenCalledWith(
      '/api/daily-art?locale=en',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns the artwork from the response envelope', async () => {
    mockHttpRequest.mockResolvedValue({ artwork: sampleArtwork });

    const result = await fetchDailyArt('de');

    expect(result.title).toBe('Starry Night');
    expect(result.artist).toBe('Van Gogh');
  });
});
