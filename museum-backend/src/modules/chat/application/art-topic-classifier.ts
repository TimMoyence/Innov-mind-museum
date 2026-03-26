import Anthropic from '@anthropic-ai/sdk';

import { logger } from '@shared/logger/logger';

/** Minimal LLM classifier that decides if a user message is art-related. */
export class ArtTopicClassifier {
  private readonly client: Anthropic;
  private readonly model = 'claude-haiku-4-5-20251001';
  private readonly timeoutMs = 3000;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, timeout: this.timeoutMs });
  }

  /**
   * Returns true if the message is art/museum/culture-related.
   * Fails-open (returns false) on any error — never blocks the user.
   */
  async isArtRelated(text: string): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 3,
        temperature: 0,
        system:
          'You are a binary classifier. Reply ONLY "yes" or "no". ' +
          'Is the following user message related to art, museums, architecture, ' +
          'sculpture, painting, cultural heritage, or any visual/performing art topic?',
        messages: [{ role: 'user', content: text }],
      });

      const answer =
        response.content[0]?.type === 'text'
          ? response.content[0].text.trim().toLowerCase()
          : '';

      return answer.startsWith('yes');
    } catch (error) {
      logger.warn('art_topic_classifier_fail_open', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
