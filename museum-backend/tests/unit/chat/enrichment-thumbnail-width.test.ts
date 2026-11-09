jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { WikimediaCommonsClient } from '@modules/chat/adapters/secondary/search/wikimedia-commons.client';
import { ImageEnrichmentService } from '@modules/chat/useCase/image/image-enrichment.service';

const ORIGINAL =
  'https://upload.wikimedia.org/wikipedia/commons/e/e4/Bordeaux_Pont_de_pierre_R02.jpg';
const THUMB_330 =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Bordeaux_Pont_de_pierre_R02.jpg/330px-Bordeaux_Pont_de_pierre_R02.jpg';

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const commonsApi = (url: string): Response => {
  if (url.includes('list=search')) {
    return json({ query: { search: [{ title: 'File:Bordeaux Pont de pierre R02.jpg' }] } });
  }
  const asksThumb = new URL(url).searchParams.get('iiurlwidth') === '330';
  return json({
    query: {
      pages: {
        '1': {
          title: 'File:Bordeaux Pont de pierre R02.jpg',
          imageinfo: [
            {
              url: ORIGINAL,
              width: 6016,
              height: 4000,
              ...(asksThumb ? { thumburl: THUMB_330, thumbwidth: 330 } : {}),
            },
          ],
        },
      },
    },
  });
};

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('M1 · une vignette pointe une miniature de 330 px, jamais l’original', () => {
  it('M1 · la vignette Commons est la miniature 330 px, l’original reste l’image plein écran', async () => {
    global.fetch = jest.fn((url: string) =>
      Promise.resolve(commonsApi(url)),
    ) as unknown as typeof fetch;

    const [photo] = await new WikimediaCommonsClient().searchPhotos('Pont de Pierre Bordeaux', 1);

    expect(photo).toMatchObject({ url: ORIGINAL, thumbnailUrl: THUMB_330 });
  });

  it('M1 · la vignette de l’image Wikidata est la miniature 330 px de Special:FilePath', async () => {
    const wikidataImage =
      'https://commons.wikimedia.org/wiki/Special:FilePath/Bordeaux%20Pont%20de%20pierre%20R02.jpg';
    const service = new ImageEnrichmentService(undefined, {
      cacheTtlMs: 60_000,
      cacheMaxEntries: 10,
      fetchTimeoutMs: 1_000,
      maxImagesPerResponse: 5,
    });

    const images = await service.enrich('Pont de Pierre', wikidataImage);

    expect(images[0]).toMatchObject({
      url: wikidataImage,
      thumbnailUrl: `${wikidataImage}?width=330`,
    });
  });
});
