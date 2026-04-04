import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';
import type {
  AudioTranscriber,
  AudioTranscriptionResult,
} from '@modules/chat/domain/ports/audio-transcriber.port';
import { DisabledAudioTranscriber } from '@modules/chat/domain/ports/audio-transcriber.port';

class MockAudioTranscriber implements AudioTranscriber {
  constructor(
    private readonly response: AudioTranscriptionResult = {
      text: 'Tell me about this beautiful painting',
      model: 'whisper-1',
      provider: 'openai',
    },
  ) {}

  async transcribe(): Promise<AudioTranscriptionResult> {
    return this.response;
  }
}

describe('chat service audio', () => {
  it('DisabledAudioTranscriber throws 501', async () => {
    const service = buildChatTestService(undefined, new DisabledAudioTranscriber());
    const session = await service.createSession({});

    await expect(
      service.postAudioMessage(session.id, {
        audio: { base64: 'dGVzdA==', mimeType: 'audio/mp3', sizeBytes: 100 },
      }),
    ).rejects.toThrow(expect.objectContaining({ statusCode: 501 }));
  });

  it('successful transcription chains to postMessage and returns transcription', async () => {
    const transcriber = new MockAudioTranscriber();
    const service = buildChatTestService(undefined, transcriber);
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postAudioMessage(session.id, {
      audio: { base64: 'dGVzdA==', mimeType: 'audio/mp3', sizeBytes: 100 },
    });

    expect(result.transcription.text).toBe('Tell me about this beautiful painting');
    expect(result.transcription.model).toBe('whisper-1');
    expect(result.transcription.provider).toBe('openai');
    expect(result.message.role).toBe('assistant');
    expect(result.message.text.length).toBeGreaterThan(0);
  });

  it('transcribed insult text goes through input guardrail', async () => {
    const transcriber = new MockAudioTranscriber({
      text: 'You are an idiot',
      model: 'whisper-1',
      provider: 'openai',
    });
    const service = buildChatTestService(undefined, transcriber);
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postAudioMessage(session.id, {
      audio: { base64: 'dGVzdA==', mimeType: 'audio/mp3', sizeBytes: 100 },
    });

    expect(result.metadata.citations).toContain('policy:insult');
  });

  it('session messages reflect transcribed text after audio message', async () => {
    const transcriber = new MockAudioTranscriber();
    const service = buildChatTestService(undefined, transcriber);
    const session = await service.createSession({ userId: 77 });

    await service.postAudioMessage(
      session.id,
      { audio: { base64: 'dGVzdA==', mimeType: 'audio/mp3', sizeBytes: 100 } },
      undefined,
      77,
    );

    const fetched = await service.getSession(session.id, { limit: 20 }, 77);
    expect(fetched.messages.length).toBeGreaterThanOrEqual(2);
    expect(fetched.messages[0].role).toBe('user');
    expect(fetched.messages[0].text).toBe('Tell me about this beautiful painting');
  });

  it('audio ownership check rejects different user', async () => {
    const transcriber = new MockAudioTranscriber();
    const service = buildChatTestService(undefined, transcriber);
    const session = await service.createSession({ userId: 101 });

    await expect(
      service.postAudioMessage(
        session.id,
        { audio: { base64: 'dGVzdA==', mimeType: 'audio/mp3', sizeBytes: 100 } },
        undefined,
        999,
      ),
    ).rejects.toThrow(expect.objectContaining({ statusCode: 404 }));
  });
});
