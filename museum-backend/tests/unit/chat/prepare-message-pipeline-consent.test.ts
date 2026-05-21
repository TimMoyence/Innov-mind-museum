/**
 * RED — UFR-022 phase=red, Cluster A (B6 / R2 / R3 / R5 / D3),
 * RUN_ID=2026-05-21-p0-gdpr.
 *
 * Asserts the `third_party_ai_<text|image>_<provider>` consent gate inside
 * `PrepareMessagePipeline.prepare()`
 * (`museum-backend/src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts:213-289`).
 *
 * Security-finding context (handoff 013-red-A-R2R3) — `prepare-message.pipeline.ts`
 * does NOT call `ThirdPartyAiConsentChecker.isGranted` for the text or image
 * dispatch sites before returning `kind: 'ready'`. The port + resolver are
 * shipped (`third-party-ai-consent-checker.ts`, `provider-resolver.ts`) but the
 * pipeline call site is absent. Today `pipeline.prepare()` returns
 * `kind: 'ready'` regardless of `third_party_ai_text_*` /
 * `third_party_ai_image_*` state; the user message is persisted, enrichment
 * runs, and downstream `chat-message.service.ts:254`
 * (`this.orchestrator.generate(...)`) is called — i.e. the LLM IS hit on
 * denied scope. R5 (short-circuit) is therefore violated.
 *
 * Acceptance shape (design §3 R2/R3 / §5 / §9 D3, D7):
 *  - text path + `third_party_ai_text_openai = false` (consent denied) →
 *    `prep.kind === 'refused'`, the (mock) orchestrator/LLM client is invoked
 *    ZERO times. Short-circuit happens BEFORE enrichment (no
 *    `fetchEnrichmentData`/`resolveLocationForMessage`/`knowledgeRouter` call)
 *    so that PII (raw user text) never flows into Redis/BullMQ either (R9
 *    parity).
 *  - image path + `third_party_ai_image_openai = false` → same refusal,
 *    `imageProcessor.processImage` MAY have already run (necessary for OCR
 *    guardrail — see CLAUDE.md "mutating middleware ordering" gotcha is
 *    inverted here: image processing is a pre-LLM purely-local transform,
 *    not an external dispatch) BUT no LLM/vision call escapes.
 *  - D3 anon (`currentUserId = undefined`) → fail-CLOSED, refusal returned.
 *  - both scopes granted → happy path preserved (`kind === 'ready'`).
 *
 * Mock surface:
 *  - `userConsentRepository` (in-memory via `tests/helpers/auth/userConsent-repo.mock`)
 *    — the gate calls `repo.isGranted(userId, scope)` through the
 *    `ThirdPartyAiConsentChecker` port; we inject the repo via the
 *    `buildThirdPartyAiConsentChecker(repoOverride)` factory.
 *  - `fetchEnrichmentData` / `resolveLocationForMessage` / `emitChatPhaseSpan`
 *    are mocked at module level to count invocations — the refusal MUST
 *    short-circuit BEFORE any enrichment work (PII isolation + perf).
 *  - `ChatRepository.persistMessage` is counted to assert the refusal happens
 *    BEFORE persisting the user message (so we do not stash a turn that the
 *    LLM never saw — mirrors the `kind: 'refused'` semantics in the existing
 *    guardrail-block path `prepare-message.pipeline.ts:246-253`).
 *
 * Lib-docs consulted:
 *  - `lib-docs/langchain/PATTERNS.md` — `BaseChatModel` invocation surface is
 *    behind `ChatOrchestrator.generate`; the gate sits BEFORE that surface,
 *    so we test at the pipeline boundary (not at the LangChain client).
 *  - `lib-docs/jest/PATTERNS.md` — `jest.mock()` factory hoists above
 *    imports; the mocked counters are read after `await pipeline.prepare()`.
 *  - `lib-docs/typeorm/LESSONS.md` — repo boundary respected; the test
 *    injects via the `repoOverride` factory arg, no direct ORM usage.
 *
 * Phase = red. These assertions fail today because the gate is absent.
 */

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
  // Preserve the real `LocationConsentChecker` type export shape: we ONLY
  // override the function helper, not the interface (TypeScript types are
  // erased at runtime so the mock factory does not need to re-emit them).
  return {
    resolveLocationForMessage: jest.fn(async () => {
      recordedEnrichmentCalls.resolveLocationForMessage += 1;
      return await Promise.resolve(undefined);
    }),
  };
});

