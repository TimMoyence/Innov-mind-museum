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
