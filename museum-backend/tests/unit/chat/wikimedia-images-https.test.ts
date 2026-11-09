jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { ArtworkEmbeddingRepositoryPg } from '@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg';
import { WikidataClient } from '@modules/chat/adapters/secondary/search/wikidata.client';
import { ImageEnrichmentService } from '@modules/chat/useCase/image/image-enrichment.service';
import { ChatSessionService } from '@modules/chat/useCase/session/chat-session.service';
import { TypeOrmMuseumEnrichmentCacheAdapter } from '@modules/museum/adapters/secondary/enrichment/typeorm-museum-enrichment-cache.adapter';
import { HttpWikidataMuseumClient } from '@modules/museum/adapters/secondary/external/wikidata-museum.client';

import type { Museum } from '@modules/museum/domain/museum/museum.entity';
import type { DataSource } from 'typeorm';

import { makeCache } from '../../helpers/chat/cache.fixtures';
import { makeEnrichedImage } from '../../helpers/chat/enrichedImage.fixtures';
import { makeMessage, makeSession, makeSessionUser } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';

const SESSION_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const HTTPS_IMAGE = 'https://commons.wikimedia.org/wiki/Special:FilePath/Pont%20de%20pierre.jpg';
const HTTP_IMAGE = HTTPS_IMAGE.replace('https:', 'http:');

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('M1 · une image Wikimedia venue de Wikidata est servie en https', () => {
  it('M1 · l’œuvre reconnue dans le chat porte son image en https', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        json({
          search: [{ id: 'Q1323', label: 'Pont de Pierre', description: 'oil painting by Turner' }],
        }),
      )
      .mockResolvedValueOnce(json({ results: { bindings: [{ image: { value: HTTP_IMAGE } }] } }));

    const facts = await new WikidataClient().lookup({ searchTerm: 'Pont de Pierre' });

    expect(facts?.imageUrl).toBe(HTTPS_IMAGE);
  });

  it('M1 · la photo d’un musée tirée de Wikidata est en https', async () => {
    fetchSpy.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('sparql')
          ? json({
              results: {
                bindings: [{ itemLabel: { value: 'CAPC' }, image: { value: HTTP_IMAGE } }],
              },
            })
          : json({ entities: {} }),
      ),
    );

    const facts = await new HttpWikidataMuseumClient().fetchFacts({
      qid: 'Q1027548',
      locale: 'fr',
    });

    expect(facts?.imageUrl).toBe(HTTPS_IMAGE);
  });

  it('M1 · une œuvre similaire enregistrée en http ressort en https', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        qid: 'Q1323',
        museum_qid: null,
        museum_id: null,
        title: 'Pont de Pierre',
        artist: null,
        image_url: HTTP_IMAGE,
        license: 'cc0',
        image_source: 'wikimedia',
        embedding: '[]',
        embedding_model_version: 'v1',
        created_at: new Date(),
        updated_at: new Date(),
        similarity: 0.9,
      },
    ]);
    const repo = new ArtworkEmbeddingRepositoryPg({ query } as unknown as DataSource);

    const [nearest] = await repo.findNearest(new Float32Array([0.5, 0.5]), 1, { museumId: 1 });

    expect(nearest?.metadata.imageUrl).toBe(HTTPS_IMAGE);
  });

  it('M1 · la fiche musée gardée en cache avec une photo http la rend en https', async () => {
    const row = {
      id: 1,
      museumId: 42,
      locale: 'fr',
      summary: null,
      wikidataQid: 'Q1027548',
      website: null,
      phone: null,
      imageUrl: HTTP_IMAGE,
      openingHours: null,
      fetchedAt: new Date(),
    };
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(row),
    };
    const dataSource = {
      getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })),
    } as unknown as DataSource;
    const adapter = new TypeOrmMuseumEnrichmentCacheAdapter(
      dataSource,
      {} as unknown as typeof Museum,
    );

    const view = await adapter.findFresh({ museumId: 42, locale: 'fr', freshWindowMs: 60_000 });

    expect(view?.imageUrl).toBe(HTTPS_IMAGE);
  });

  it('M1 · une œuvre relue dans le dump ou le cache Wikidata avec une image http ressort en https dans les images du chat', () => {
    const service = new ImageEnrichmentService(undefined, {
      cacheTtlMs: 60_000,
      cacheMaxEntries: 100,
      fetchTimeoutMs: 5_000,
      maxImagesPerResponse: 3,
    });

    const [image] = service.mergeWikidataImage([], HTTP_IMAGE, 'pont de pierre');

    expect(image?.url).toBe(HTTPS_IMAGE);
    expect(image?.thumbnailUrl.startsWith(`${HTTPS_IMAGE}?`)).toBe(true);
  });

  it('M1 · une image enregistrée en http dans un ancien message ressort en https à la relecture de la session', async () => {
    const session = makeSession({ id: SESSION_ID, user: makeSessionUser(42) });
    const oldImage = makeEnrichedImage({
      url: HTTP_IMAGE,
      thumbnailUrl: `${HTTP_IMAGE}?width=330`,
    });
    const message = makeMessage({ session, role: 'assistant', metadata: { images: [oldImage] } });
    const repository = makeChatRepo({
      getSessionById: jest.fn().mockResolvedValue(session),
      listSessionMessages: jest
        .fn()
        .mockResolvedValue({ messages: [message], nextCursor: null, hasMore: false }),
    });
    const resultBeforeDeploy = {
      session: { id: SESSION_ID },
      messages: [{ id: message.id, metadata: { images: [oldImage] } }],
    };
    const cache = makeCache({
      get: jest
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(key === `session:${SESSION_ID}:first:20` ? resultBeforeDeploy : null),
        ),
    });
    const service = new ChatSessionService({ repository, cache });

    const result = await service.getSession(SESSION_ID, { limit: 20 }, 42);

    expect(result.messages[0]?.metadata).toEqual({
      images: [
        expect.objectContaining({ url: HTTPS_IMAGE, thumbnailUrl: `${HTTPS_IMAGE}?width=330` }),
      ],
    });
  });
});
