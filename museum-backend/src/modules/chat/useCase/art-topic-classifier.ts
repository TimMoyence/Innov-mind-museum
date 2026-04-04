import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

const SYSTEM_PROMPT =
  'You are a binary classifier. Reply ONLY "yes" or "no". ' +
  'Is the following user message related to art, museums, architecture, ' +
  'sculpture, painting, cultural heritage, or any visual/performing art topic?';

interface ClassifierModel {
  invoke(messages: unknown): Promise<{ content: unknown }>;
}

/** Builds the cheapest available model for binary classification. */
const buildClassifierModel = (): ClassifierModel | null => {
  if (env.llm.openAiApiKey) {
    return new ChatOpenAI({
      openAIApiKey: env.llm.openAiApiKey,
      model: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 3,
      timeout: 3000,
    });
  }
  if (env.llm.googleApiKey) {
    return new ChatGoogleGenerativeAI({
      apiKey: env.llm.googleApiKey,
      model: 'gemini-2.0-flash-lite',
      temperature: 0,
      maxOutputTokens: 3,
    });
  }
  if (env.llm.deepseekApiKey) {
    return new ChatOpenAI({
      configuration: { baseURL: 'https://api.deepseek.com/v1' },
      openAIApiKey: env.llm.deepseekApiKey,
      model: 'deepseek-chat',
      temperature: 0,
      maxTokens: 3,
      timeout: 3000,
    });
  }
  return null;
};

/** Minimal LLM classifier that decides if a user message is art-related. */
export class ArtTopicClassifier {
  private readonly model: ClassifierModel | null;

  constructor() {
    this.model = buildClassifierModel();
  }

  /**
   * Returns true if the message is art/museum/culture-related.
   * Fails-open (returns true) on any error — never blocks the user.
   */
  async isArtRelated(text: string): Promise<boolean> {
    if (!this.model) return true; // fail-open: no model configured
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
