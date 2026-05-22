/**
 * TD-20 [T2.1] RED — TTS Langfuse `generation()` instrumentation.
 *
 * Asserts `OpenAiTextToSpeechService.synthesize` emits ONE Langfuse `generation`
 * with `model === env.tts.model`, `usageDetails.input === text.length`,
 * `unit === 'CHARACTERS'` (A1/A2/R2/R10); error branch closes with an error
 * marker (A6/R8); `museumId`/`tier` present when supplied, ABSENT when omitted
 * (A7c/R5); fail-open (A5/R7); PII sentinel — raw text not in spy args.
 *
 * RED: the adapter does not yet emit any Langfuse generation → `clientTrace` /
 * `traceGeneration` are never called → these expectations fail.
 *
 * Mocking: `getLangfuse` mocked to the shared fake client (DRY helper). `env`
 * mocked inline (DTO-level, mirrors the existing `text-to-speech.test.ts`
 * file's env mock). `safeTrace` is NOT mocked — the real fail-open wrapper runs.
 */
jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@src/config/env', () => ({
  env: {
    llm: { openAiApiKey: 'test-api-key', timeoutMs: 10000 },
    tts: { model: 'gpt-4o-mini-tts', voice: 'alloy', speed: 1, maxTextLength: 4096 },
  },
}));

import { OpenAiTextToSpeechService } from '@modules/chat/adapters/secondary/audio/text-to-speech.openai';
import { AppError } from '@shared/errors/app.error';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { env } from '@src/config/env';

import { makeFakeLangfuseClient } from '../../helpers/observability/fakeLangfuse';

const getLangfuseMock = getLangfuse as jest.MockedFunction<typeof getLangfuse>;

/**
 * Forward-typed synthesize input — `museumId`/`tier` are added to the TTS port
 * input by GREEN [T1.1]. Referenced now so the RED scope assertions exist.
 * DTO-shape (not an entity cast) — port-input DTOs constructed inline per
 * tasks.md DRY note.
 */
interface ScopedTtsInput {
  text: string;
  voice?: string;
  requestId?: string;
  museumId?: number;
  tier?: 'anonymous' | 'free';
}

const callSynthesize = (
  service: OpenAiTextToSpeechService,
  input: ScopedTtsInput,
): Promise<unknown> =>
  service.synthesize(input as { text: string; voice?: string; requestId?: string });

const PII_TEXT = 'TOPSECRET_TTS_INPUT_TEXT_should_never_leak';

const okFetch = (): jest.Mock =>
  jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(new Uint8Array([0x49, 0x44, 0x33]).buffer),
  });

describe('TD-20 — TTS Langfuse generation', () => {
  const originalFetch = global.fetch;
  let service: OpenAiTextToSpeechService;

  beforeEach(() => {
    getLangfuseMock.mockReset();
    service = new OpenAiTextToSpeechService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('emits one generation with model, usageDetails.input=text.length, unit=CHARACTERS on success (A1/A2/R2/R10)', async () => {
    const { fakeClient, traceGeneration } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    global.fetch = okFetch();

    const text = 'Hello world';
    await service.synthesize({ text, requestId: 'req-tts-1' });

    // synthesize ALSO calls lf.trace() via ChatPhaseTimer.start + emitChatPhaseSpan,
    // so clientTrace fires >1× — count the ONE TD-20 generation on the generation spy.
    expect(traceGeneration).toHaveBeenCalledTimes(1);
    const genBody = traceGeneration.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(genBody).toMatchObject({
      model: env.tts.model,
      // v3.38.20: `unit` lives INSIDE `usage` (Usage.unit: ModelUsageUnit), NOT at
      // the CreateGenerationBody top level (which has no `unit`).
      usage: expect.objectContaining({ input: text.length, unit: 'CHARACTERS' }),
      usageDetails: expect.objectContaining({ input: text.length }),
    });
    expect(typeof genBody?.model).toBe('string');
    expect((genBody?.model as string).length).toBeGreaterThan(0);
  });

  it('closes the generation with an error marker on the AppError branch (A6/R8)', async () => {
    const { fakeClient, generationEnd } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve('upstream down'),
    });

    await expect(service.synthesize({ text: 'x', requestId: 'req-tts-err' })).rejects.toThrow(
      AppError,
    );

    expect(generationEnd).toHaveBeenCalled();
    const endBody = generationEnd.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
    expect(endBody?.level).toBe('ERROR');
  });

  it('carries museumId/tier on the body when supplied (A7a/R5)', async () => {
    const { fakeClient, traceGeneration } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    global.fetch = okFetch();

    await callSynthesize(service, {
      text: 'Hi',
      requestId: 'req-tts-2',
      museumId: 7,
      tier: 'free',
    });

    const genBody = traceGeneration.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const metadata = (genBody?.metadata ?? {}) as Record<string, unknown>;
    const merged = { ...genBody, ...metadata };
    expect(merged.museumId).toBe(7);
    expect(merged.tier).toBe('free');
  });

  it('OMITS museumId/tier keys (not null) on a contextless call (A7c/R5/UFR-013)', async () => {
    const { fakeClient, traceGeneration, clientTrace } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    global.fetch = okFetch();

    await service.synthesize({ text: 'Hi', requestId: 'req-tts-3' });

    const serialized = JSON.stringify([...clientTrace.mock.calls, ...traceGeneration.mock.calls]);
    // No fabricated null + no fabricated default museumId/tier when not supplied.
    expect(serialized).not.toContain('"museumId":null');
    expect(serialized).not.toContain('"tier":null');
    expect(serialized).not.toContain('"museumId"');
    expect(serialized).not.toContain('"tier"');
  });

  it('fail-open: result identical when getLangfuse() returns null (A5/R7)', async () => {
    getLangfuseMock.mockReturnValue(null);
    global.fetch = okFetch();

    const result = await service.synthesize({ text: 'Hello', requestId: 'req-tts-4' });

    expect(result.contentType).toBe('audio/ogg');
    expect(Buffer.isBuffer(result.audio)).toBe(true);
  });

  it('fail-open: a throwing Langfuse client never breaks synthesis (A5/R7)', async () => {
    const throwingClient = {
      trace: jest.fn(() => {
        throw new Error('langfuse boom');
      }),
    };
    getLangfuseMock.mockReturnValue(throwingClient as unknown as ReturnType<typeof getLangfuse>);
    global.fetch = okFetch();

    const result = await service.synthesize({ text: 'Hello', requestId: 'req-tts-5' });
    expect(result.contentType).toBe('audio/ogg');
  });

  it('PII discipline: raw TTS input text never appears in Langfuse spy args (NFR Privacy)', async () => {
    const { fakeClient, clientTrace, traceGeneration, generationEnd } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    global.fetch = okFetch();

    await service.synthesize({ text: PII_TEXT, requestId: 'req-tts-6' });

    const serialized = JSON.stringify([
      ...clientTrace.mock.calls,
      ...traceGeneration.mock.calls,
      ...generationEnd.mock.calls,
    ]);
    expect(serialized).not.toContain(PII_TEXT);
  });
});
