/**
 * I-SEC8 (RUN_ID 2026-05-25-isec8-museum-scope) — RED unit test.
 *
 * Locks down that `PrepareMessagePipeline.resolveCurrentArtwork` forwards the
 * session's tenant axis (`session.museumId`) to the artwork-knowledge lookup,
 * so the OWASP LLM08 cross-tenant scope (closed at the repo SQL layer) is
 * actually exercised from the hot chat path (spec AC-5, AC-6).
 *
 * Target behaviour:
 *   - AC-5 (museumId forwarded + cross-tenant miss): a session with
 *     `museumId = 1` pointing at a `currentArtworkId` whose row belongs to a
 *     different tenant → the scoped repo returns `null` → no `[CURRENT ARTWORK]`
 *     data surfaces (`PrepareReady.currentArtwork === null`). The pipeline MUST
 *     have called `findById(currentArtworkId, 1)`.
 *   - AC-6 (B2C NULL → catalog hit): a session with `museumId = null` pointing
 *     at a global-catalog row → `findById(currentArtworkId, null)` and the
 *     catalog title still surfaces (`currentArtwork.title === 'Mona Lisa'`).
 *
 * RED rationale: the current `resolveCurrentArtwork` calls
 * `repo.findById(currentArtworkId)` with ONE argument, so
 * `toHaveBeenCalledWith(<uuid>, 1)` / `(<uuid>, null)` fail on the current code.
 */

import { makeSession, makeSessionUser } from 'tests/helpers/chat/message.fixtures';
import { makeChatRepo } from 'tests/helpers/chat/repo.fixtures';
import { makeArtworkKnowledge } from 'tests/helpers/knowledge-extraction/extraction.fixtures';

import { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import { ImageProcessingService } from '@modules/chat/useCase/image/image-processing.service';
import { PrepareMessagePipeline } from '@modules/chat/useCase/orchestration/prepare-message.pipeline';

import type { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';

const SESSION_UUID = '00000000-0000-4000-8000-000000000010';
const ARTWORK_UUID = '00000000-0000-4000-8000-0000000000bb';
const TENANT_A = 1;

/**
 * Builds a fake `ArtworkKnowledgeRepoPort` whose `findById` is a spyable
 * `jest.fn()` resolving the supplied row; all other port methods are inert
 * stubs (the pipeline only touches `findById` on this path).
 * @param findByIdResult The row (or null) the lookup resolves to.
 * @returns The port double plus its `findById` jest.Mock for call assertions.
 */
function makeArtworkRepoPort(findByIdResult: ArtworkKnowledge | null): {
  port: ArtworkKnowledgeRepoPort;
  findById: jest.Mock;
} {
  const findById = jest.fn().mockResolvedValue(findByIdResult);
  const port: ArtworkKnowledgeRepoPort = {
    findById,
    findByTitleAndLocale: jest.fn().mockResolvedValue(null),
    searchByTitle: jest.fn().mockResolvedValue([]),
    upsertFromClassification: jest.fn(),
    findNeedsReview: jest.fn().mockResolvedValue([]),
    approve: jest.fn().mockResolvedValue(null),
  };
  return { port, findById };
}

/**
 * Assembles a `PrepareMessagePipeline` wired with the given session + artwork
 * repo port, mirroring the construction used by the sibling redaction suite.
 * @param session The ChatSession the repository resolves for `SESSION_UUID`.
 * @param artworkPort The fake artwork-knowledge repo port to inject.
 * @returns The pipeline under test.
 */
function makePipeline(
  session: ReturnType<typeof makeSession>,
  artworkPort: ArtworkKnowledgeRepoPort,
): PrepareMessagePipeline {
  const repository = makeChatRepo({
    getSessionById: jest.fn().mockResolvedValue(session),
    persistMessage: jest.fn().mockResolvedValue(undefined),
    listSessionHistory: jest.fn().mockResolvedValue([]),
  });
  const guardrail = new GuardrailEvaluationService({ repository });
  const imageProcessor = {} as unknown as ImageProcessingService;
  return new PrepareMessagePipeline({
    repository,
    imageProcessor,
    guardrail,
    artworkKnowledgeRepo: artworkPort,
  });
}

describe('PrepareMessagePipeline — I-SEC8 museum_id scope forwarding', () => {
  it('AC-5: forwards session.museumId to findById and emits no artwork block on a cross-tenant miss', async () => {
    const session = makeSession({
      id: SESSION_UUID,
      user: makeSessionUser(1),
      museumId: TENANT_A,
      currentArtworkId: ARTWORK_UUID,
    });
    // Cross-tenant row excluded by the repo scope ⇒ lookup resolves null.
    const { port, findById } = makeArtworkRepoPort(null);
    const pipeline = makePipeline(session, port);

    const prep = await pipeline.prepare(
      SESSION_UUID,
      { text: 'tell me about this painting' },
      'req-isec8-ac5',
      1,
      '127.0.0.1',
    );

    expect(findById).toHaveBeenCalledWith(ARTWORK_UUID, TENANT_A);
    expect(prep.kind).toBe('ready');
    if (prep.kind !== 'ready') return;
    // Lookup attempted but scoped-out ⇒ null (no [CURRENT ARTWORK] data).
    expect(prep.currentArtwork).toBeNull();
  });

  it('AC-6: B2C session (museumId null) forwards null and still surfaces the global-catalog title', async () => {
    const session = makeSession({
      id: SESSION_UUID,
      user: makeSessionUser(1),
      museumId: null,
      currentArtworkId: ARTWORK_UUID,
    });
    const catalogRow = makeArtworkKnowledge({ title: 'Mona Lisa', roomId: null });
    const { port, findById } = makeArtworkRepoPort(catalogRow);
    const pipeline = makePipeline(session, port);

    const prep = await pipeline.prepare(
      SESSION_UUID,
      { text: 'tell me about this painting' },
      'req-isec8-ac6',
      1,
      '127.0.0.1',
    );

    expect(findById).toHaveBeenCalledWith(ARTWORK_UUID, null);
    expect(prep.kind).toBe('ready');
    if (prep.kind !== 'ready') return;
    expect(prep.currentArtwork?.title).toBe('Mona Lisa');
  });
});
