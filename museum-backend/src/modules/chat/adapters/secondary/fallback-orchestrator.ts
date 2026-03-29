import { logger } from '@shared/logger/logger';

import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '../../domain/ports/chat-orchestrator.port';

/**
 * Wraps a primary ChatOrchestrator with an optional fallback.
 * On primary failure, retries with the fallback orchestrator.
 */
export class FallbackChatOrchestrator implements ChatOrchestrator {
  constructor(
    private readonly primary: ChatOrchestrator,
    private readonly fallback: ChatOrchestrator | null,
  ) {}

  /** Generates a response, falling back to secondary provider on failure. */
  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    try {
      return await this.primary.generate(input);
    } catch (error) {
      if (!this.fallback) throw error;
      logger.warn('llm_primary_failed_fallback', {
        error: (error as Error).message,
        requestId: input.requestId,
      });
      return await this.fallback.generate(input);
    }
  }

  /** Streams a response, falling back to secondary provider on failure. */
  async generateStream(
    input: OrchestratorInput,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    try {
      return await this.primary.generateStream(input, onChunk);
    } catch (error) {
      if (!this.fallback) throw error;
      logger.warn('llm_primary_stream_failed_fallback', {
        error: (error as Error).message,
        requestId: input.requestId,
      });
      return await this.fallback.generateStream(input, onChunk);
    }
  }
}
