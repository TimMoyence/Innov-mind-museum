/**
 * P4 — Voice V1 end-to-end pipeline (STT → LLM → TTS).
 *
 * Existing tests cover each leg of the pipeline in isolation
 * (`chat-service-audio.test.ts`, `chat-service-tts.test.ts`). This suite
 * exercises them as one continuous user flow, so we catch regressions
 * where, e.g., the assistant message produced by postAudioMessage isn't
 * eligible for synthesizeSpeech.
 *
 * Uses `buildChatTestService` factory + `FakeTextToSpeechService` (UFR-002,
 * no inline mock services). Mocks only the external boundaries
 * (OpenAI STT/TTS HTTP calls) — orchestration, persistence, and guardrails
 * are exercised for real.
 */

import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';
import { FakeTextToSpeechService } from 'tests/helpers/chat/fakeTextToSpeechService';
import type {
  AudioTranscriber,
  AudioTranscriberInput,
  AudioTranscriptionResult,
} from '@modules/chat/domain/ports/audio-transcriber.port';

class StubTranscriber implements AudioTranscriber {
  public lastInput: { mimeType: string; base64: string } | null = null;

  constructor(private readonly text: string) {}

  async transcribe(input: AudioTranscriberInput): Promise<AudioTranscriptionResult> {
    this.lastInput = { mimeType: input.mimeType, base64: input.base64 };
    return {
      text: this.text,
      model: 'gpt-4o-mini-transcribe',
      provider: 'openai',
    };
  }
}

const USER_ID = 7;
const SAMPLE_AUDIO = {
  base64: Buffer.from('fake-audio-bytes').toString('base64'),
  mimeType: 'audio/mp4',
  sizeBytes: 16,
};

interface VoicePipelineRig {
  service: ReturnType<typeof buildChatTestService>;
  transcriber: StubTranscriber;
  tts: FakeTextToSpeechService;
}

const setupVoicePipeline = (transcribedText: string): VoicePipelineRig => {
  const transcriber = new StubTranscriber(transcribedText);
  const tts = new FakeTextToSpeechService();
  const service = buildChatTestService({ tts, audioTranscriber: transcriber });
  return { service, transcriber, tts };
};

describe('voice V1 pipeline — STT → LLM → TTS (P4)', () => {
  it('chains transcription → assistant reply → speech synthesis on a single visitor turn', async () => {
    const { service, transcriber, tts } = setupVoicePipeline(
      'Tell me about this Mona Lisa replica',
    );
    const session = await service.createSession({ userId: USER_ID, locale: 'en-US' });

    // Leg 1+2 — STT then LLM reply.
    const audioResult = await service.postAudioMessage(
      session.id,
      { audio: SAMPLE_AUDIO },
      undefined,
      USER_ID,
    );

    expect(audioResult.transcription.text).toBe('Tell me about this Mona Lisa replica');
    expect(audioResult.transcription.model).toBe('gpt-4o-mini-transcribe');
    expect(audioResult.message.role).toBe('assistant');
    expect(audioResult.message.text.length).toBeGreaterThan(0);
    expect(transcriber.lastInput).toEqual({
      mimeType: 'audio/mp4',
      base64: SAMPLE_AUDIO.base64,
    });

    // Leg 3 — TTS over the same assistant message.
    const speech = await service.synthesizeSpeech(audioResult.message.id, USER_ID);
    expect(speech).not.toBeNull();
    expect(speech!.audio).toBeInstanceOf(Buffer);
    expect(speech!.audio.length).toBeGreaterThan(0);
    expect(speech!.contentType).toMatch(/^audio\//);
    // The assistant text fed to TTS must be the one stored in the chat session,
    // not a stale copy.
    expect(tts.lastInput?.text).toBe(audioResult.message.text);
  });

  it('persists the transcribed user turn and the synthesized assistant turn in the session history', async () => {
    const { service } = setupVoicePipeline('What artist painted this?');
    const session = await service.createSession({ userId: USER_ID });

    const audioResult = await service.postAudioMessage(
      session.id,
      { audio: SAMPLE_AUDIO },
      undefined,
      USER_ID,
    );
    await service.synthesizeSpeech(audioResult.message.id, USER_ID);

    const sessionResult = await service.getSession(session.id, { limit: 50 }, USER_ID);
    const history = sessionResult.messages;

    // Visitor turn = transcribed text, role=user.
    const userTurn = history.find((m) => m.role === 'user');
    expect(userTurn).toBeDefined();
    expect(userTurn?.text).toBe('What artist painted this?');

    // Assistant turn = the LLM response that was passed to TTS.
    const assistantTurn = history.find((m) => m.id === audioResult.message.id);
    expect(assistantTurn?.text).toBe(audioResult.message.text);
  });

  it('refuses to synthesize speech for the visitor turn — only assistant text is voiced', async () => {
    const { service } = setupVoicePipeline('Hi there');
    const session = await service.createSession({ userId: USER_ID });

    await service.postAudioMessage(session.id, { audio: SAMPLE_AUDIO }, undefined, USER_ID);

    const sessionResult = await service.getSession(session.id, { limit: 50 }, USER_ID);
    const userTurn = sessionResult.messages.find((m) => m.role === 'user');
    expect(userTurn).toBeDefined();

    await expect(service.synthesizeSpeech(userTurn!.id, USER_ID)).rejects.toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('rejects speech synthesis when requested by a different user (ownership boundary)', async () => {
    const { service } = setupVoicePipeline('Hello');
    const session = await service.createSession({ userId: USER_ID });

    const audioResult = await service.postAudioMessage(
      session.id,
      { audio: SAMPLE_AUDIO },
      undefined,
      USER_ID,
    );

    const otherUserId = USER_ID + 1;
    await expect(service.synthesizeSpeech(audioResult.message.id, otherUserId)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });
});
