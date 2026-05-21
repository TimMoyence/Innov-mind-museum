/**
 * TD-20 [T3.1] RED — STT Langfuse `generation()` instrumentation.
 *
 * Asserts `OpenAiAudioTranscriber.transcribe` emits ONE Langfuse `generation`
 * with `model === env.llm.audioTranscriptionModel`, `usageDetails.input ===
 * decoded byteLength`, `unit === 'BYTES'`, `metadata.durationKnown === false`
 * (A1/A3/R3/R6/R10, design D-Q1); error branch closes with an error marker
 * (A6/R8); `museumId`/`tier` present/absent (A7/R5); fail-open (A5/R7); PII
 * sentinel — raw base64/transcript not in spy args.
 *
 * RED: the adapter does not yet emit any Langfuse generation → spies never
 * called → these expectations fail.
 */
jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/sentry', () => ({
  startSpan: (_ctx: unknown, cb: () => unknown) => cb(),
}));

jest.mock('@src/config/env', () => ({
  env: {
    llm: {
      provider: 'openai',
      openAiApiKey: 'test-key',
      audioTranscriptionModel: 'gpt-4o-mini-transcribe',
      timeoutMs: 15000,
    },
  },
}));

import { OpenAiAudioTranscriber } from '@modules/chat/adapters/secondary/audio/audio-transcriber.openai';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { env } from '@src/config/env';

import { makeFakeLangfuseClient } from '../../helpers/observability/fakeLangfuse';

import type { AudioTranscriberInput } from '@modules/chat/domain/ports/audio-transcriber.port';

const getLangfuseMock = getLangfuse as jest.MockedFunction<typeof getLangfuse>;

/**
 * Forward-typed transcribe input — `museumId`/`tier` are added to
 * `AudioTranscriberInput` by GREEN [T1.1]. Referenced now so the RED scope
 * assertions exist. DTO-shape, not an entity cast.
 */
type ScopedSttInput = AudioTranscriberInput & {
  museumId?: number;
  tier?: 'anonymous' | 'free';
};

const callTranscribe = (
  transcriber: OpenAiAudioTranscriber,
  input: ScopedSttInput,
): Promise<unknown> => transcriber.transcribe(input as AudioTranscriberInput);

const RAW_AUDIO = 'TOPSECRET_AUDIO_PAYLOAD_should_never_leak';
const PII_BASE64 = Buffer.from(RAW_AUDIO).toString('base64');
const EXPECTED_BYTE_LENGTH = Buffer.from(PII_BASE64, 'base64').byteLength;
const RAW_TRANSCRIPT = 'TOPSECRET_TRANSCRIPT_TEXT_should_never_leak';

const validInput = { base64: PII_BASE64, mimeType: 'audio/mpeg', locale: 'en' };

const okFetch = (): jest.SpiedFunction<typeof global.fetch> =>
  jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ text: RAW_TRANSCRIPT }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

describe('TD-20 — STT Langfuse generation', () => {
  const transcriber = new OpenAiAudioTranscriber();

  beforeEach(() => {
    getLangfuseMock.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits one generation with model, usageDetails.input=byteLength, unit=BYTES, durationKnown=false on success (A1/A3/R3/R6/R10)', async () => {
    const { fakeClient, traceGeneration } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    okFetch();

    await transcriber.transcribe({ ...validInput, requestId: 'req-stt-1' });

    // transcribe ALSO calls lf.trace() via ChatPhaseTimer.start + emitChatPhaseSpan,
    // so clientTrace fires >1× — count the ONE TD-20 generation on the generation spy.
    expect(traceGeneration).toHaveBeenCalledTimes(1);
    const genBody = traceGeneration.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(genBody).toMatchObject({
      model: env.llm.audioTranscriptionModel,
      // 'BYTES' is NOT a ModelUsageUnit (CHARACTERS|TOKENS|MILLISECONDS|SECONDS|
      // IMAGES|REQUESTS), so per D-Q1 the byte count rides in usage/usageDetails
      // and the BYTES marker + durationKnown:false ride in metadata — never usage.unit.
      usage: expect.objectContaining({ input: EXPECTED_BYTE_LENGTH }),
      usageDetails: expect.objectContaining({ input: EXPECTED_BYTE_LENGTH }),
      metadata: expect.objectContaining({ durationKnown: false, unit: 'BYTES' }),
    });
    expect((genBody?.model as string)?.length).toBeGreaterThan(0);
  });

  it('closes the generation with an error marker when the API returns a 502 (A6/R8)', async () => {
    const { fakeClient, generationEnd } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'bad audio' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      transcriber.transcribe({ ...validInput, requestId: 'req-stt-err' }),
    ).rejects.toMatchObject({ statusCode: 502 });

    expect(generationEnd).toHaveBeenCalled();
    const endBody = generationEnd.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
    expect(endBody?.level).toBe('ERROR');
  });

  it('carries museumId/tier when supplied (A7a/R5)', async () => {
    const { fakeClient, traceGeneration } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    okFetch();

    await callTranscribe(transcriber, {
      ...validInput,
      requestId: 'req-stt-2',
      museumId: 7,
      tier: 'free',
    });

    const genBody = traceGeneration.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const metadata = (genBody?.metadata ?? {}) as Record<string, unknown>;
    const merged = { ...genBody, ...metadata };
    expect(merged.museumId).toBe(7);
    expect(merged.tier).toBe('free');
  });

  it('OMITS museumId/tier keys (not null) when omitted (A7/R5/UFR-013)', async () => {
    const { fakeClient, clientTrace, traceGeneration } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    okFetch();

    await transcriber.transcribe({ ...validInput, requestId: 'req-stt-3' });

    const serialized = JSON.stringify([...clientTrace.mock.calls, ...traceGeneration.mock.calls]);
    expect(serialized).not.toContain('"museumId":null');
    expect(serialized).not.toContain('"tier":null');
    expect(serialized).not.toContain('"museumId"');
    expect(serialized).not.toContain('"tier"');
  });

  it('fail-open: result identical when getLangfuse() returns null (A5/R7)', async () => {
    getLangfuseMock.mockReturnValue(null);
    okFetch();

    const result = await transcriber.transcribe({ ...validInput, requestId: 'req-stt-4' });
    expect(result.text).toBe(RAW_TRANSCRIPT);
    expect(result.model).toBe(env.llm.audioTranscriptionModel);
  });

  it('fail-open: a throwing Langfuse client never breaks transcription (A5/R7)', async () => {
    const throwingClient = {
      trace: jest.fn(() => {
        throw new Error('langfuse boom');
      }),
    };
    getLangfuseMock.mockReturnValue(throwingClient as unknown as ReturnType<typeof getLangfuse>);
    okFetch();

    const result = await transcriber.transcribe({ ...validInput, requestId: 'req-stt-5' });
    expect(result.text).toBe(RAW_TRANSCRIPT);
  });

  it('PII discipline: raw base64 audio + transcript never appear in Langfuse spy args (NFR Privacy)', async () => {
    const { fakeClient, clientTrace, traceGeneration, generationEnd } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    okFetch();

    await transcriber.transcribe({ ...validInput, requestId: 'req-stt-6' });

    const serialized = JSON.stringify([
      ...clientTrace.mock.calls,
      ...traceGeneration.mock.calls,
      ...generationEnd.mock.calls,
    ]);
    expect(serialized).not.toContain(PII_BASE64);
    expect(serialized).not.toContain(RAW_TRANSCRIPT);
  });
});
