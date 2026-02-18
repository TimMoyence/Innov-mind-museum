import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

import { env } from '@src/config/env';
import { logger } from '@shared/logger/logger';
import { parseAssistantResponse } from '../../application/assistant-response';
import { applyHistoryWindow } from '../../application/history-window';
import { Semaphore } from '../../application/semaphore';
import { ChatMessage } from '../../domain/chatMessage.entity';
import type { ChatAssistantMetadata } from '../../domain/chat.types';

interface OrchestratorInput {
  history: ChatMessage[];
  text?: string;
  image?: {
    source: 'base64' | 'url' | 'upload';
    value: string;
    mimeType?: string;
  };
  locale?: string;
  museumMode: boolean;
  context?: {
    location?: string;
    guideLevel?: 'beginner' | 'intermediate' | 'expert';
  };
  requestId?: string;
}

export interface OrchestratorOutput {
  text: string;
  metadata: ChatAssistantMetadata;
}

export interface ChatOrchestrator {
  generate(input: OrchestratorInput): Promise<OrchestratorOutput>;
}

const blockedTopics = ['bomb', 'terror', 'self-harm'];

const buildSystemPrompt = (
  locale: string | undefined,
  museumMode: boolean,
  guideLevel: 'beginner' | 'intermediate' | 'expert',
): string => {
  const language = locale && locale.toLowerCase().startsWith('fr') ? 'French' : 'English';
  const guidanceStyle =
    guideLevel === 'expert'
      ? 'Use advanced art-history vocabulary and deeper context.'
      : guideLevel === 'intermediate'
        ? 'Use balanced depth with short explanations of technical terms.'
        : 'Use beginner-friendly language and very clear short sentences.';

  return [
    'You are MuseumIA, a helpful museum companion.',
    `Respond in ${language}.`,
    guidanceStyle,
    museumMode
      ? 'Visitor is in guided museum mode: provide next steps and suggest follow-up questions.'
      : 'Visitor is in regular mode: answer clearly and concisely.',
    'Always return strict JSON with this shape:',
    '{"answer":"string","detectedArtwork":{"artworkId":"string?","title":"string?","artist":"string?","confidence":"number?","source":"string?"},"citations":["string"]}',
    'If unknown fields are unavailable, omit them. Keep answer under 180 words.',
  ].join(' ');
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`LLM timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => resolve(result))
      .catch((error) => reject(error))
      .finally(() => {
        if (timer) clearTimeout(timer);
      });
  });
};

type ChatModel = {
  invoke: (messages: unknown, options?: unknown) => Promise<{ content: unknown }>;
};

const toModel = (): ChatModel | null => {
  if (env.llm.provider === 'google' && env.llm.googleApiKey) {
    return new ChatGoogleGenerativeAI({
      apiKey: env.llm.googleApiKey,
      model: env.llm.model,
      maxOutputTokens: 800,
    }) as unknown as ChatModel;
  }

  if (env.llm.provider === 'deepseek' && env.llm.deepseekApiKey) {
    return new ChatOpenAI({
      configuration: {
        baseURL: 'https://api.deepseek.com/v1',
      },
      openAIApiKey: env.llm.deepseekApiKey,
      model: env.llm.model,
      temperature: env.llm.temperature,
    }) as unknown as ChatModel;
  }

  if (env.llm.openAiApiKey) {
    return new ChatOpenAI({
      openAIApiKey: env.llm.openAiApiKey,
      model: env.llm.model,
      temperature: env.llm.temperature,
    }) as unknown as ChatModel;
  }

  return null;
};

export class LangChainChatOrchestrator implements ChatOrchestrator {
  private readonly model = toModel();
  private readonly semaphore = new Semaphore(Math.max(1, env.llm.maxConcurrent));

  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const normalizedText = (input.text || '').trim();

    if (
      normalizedText &&
      blockedTopics.some((topic) => normalizedText.toLowerCase().includes(topic))
    ) {
      return {
        text: 'I cannot help with that topic. I can still help with art, museums, and cultural context.',
        metadata: {},
      };
    }

    const recentHistory = applyHistoryWindow(
      input.history,
      env.llm.maxHistoryMessages,
    );
    const guideLevel = input.context?.guideLevel ?? 'beginner';

    const messages: Array<HumanMessage | AIMessage | SystemMessage> = [
      new SystemMessage(buildSystemPrompt(input.locale, input.museumMode, guideLevel)),
      ...recentHistory.map((message) => {
        if (message.role === 'assistant') {
          return new AIMessage(message.text || '');
        }
        if (message.role === 'system') {
          return new SystemMessage(message.text || '');
        }
        return new HumanMessage(message.text || '');
      }),
    ];

    const contextLine = input.context?.location
      ? `Visitor location: ${input.context.location}.`
      : '';

    const finalText = [normalizedText || 'Please analyze the image.', contextLine]
      .filter(Boolean)
      .join(' ');

    if (input.image && ['openai', 'deepseek'].includes(env.llm.provider)) {
      const imageUrl =
        input.image.source === 'url'
          ? input.image.value
          : `data:${input.image.mimeType || 'image/jpeg'};base64,${input.image.value}`;

      messages.push(
        new HumanMessage({
          content: [
            { type: 'text', text: finalText },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
            },
          ],
        }),
      );
    } else {
      messages.push(new HumanMessage(finalText));
    }

    const model = this.model;

    if (!model) {
      return {
        text: 'MuseumIA is running without an LLM key. Configure provider keys to enable live AI responses.',
        metadata: {
          citations: ['system:missing-llm-api-key'],
        },
      };
    }

    const attempts = Math.max(0, env.llm.retries) + 1;

    const rawText = await this.semaphore.use(async () => {
      let lastError: unknown;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const result = await withTimeout(
            model.invoke(messages),
            env.llm.timeoutMs,
          );
          return String(result.content || '');
        } catch (error) {
          lastError = error;
          logger.warn('llm_attempt_failed', {
            requestId: input.requestId,
            attempt,
            attempts,
            provider: env.llm.provider,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      throw lastError instanceof Error ? lastError : new Error('LLM call failed');
    });

    const parsed = parseAssistantResponse(rawText);

    return {
      text: parsed.answer,
      metadata: parsed.metadata,
    };
  }
}
