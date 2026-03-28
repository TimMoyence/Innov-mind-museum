import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

import { logger } from '@shared/logger/logger';

const SYSTEM_PROMPT =
  'You are a binary classifier. Reply ONLY "yes" or "no". ' +
  'Is the following user message related to art, museums, architecture, ' +
  'sculpture, painting, cultural heritage, or any visual/performing art topic?';

/** Minimal LLM classifier that decides if a user message is art-related. */
export class ArtTopicClassifier {
  private readonly model: ChatOpenAI;

  constructor(openAiApiKey: string) {
    this.model = new ChatOpenAI({
      openAIApiKey: openAiApiKey,
      model: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 3,
      timeout: 3000,
    });
  }

  /**
   * Returns true if the message is art/museum/culture-related.
   * Fails-open (returns true) on any error — never blocks the user.
   */
  async isArtRelated(text: string): Promise<boolean> {
    try {
      const response = await this.model.invoke([
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(text),
      ]);

      const answer =
        typeof response.content === 'string' ? response.content.trim().toLowerCase() : '';

      return answer.startsWith('yes');
    } catch (error) {
      logger.warn('art_topic_classifier_fail_open', {
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }
}
