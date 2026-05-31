/**
 * QA-06 RED — OpenAPI contract for the museum enrichment endpoint.
 *
 * Phase RED (UFR-022). Proves D2 from team-runs/qa-06/spec.md: the path
 * `/api/museums/{id}/enrichment` is ENTIRELY ABSENT from
 * `museum-backend/openapi/openapi.json` today, so the generated mobile types
 * (`shared/api/generated/openapi.ts`) carry no enrichment shape and the rich
 * fields can never be contract-verified.
 *
 * Discrimination (verified against the validator helper):
 *  - `getResponseSchema` throws `OpenAPI path not found: <path>` when the path
 *    is missing → these tests FAIL now (the path does not exist).
 *  - After GREEN adds the path + `MuseumEnrichmentReady` schema (with the four
 *    rich fields as nullable `object` + `additionalProperties: true`), the
 *    `ready` payload below validates and these tests pass.
 */

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
