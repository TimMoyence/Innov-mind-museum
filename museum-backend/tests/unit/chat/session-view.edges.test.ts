import { withHttpsImages } from '@modules/chat/useCase/session/session.view';

import type { SessionResult } from '@modules/chat/useCase/orchestration/chat.service.types';

const HTTPS_IMAGE = 'https://commons.wikimedia.org/wiki/Special:FilePath/Pont%20de%20pierre.jpg';

const page = (metadata: SessionResult['messages'][number]['metadata']): SessionResult => ({
  session: {
    id: 's-1',
    locale: 'fr',
    museumMode: false,
    title: null,
    museumName: null,
    createdAt: '2026-11-09T00:00:00.000Z',
    updatedAt: '2026-11-09T00:00:00.000Z',
    intent: 'default',
  },
  messages: [{ id: 'm-1', role: 'assistant', createdAt: '2026-11-09T00:00:00.000Z', metadata }],
  page: { nextCursor: null, hasMore: false, limit: 20 },
});

const metadataOf = (result: SessionResult) => result.messages[0]?.metadata;

describe('withHttpsImages · cas limites de la relecture d’une session', () => {
  it('garde des métadonnées nulles telles quelles', () => {
    expect(metadataOf(withHttpsImages(page(null)))).toBeNull();
  });

  it('garde des métadonnées sans images telles quelles', () => {
    expect(metadataOf(withHttpsImages(page({ sources: [] })))).toEqual({ sources: [] });
  });

  it('M1 · une carte Œuvres similaires enregistrée en http ressort en https à la relecture de la session', () => {
    const httpImage = HTTPS_IMAGE.replace('https:', 'http:');
    const match = {
      qid: 'Q1323',
      imageUrl: httpImage,
      thumbnailUrl: httpImage,
      facts: { imageUrl: httpImage },
    };

    expect(metadataOf(withHttpsImages(page({ compareResults: { matches: [match] } })))).toEqual({
      compareResults: {
        matches: [
          {
            qid: 'Q1323',
            imageUrl: HTTPS_IMAGE,
            thumbnailUrl: HTTPS_IMAGE,
            facts: { imageUrl: HTTPS_IMAGE },
          },
        ],
      },
    });
  });

  it('ne touche pas un texte qui n’est pas une URL', () => {
    expect(metadataOf(withHttpsImages(page({ deeperContext: 'http: le protocole' })))).toEqual({
      deeperContext: 'http: le protocole',
    });
  });

  it('ne touche pas une image http hors de Wikimedia', () => {
    const image = { url: 'http://example.org/a.jpg', thumbnailUrl: 'http://example.org/a-330.jpg' };

    expect(metadataOf(withHttpsImages(page({ images: [image] })))).toEqual({ images: [image] });
  });
});
