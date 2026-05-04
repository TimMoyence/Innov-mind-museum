/**
 * OpenAiAudioTranscriber unit tests.
 * Mocks global fetch and env to test transcription, error, and timeout paths.
 */

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
      audioTranscriptionModel: 'whisper-1',
      timeoutMs: 15000,
    },
  },
}));

import { OpenAiAudioTranscriber } from '@modules/chat/adapters/secondary/audio/audio-transcriber.openai';
import { DisabledAudioTranscriber } from '@modules/chat/domain/ports/audio-transcriber.port';
import { AppError } from '@shared/errors/app.error';

const validInput = {
  base64: Buffer.from('fake-audio-data').toString('base64'),
  mimeType: 'audio/mpeg',
  locale: 'en',
};

describe('OpenAiAudioTranscriber', () => {
  const transcriber = new OpenAiAudioTranscriber();
  let fetchSpy: jest.SpiedFunction<typeof global.fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns transcribed text on successful API response', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ text: 'Hello world' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await transcriber.transcribe(validInput);

    expect(result.text).toBe('Hello world');
    expect(result.model).toBe('whisper-1');
    expect(result.provider).toBe('openai');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/transcriptions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws 400 when audio payload is empty', async () => {
    await expect(transcriber.transcribe({ base64: '', mimeType: 'audio/mpeg' })).rejects.toThrow(
      AppError,
    );

    await expect(
      transcriber.transcribe({ base64: '   ', mimeType: 'audio/mpeg' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 502 when OpenAI API returns an error', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Invalid file format' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(transcriber.transcribe(validInput)).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_AUDIO_TRANSCRIPTION_ERROR',
      message: 'Invalid file format',
    });
  });

  it('throws 504 on timeout', async () => {
    const timeoutError = new DOMException('The operation was aborted', 'TimeoutError');
    fetchSpy.mockRejectedValue(timeoutError);

    await expect(transcriber.transcribe(validInput)).rejects.toMatchObject({
      statusCode: 504,
      code: 'UPSTREAM_TIMEOUT',
    });
  });

  it('throws 502 when API returns empty transcription text', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ text: '   ' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(transcriber.transcribe(validInput)).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_AUDIO_TRANSCRIPTION_INVALID',
    });
  });

  it('throws 501 when provider is not openai', async () => {
    // Temporarily override env.llm.provider
    const envModule = require('@src/config/env');
    const originalProvider = envModule.env.llm.provider;
    envModule.env.llm.provider = 'deepseek';

    try {
      await expect(transcriber.transcribe(validInput)).rejects.toMatchObject({
        statusCode: 501,
        code: 'FEATURE_UNAVAILABLE',
      });
    } finally {
      envModule.env.llm.provider = originalProvider;
    }
  });

  it('passes locale as language hint in form data', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ text: 'Bonjour' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await transcriber.transcribe({
      ...validInput,
      locale: 'fr-FR',
    });

    expect(result.text).toBe('Bonjour');
    // Verify fetch was called (language hint is embedded in FormData body)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('DisabledAudioTranscriber', () => {
  it('throws 501 FEATURE_UNAVAILABLE', async () => {
    const disabled = new DisabledAudioTranscriber();

    await expect(disabled.transcribe()).rejects.toMatchObject({
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  });
});
