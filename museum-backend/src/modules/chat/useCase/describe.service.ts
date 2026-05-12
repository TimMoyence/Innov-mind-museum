import { badRequest } from '@shared/errors/app.error';

import type {
  ChatOrchestrator,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { TextToSpeechService, TtsResult } from '@modules/chat/domain/ports/tts.port';

/** Input for standalone artwork description. */
export interface DescribeInput {
  image?: { source: 'base64' | 'url'; value: string; mimeType?: string };
  text?: string;
  locale: string;
  guideLevel: 'beginner' | 'intermediate' | 'expert';
  format: 'text' | 'audio' | 'both';
}

/** Output of standalone artwork description. */
export interface DescribeOutput {
  description: string;
  audio?: Buffer;
  contentType?: string;
  metadata: Record<string, unknown>;
}

/** Dependencies for the describe service. */
interface DescribeServiceDeps {
  orchestrator: ChatOrchestrator;
  tts?: TextToSpeechService;
}

/**
 * Standalone description service: takes an image/text input and produces
 * an audio-description-optimised response, optionally with TTS audio.
 * Reuses the ChatOrchestrator with minimal input (no history, museum + audio mode).
 */
export class DescribeService {
  private readonly orchestrator: ChatOrchestrator;
  private readonly tts?: TextToSpeechService;

  /** Creates a new DescribeService wired to the given orchestrator and optional TTS. */
  constructor(deps: DescribeServiceDeps) {
    this.orchestrator = deps.orchestrator;
    this.tts = deps.tts;
  }

  /** Generates a standalone artwork description, optionally with TTS audio. */
  async describe(input: DescribeInput): Promise<DescribeOutput> {
    if (!input.text && !input.image) {
      throw badRequest('Either text or image is required');
    }

    const aiResult: OrchestratorOutput = await this.orchestrator.generate({
      history: [],
      text: input.text,
      image: input.image,
      locale: input.locale,
      museumMode: true,
      audioDescriptionMode: true,
      context: {
        guideLevel: input.guideLevel,
      },
    });

    const wantsAudio = input.format === 'audio' || input.format === 'both';
    let audio: TtsResult | undefined;

    if (wantsAudio && aiResult.text) {
      if (!this.tts) {
        throw badRequest('TTS service is not available');
      }
      audio = await this.tts.synthesize({ text: aiResult.text });
    }

    return {
      description: aiResult.text,
      audio: audio?.audio,
      contentType: audio?.contentType,
      metadata: aiResult.metadata as Record<string, unknown>,
    };
  }
}
