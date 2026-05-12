import { DescribeService } from '@modules/chat/useCase/describe.service';

import type {
  ChatOrchestrator,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { TextToSpeechService, TtsResult } from '@modules/chat/domain/ports/tts.port';

const FAKE_AI_OUTPUT: OrchestratorOutput = {
  text: 'A vivid description of the artwork.',
  metadata: {
    detectedArtwork: { title: 'Mona Lisa', artist: 'Leonardo da Vinci', confidence: 0.95 },
  },
};

const FAKE_TTS_RESULT: TtsResult = {
  audio: Buffer.from('fake-audio-data'),
  contentType: 'audio/mpeg',
};

class FakeOrchestrator implements ChatOrchestrator {
  lastInput: unknown;

  async generate(input: unknown): Promise<OrchestratorOutput> {
    this.lastInput = input;
    return FAKE_AI_OUTPUT;
  }

  async generateStream(
    _input: unknown,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    onChunk(FAKE_AI_OUTPUT.text);
    return FAKE_AI_OUTPUT;
  }
}

class FakeTts implements TextToSpeechService {
  async synthesize(): Promise<TtsResult> {
    return FAKE_TTS_RESULT;
  }
}

describe('DescribeService', () => {
  it('returns text description when format is "text"', async () => {
    const orchestrator = new FakeOrchestrator();
    const service = new DescribeService({ orchestrator });

    const result = await service.describe({
      text: 'Describe the Mona Lisa',
      locale: 'en',
      guideLevel: 'beginner',
      format: 'text',
    });

    expect(result.description).toBe(FAKE_AI_OUTPUT.text);
    expect(result.audio).toBeUndefined();
    expect(result.metadata).toBeDefined();
  });

  it('returns audio when format is "audio"', async () => {
    const orchestrator = new FakeOrchestrator();
    const tts = new FakeTts();
    const service = new DescribeService({ orchestrator, tts });

    const result = await service.describe({
      text: 'Describe this painting',
      locale: 'fr',
      guideLevel: 'expert',
      format: 'audio',
    });

    expect(result.description).toBe(FAKE_AI_OUTPUT.text);
    expect(result.audio).toEqual(FAKE_TTS_RESULT.audio);
    expect(result.contentType).toBe('audio/mpeg');
  });

  it('returns both text and audio when format is "both"', async () => {
    const orchestrator = new FakeOrchestrator();
    const tts = new FakeTts();
    const service = new DescribeService({ orchestrator, tts });

    const result = await service.describe({
      text: 'Describe this sculpture',
      locale: 'en',
      guideLevel: 'intermediate',
      format: 'both',
    });

    expect(result.description).toBe(FAKE_AI_OUTPUT.text);
    expect(result.audio).toEqual(FAKE_TTS_RESULT.audio);
    expect(result.contentType).toBe('audio/mpeg');
    expect(result.metadata).toBeDefined();
  });

  it('throws when format is "audio" but TTS is unavailable', async () => {
    const orchestrator = new FakeOrchestrator();
    const service = new DescribeService({ orchestrator });

    await expect(
      service.describe({
        text: 'Describe this',
        locale: 'en',
        guideLevel: 'beginner',
        format: 'audio',
      }),
    ).rejects.toThrow('TTS service is not available');
  });

  it('throws when neither text nor image is provided', async () => {
    const orchestrator = new FakeOrchestrator();
    const service = new DescribeService({ orchestrator });

    await expect(
      service.describe({
        locale: 'en',
        guideLevel: 'beginner',
        format: 'text',
      }),
    ).rejects.toThrow('Either text or image is required');
  });

  it('passes museumMode=true and audioDescriptionMode=true to orchestrator', async () => {
    const orchestrator = new FakeOrchestrator();
    const service = new DescribeService({ orchestrator });

    await service.describe({
      text: 'Describe the ceiling fresco',
      locale: 'it',
      guideLevel: 'expert',
      format: 'text',
    });

    const input = orchestrator.lastInput as Record<string, unknown>;
    expect(input.museumMode).toBe(true);
    expect(input.audioDescriptionMode).toBe(true);
    expect(input.history).toEqual([]);
  });

  it('passes image input to orchestrator', async () => {
    const orchestrator = new FakeOrchestrator();
    const service = new DescribeService({ orchestrator });

    await service.describe({
      image: { source: 'base64', value: 'abc123', mimeType: 'image/jpeg' },
      locale: 'en',
      guideLevel: 'beginner',
      format: 'text',
    });

    const input = orchestrator.lastInput as Record<string, unknown>;
    expect(input.image).toEqual({ source: 'base64', value: 'abc123', mimeType: 'image/jpeg' });
  });
});
