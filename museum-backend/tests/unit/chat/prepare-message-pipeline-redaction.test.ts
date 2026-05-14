/**
 * LLM02 (2026-05-14) — R3 pipeline propagation unit test.
 *
 * Asserts that `PrepareMessagePipeline.prepare()` surfaces `redactedText`
 * from the guardrail layer onto `PrepareReady` so the downstream call site
 * (ChatMessageService) can substitute it for the LLM payload.
 */
import { makeSession, makeSessionUser } from 'tests/helpers/chat/message.fixtures';
import { makeChatRepo } from 'tests/helpers/chat/repo.fixtures';

import { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import { ImageProcessingService } from '@modules/chat/useCase/image/image-processing.service';
import { PrepareMessagePipeline } from '@modules/chat/useCase/orchestration/prepare-message.pipeline';

import type { GuardrailProvider } from '@modules/chat/domain/ports/guardrail-provider.port';

const SESSION_UUID = '00000000-0000-4000-8000-000000000001';

function makeRedactingProvider(redactedText: string): GuardrailProvider {
  return {
    name: 'fake-llm-guard',
    version: 'fake-v1',
    async checkInput() {
      return Promise.resolve({ version: 'v1' as const, allow: true, redactedText });
    },
    async checkOutput() {
      return Promise.resolve({ version: 'v1' as const, allow: true });
    },
    async health() {
      return Promise.resolve({
        status: 'up' as const,
        latencyMs: 0,
        lastCheckedAt: new Date().toISOString(),
      });
    },
    metrics() {
      return { requests: 0, blocks: 0, errors: 0 };
    },
  };
}

describe('PrepareMessagePipeline — R3 redactedText propagation', () => {
  it('propagates guardrail.redactedText onto PrepareReady when provider scrubs PII', async () => {
    const session = makeSession({
      id: SESSION_UUID,
      user: makeSessionUser(1),
    });
    const repository = makeChatRepo({
      getSessionById: jest.fn().mockResolvedValue(session),
      persistMessage: jest.fn().mockResolvedValue(undefined),
      listSessionHistory: jest.fn().mockResolvedValue([]),
    });

    const guardrailProvider = makeRedactingProvider('email <EMAIL_ADDRESS_1>');
    const guardrail = new GuardrailEvaluationService({
      repository,
      guardrailProvider,
      guardrailProviderObserveOnly: false,
    });

    // `processImage` is only called when `input.image` is defined; this
    // test only exercises the text path so we just need a non-null stub.
    const imageProcessor = {} as unknown as ImageProcessingService;

    const pipeline = new PrepareMessagePipeline({
      repository,
      imageProcessor,
      guardrail,
    });

    const prep = await pipeline.prepare(
      SESSION_UUID,
      { text: 'email tim@example.com' },
      'req-r3',
      1,
      '127.0.0.1',
    );

    expect(prep.kind).toBe('ready');
    if (prep.kind !== 'ready') return;
    expect(prep.redactedText).toBe('email <EMAIL_ADDRESS_1>');
  });

  it('leaves redactedText undefined when the provider returns no sanitized variant', async () => {
    const session = makeSession({
      id: SESSION_UUID,
      user: makeSessionUser(1),
    });
    const repository = makeChatRepo({
      getSessionById: jest.fn().mockResolvedValue(session),
      persistMessage: jest.fn().mockResolvedValue(undefined),
      listSessionHistory: jest.fn().mockResolvedValue([]),
    });

    // No provider wired → `evaluateInput` cannot produce a redactedText.
    const guardrail = new GuardrailEvaluationService({ repository });
    const imageProcessor = {} as unknown as ImageProcessingService;

    const pipeline = new PrepareMessagePipeline({
      repository,
      imageProcessor,
      guardrail,
    });

    const prep = await pipeline.prepare(
      SESSION_UUID,
      { text: 'tell me about Monet' },
      'req-r3-b',
      1,
      '127.0.0.1',
    );

    expect(prep.kind).toBe('ready');
    if (prep.kind !== 'ready') return;
    expect(prep.redactedText).toBeUndefined();
  });
});