jest.mock('@shared/observability/chat-phase-span', () => ({
  emitChatPhaseSpan: jest.fn(),
}));

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

/**
 * Minimal pipeline-deps factory — shared by all cases. Each test mints a fresh
 * in-memory consent repo and threads it through the
 * `ThirdPartyAiConsentChecker` factory. The new `thirdPartyAiConsentChecker`
 * dep DOES NOT YET EXIST on `PrepareMessagePipelineDeps` — green phase (T1.7
 * per tasks.md / design §2) will add it. Until then, the cast surfaces the
 * dep through structural-typing so the test compiles; the assertion is what
 * fails RED (the pipeline is unaware of the dep and proceeds without gating).
 */
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

  // Real GuardrailEvaluationService with no provider → always-allow, no
  // redaction (R3 redaction path is covered by a separate RED file).
  const guardrail = new GuardrailEvaluationService({ repository });
  // processImage is only called when input.image is set; we stub it
  // structurally and pin orchestratorImage to the input echo so the rest of
  // prepare() can proceed up to the new R3 gate.
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

  // Structural cast: green phase will widen `PrepareMessagePipelineDeps` to
  // declare `thirdPartyAiConsentChecker?: ThirdPartyAiConsentChecker` (per
  // design §3 R2/R3). Until then, we pass it via the deps bag — the runtime
  // pipeline ignores the unknown key, which is precisely the RED state.
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
  // Pin provider to openai so the resolver maps text → third_party_ai_text_openai
  // (provider-resolver.ts reads process.env.LLM_PROVIDER lazily). The R8
  // google-variant is intentionally NOT covered here — it is the subject of
  // `tests/unit/chat/provider-resolver.test.ts` (already in the frozen
  // manifest as a sibling RED file).
  process.env.LLM_PROVIDER = 'openai';
});

describe('PrepareMessagePipeline — third_party_ai_<text|image>_<provider> gate (B6 / R2, R3, R5, D3)', () => {
  it('R2 — refuses text dispatch when third_party_ai_text_openai is DENIED (no LLM invocation, no enrichment)', async () => {
    const repo = makeUserConsentRepo();
    // No grant for third_party_ai_text_openai → denial path.
    const { pipeline, persistMessage } = makePipeline({ consentRepo: repo });

    const prep = await pipeline.prepare(
      SESSION_UUID,
      { text: 'tell me about Monet' },
      'req-r2-deny',
      USER_ID,
      '127.0.0.1',
    );

    // PRIMARY ASSERTION — gate MUST short-circuit with refused.
    expect(prep.kind).toBe('refused');
    if (prep.kind !== 'refused') return;

    // R5 short-circuit — no enrichment fan-out, no LLM-bound work.
    expect(recordedEnrichmentCalls.fetchEnrichmentData).toBe(0);
    expect(recordedEnrichmentCalls.resolveLocationForMessage).toBe(0);

    // Refusal happens BEFORE persisting the user message — keeps the audit
    // trail truthful (we never claim "user said X then LLM refused" when the
    // LLM never saw X). Mirrors the guardrail-block branch
    // (`prepare-message.pipeline.ts:246-253`) which uses `persistBlockedExchange`.
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
    // Enrichment ran exactly once on the allow path.
    expect(recordedEnrichmentCalls.fetchEnrichmentData).toBe(1);
  });

  it('R3 — refuses image dispatch when third_party_ai_image_openai is DENIED (text granted, image denied)', async () => {
    const repo = makeUserConsentRepo();
    // Grant text but NOT image — exercises the per-channel scope split (R8).
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

    // R5 short-circuit — vision LLM dispatch never happens because the gate
    // returned refused; enrichment fan-out also skipped.
    expect(recordedEnrichmentCalls.fetchEnrichmentData).toBe(0);
    expect(persistMessage).not.toHaveBeenCalled();
  });

  it('R3 — refuses image dispatch when ONLY image scope denied (text path independence — Q2 AND-intersection)', async () => {
    // Mirrors design §9 Q2: when a single dispatch touches multiple providers
    // (or here, multiple channels), refuse if ANY required scope is denied.
    const repo = makeUserConsentRepo();
    // Grant text, deny image — message has BOTH text and image, so we must
    // refuse because the image channel scope is missing.
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
    // No enrichment, no persist — fail-CLOSED is total.
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
