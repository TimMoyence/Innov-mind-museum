import type {
  TextToSpeechService,
  TtsResult,
} from '@modules/chat/adapters/secondary/audio/text-to-speech.openai';

/** Fake TTS service for tests. Tracks call count and returns deterministic audio. */
export class FakeTextToSpeechService implements TextToSpeechService {
  callCount = 0;
  lastInput?: { text: string; voice?: string };

  async synthesize(input: { text: string; voice?: string }): Promise<TtsResult> {
    this.callCount++;
    this.lastInput = input;
    return { audio: Buffer.from('fake-audio'), contentType: 'audio/mpeg' };
  }
}
