jest.mock('@src/config/env', () => ({
  env: {
    llm: {
      openAiApiKey: 'test-api-key',
      timeoutMs: 10000,
    },
    tts: {
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      speed: 1,
      maxTextLength: 4096,
    },
  },
}));

import { AppError } from '@shared/errors/app.error';
import {
  OpenAiTextToSpeechService,
  DisabledTextToSpeechService,
} from '@modules/chat/adapters/secondary/audio/text-to-speech.openai';
import { env } from '@src/config/env';

describe('OpenAiTextToSpeechService', () => {
  const originalFetch = global.fetch;
  let service: OpenAiTextToSpeechService;

  beforeEach(() => {
    service = new OpenAiTextToSpeechService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns audio buffer on successful synthesis', async () => {
    const fakeAudio = new Uint8Array([0x49, 0x44, 0x33]).buffer;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeAudio),
    });

    const result = await service.synthesize({ text: 'Hello world' });

    expect(result.contentType).toBe('audio/mpeg');
    expect(Buffer.isBuffer(result.audio)).toBe(true);
    expect(result.audio.length).toBe(3);

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toBe('https://api.openai.com/v1/audio/speech');
    const body = JSON.parse(fetchCall[1].body as string);
    expect(body.input).toBe('Hello world');
    expect(body.model).toBe('gpt-4o-mini-tts');
    expect(body.voice).toBe('alloy');
    expect(body.response_format).toBe('mp3');
  });

  it('uses voice override when provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });

    await service.synthesize({ text: 'Test', voice: 'nova' });

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(body.voice).toBe('nova');
  });

  it('truncates text to maxTextLength', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });

    const longText = 'a'.repeat(5000);
    await service.synthesize({ text: longText });

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(body.input.length).toBe(4096);
  });

  it('throws 501 when API key is missing', async () => {
    const mutableEnv = env as { llm: { openAiApiKey?: string } };
    const savedKey = mutableEnv.llm.openAiApiKey;
    mutableEnv.llm.openAiApiKey = undefined;

    try {
      await expect(service.synthesize({ text: 'test' })).rejects.toThrow(AppError);
      await expect(service.synthesize({ text: 'test' })).rejects.toMatchObject({
        statusCode: 501,
        code: 'FEATURE_UNAVAILABLE',
      });
    } finally {
      mutableEnv.llm.openAiApiKey = savedKey;
    }
  });

  it('throws 502 on API error response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad request body'),
    });

    await expect(service.synthesize({ text: 'test' })).rejects.toThrow(AppError);
    await expect(service.synthesize({ text: 'test' })).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_TTS_ERROR',
    });
  });

  it('throws 504 on timeout (DOMException)', async () => {
    const timeoutError = new DOMException('The operation was aborted', 'TimeoutError');
    global.fetch = jest.fn().mockRejectedValue(timeoutError);

    await expect(service.synthesize({ text: 'test' })).rejects.toThrow(AppError);
    await expect(service.synthesize({ text: 'test' })).rejects.toMatchObject({
      statusCode: 504,
      code: 'UPSTREAM_TIMEOUT',
    });
  });

  it('throws 504 on abort (DOMException)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    global.fetch = jest.fn().mockRejectedValue(abortError);

    await expect(service.synthesize({ text: 'test' })).rejects.toThrow(AppError);
    await expect(service.synthesize({ text: 'test' })).rejects.toMatchObject({
      statusCode: 504,
      code: 'UPSTREAM_TIMEOUT',
    });
  });

  it('rethrows non-timeout fetch errors as-is', async () => {
    const networkError = new Error('Network failure');
    global.fetch = jest.fn().mockRejectedValue(networkError);

    await expect(service.synthesize({ text: 'test' })).rejects.toThrow('Network failure');
  });
});

describe('DisabledTextToSpeechService', () => {
  it('throws 501 FEATURE_UNAVAILABLE', async () => {
    const disabled = new DisabledTextToSpeechService();

    await expect(disabled.synthesize()).rejects.toThrow(AppError);
    await expect(disabled.synthesize()).rejects.toMatchObject({
      statusCode: 501,
      code: 'FEATURE_UNAVAILABLE',
    });
  });
});
