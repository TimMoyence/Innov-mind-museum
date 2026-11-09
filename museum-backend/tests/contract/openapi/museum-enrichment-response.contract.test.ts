import { assertMatchesOpenApiResponse } from 'tests/helpers/openapi/openapi-response-validator';

describe('QA-06 — OpenAPI enrichment response contract (R3)', () => {
  it('GET /api/museums/{id}/enrichment 200 (ready) validates against the spec WITH the four rich fields', () => {
    assertMatchesOpenApiResponse({
      path: '/api/museums/{id}/enrichment',
      method: 'get',
      statusCode: 200,
      payload: {
        status: 'ready',
        data: {
          museumId: 1,
          locale: 'fr',
          summary: 'Un musée bordelais.',
          wikidataQid: 'Q3329534',
          website: 'https://www.musee-aquitaine-bordeaux.fr',
          phone: null,
          imageUrl: null,
          openingHours: null,
          admissionFees: { adult: '6 €', under18: 'gratuit' },
          collections: { highlights: ['Préhistoire'] },
          currentExhibitions: null,
          accessibility: { wheelchairAccess: true },
          fetchedAt: '2026-05-30T08:00:00.000Z',
        },
      },
    });
  });

  it('GET /api/museums/{id}/enrichment 202 (pending) validates against the spec', () => {
    assertMatchesOpenApiResponse({
      path: '/api/museums/{id}/enrichment',
      method: 'get',
      statusCode: 202,
      payload: { status: 'pending', jobId: 'mus:1:fr' },
    });
  });
});
