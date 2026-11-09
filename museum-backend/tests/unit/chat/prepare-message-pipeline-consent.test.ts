const recordedEnrichmentCalls = { fetchEnrichmentData: 0, resolveLocationForMessage: 0 };

jest.mock('@modules/chat/useCase/enrichment/enrichment-fetcher', () => ({
  fetchEnrichmentData: jest.fn(async () => {
    recordedEnrichmentCalls.fetchEnrichmentData += 1;
    return await Promise.resolve({
      userMemoryBlock: undefined,
      knowledgeBaseBlock: undefined,
      localKnowledgeBlock: undefined,
      webSearchBlock: undefined,
      webSearchResults: [],
      enrichedImages: [],
    });
  }),
}));

jest.mock('@modules/chat/useCase/location-resolver', () => {
  return {
    resolveLocationForMessage: jest.fn(async () => {
      recordedEnrichmentCalls.resolveLocationForMessage += 1;
      return await Promise.resolve(undefined);
    }),
  };
});

import { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import { ImageProcessingService } from '@modules/chat/useCase/image/image-processing.service';
import { PrepareMessagePipeline } from '@modules/chat/useCase/orchestration/prepare-message.pipeline';
import { buildThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import { makeUserConsentRepo } from 'tests/helpers/auth/userConsent-repo.mock';
import { makeConsentGranted, applyConsentGrantSpec } from 'tests/helpers/auth/consent.fixtures';
import { makeSession, makeSessionUser } from 'tests/helpers/chat/message.fixtures';
import { makeChatRepo } from 'tests/helpers/chat/repo.fixtures';

import type { PostMessageInput } from '@modules/chat/domain/chat.types';

const SESSION_UUID = '00000000-0000-4000-8000-0000000000a1';
const USER_ID = 42;

function makePipeline(args: {
  consentRepo: ReturnType<typeof makeUserConsentRepo>;
  persistMessage?: jest.Mock;
}): { pipeline: PrepareMessagePipeline; persistMessage: jest.Mock } {
  const persistMessage = args.persistMessage ?? jest.fn().mockResolvedValue(undefined);
  const session = makeSession({ id: SESSION_UUID, user: makeSessionUser(USER_ID) });

  const repository = makeChatRepo({
    getSessionById: jest.fn().mockResolvedValue(session),
    persistMessage,
    persistBlockedExchange: jest.fn().mockResolvedValue({
      sessionId: SESSION_UUID,
      message: {
        id: 'blocked-1',
        role: 'assistant' as const,
        text: 'refused',
        createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      },
      metadata: {},
    }),
    listSessionHistory: jest.fn().mockResolvedValue([]),
  });

  const guardrail = new GuardrailEvaluationService({ repository });
  const imageProcessor = {
    processImage: jest.fn(async (image: NonNullable<PostMessageInput['image']>) =>
      Promise.resolve({
        imageRef: 'ref-x',
        orchestratorImage: image,
        imageContentHash: 'hash-x',
      }),
    ),
    runOcrGuard: jest.fn().mockResolvedValue(undefined),
  } as unknown as ImageProcessingService;

  const thirdPartyAiConsentChecker = buildThirdPartyAiConsentChecker(args.consentRepo);

  const pipeline = new PrepareMessagePipeline({
    repository,
    imageProcessor,
    guardrail,
    thirdPartyAiConsentChecker,
  } as unknown as ConstructorParameters<typeof PrepareMessagePipeline>[0]);

  return { pipeline, persistMessage };
}

beforeEach(() => {
  recordedEnrichmentCalls.fetchEnrichmentData = 0;
  recordedEnrichmentCalls.resolveLocationForMessage = 0;
  process.env.LLM_PROVIDER = 'openai';
});

describe('PrepareMessagePipeline — third_party_ai_<text|image>_<provider> gate (B6 / R2, R3, R5, D3)', () => {
  it('R2 — refuses text dispatch when third_party_ai_text_openai is DENIED (no LLM invocation, no enrichment)', async () => {
    const repo = makeUserConsentRepo();
    const { pipeline, persistMessage } = makePipeline({ consentRepo: repo });

    const prep = await pipeline.prepare(
      SESSION_UUID,
      { text: 'tell me about Monet' },
      'req-r2-deny',
      USER_ID,
      '127.0.0.1',
    );

    expect(prep.kind).toBe('refused');
    if (prep.kind !== 'refused') return;

    expect(recordedEnrichmentCalls.fetchEnrichmentData).toBe(0);
    expect(recordedEnrichmentCalls.resolveLocationForMessage).toBe(0);

    expect(persistMessage).not.toHaveBeenCalled();
  });

  it('R2 — allows text dispatch when third_party_ai_text_openai is GRANTED (happy path preserved)', async () => {
    const repo = makeUserConsentRepo();
    await applyConsentGrantSpec(
      repo,
      makeConsentGranted({ userId: USER_ID, scope: 'third_party_ai_text_openai' }),
    );
    const { pipeline } = makePipeline({ consentRepo: repo });

    const prep = await pipeline.prepare(
      SESSION_UUID,
      { text: 'tell me about Monet' },
      'req-r2-allow',
      USER_ID,
      '127.0.0.1',
    );

    expect(prep.kind).toBe('ready');
    expect(recordedEnrichmentCalls.fetchEnrichmentData).toBe(1);
  });

  it('R3 — refuses image dispatch when third_party_ai_image_openai is DENIED (text granted, image denied)', async () => {
    const repo = makeUserConsentRepo();
    await applyConsentGrantSpec(
      repo,
      makeConsentGranted({ userId: USER_ID, scope: 'third_party_ai_text_openai' }),
    );
    const { pipeline, persistMessage } = makePipeline({ consentRepo: repo });

    const prep = await pipeline.prepare(
      SESSION_UUID,
      {
        text: 'what is in this photo?',
        image: {
          source: 'url',
          value: 'https://example.com/test.jpg',
        },
      },
      'req-r3-deny',
      USER_ID,
      '127.0.0.1',
    );

    expect(prep.kind).toBe('refused');
    if (prep.kind !== 'refused') return;

    expect(recordedEnrichmentCalls.fetchEnrichmentData).toBe(0);
    expect(persistMessage).not.toHaveBeenCalled();
  });

  it('R3 — refuses image dispatch when ONLY image scope denied (text path independence — Q2 AND-intersection)', async () => {
    const repo = makeUserConsentRepo();
    await applyConsentGrantSpec(
      repo,
      makeConsentGranted({ userId: USER_ID, scope: 'third_party_ai_text_openai' }),
    );
    const { pipeline } = makePipeline({ consentRepo: repo });

    const prep = await pipeline.prepare(
      SESSION_UUID,
      {
        text: 'describe this',
        image: {
          source: 'url',
          value: 'https://example.com/another.jpg',
        },
      },
      'req-r3-and',
      USER_ID,
      '127.0.0.1',
    );

    expect(prep.kind).toBe('refused');
  });

  it('R2+R3 — allows when BOTH scopes granted for a text+image message', async () => {
    const repo = makeUserConsentRepo();
    await applyConsentGrantSpec(
      repo,
      makeConsentGranted({ userId: USER_ID, scope: 'third_party_ai_text_openai' }),
    );
    await applyConsentGrantSpec(
      repo,
      makeConsentGranted({ userId: USER_ID, scope: 'third_party_ai_image_openai' }),
    );
    const { pipeline } = makePipeline({ consentRepo: repo });

    const prep = await pipeline.prepare(
      SESSION_UUID,
      {
        text: 'describe this',
        image: {
          source: 'url',
          value: 'https://example.com/ok.jpg',
        },
      },
      'req-both-allow',
      USER_ID,
      '127.0.0.1',
    );

    expect(prep.kind).toBe('ready');
    expect(recordedEnrichmentCalls.fetchEnrichmentData).toBe(1);
  });

  it('D3 fail-CLOSED — anonymous user (currentUserId=undefined) is refused even with no repo grants', async () => {
    const repo = makeUserConsentRepo();
    const { pipeline, persistMessage } = makePipeline({ consentRepo: repo });

    const prep = await pipeline.prepare(
      SESSION_UUID,
      { text: 'who is Monet?' },
      'req-anon',
      undefined,
      '127.0.0.1',
    );

    expect(prep.kind).toBe('refused');
    if (prep.kind !== 'refused') return;
    expect(recordedEnrichmentCalls.fetchEnrichmentData).toBe(0);
    expect(persistMessage).not.toHaveBeenCalled();
  });

  it('R5 — revoked grant treated as denial (revokedAt set → refused)', async () => {
    const repo = makeUserConsentRepo();
    await applyConsentGrantSpec(
      repo,
      makeConsentGranted({ userId: USER_ID, scope: 'third_party_ai_text_openai' }),
    );
    await repo.revoke(USER_ID, 'third_party_ai_text_openai');
    const { pipeline } = makePipeline({ consentRepo: repo });

    const prep = await pipeline.prepare(
      SESSION_UUID,
      { text: 'who is Monet?' },
      'req-revoked',
      USER_ID,
      '127.0.0.1',
    );

    expect(prep.kind).toBe('refused');
  });
});
