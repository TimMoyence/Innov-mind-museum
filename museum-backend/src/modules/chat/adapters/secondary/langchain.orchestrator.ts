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
import {
  runSectionTasks,
  SectionRunResult,
  SectionTask,
} from '../../application/llm-section-runner';
import {
  createExpertCompactFallback,
  createLlmSectionPlan,
  createSummaryFallback,
  LlmSectionName,
  mergeSectionTexts,
} from '../../application/llm-sections';
import { applyHistoryWindow } from '../../application/history-window';
import { Semaphore } from '../../application/semaphore';
import { ChatMessage } from '../../domain/chatMessage.entity';
import {
  ChatAssistantDiagnostics,
  ChatAssistantMetadata,
} from '../../domain/chat.types';

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
  const language =
    locale && locale.toLowerCase().startsWith('fr') ? 'French' : 'English';
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
      ? 'Visitor is in guided museum mode: provide practical next steps.'
      : 'Visitor is in regular mode: answer clearly and concisely.',
    'Stay focused on art, museum context, and cultural interpretation.',
  ].join(' ');
};

interface ChatModelInvokeOptions {
  signal?: AbortSignal;
}

type ChatModel = {
  invoke: (
    messages: unknown,
    options?: ChatModelInvokeOptions,
  ) => Promise<{ content: unknown }>;
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

const toContentString = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null && 'text' in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .join('\n')
      .trim();
  }

  if (content && typeof content === 'object') {
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }

  return content === undefined || content === null ? '' : String(content);
};

const estimatePayloadBytes = (
  messages: Array<HumanMessage | AIMessage | SystemMessage>,
): number => {
  const serialized = messages
    .map((message) => {
      const content = (message as { content?: unknown }).content;
      return toContentString(content);
    })
    .join('\n');

  return Buffer.byteLength(serialized, 'utf8');
};

const isRetryableError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const text = `${error.name} ${error.message}`.toLowerCase();
  return (
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('rate limit') ||
    text.includes('429') ||
    text.includes('503') ||
    text.includes('502') ||
    text.includes('504') ||
    text.includes('temporar') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('abort')
  );
};

interface LangChainChatOrchestratorDeps {
  model?: ChatModel | null;
  semaphore?: Semaphore;
}

export class LangChainChatOrchestrator implements ChatOrchestrator {
  private readonly model: ChatModel | null;
  private readonly semaphore: Semaphore;

  constructor(deps: LangChainChatOrchestratorDeps = {}) {
    this.model = deps.model === undefined ? toModel() : deps.model;
    this.semaphore =
      deps.semaphore || new Semaphore(Math.max(1, env.llm.maxConcurrent));
  }

  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const startedAt = Date.now();
    const normalizedText = (input.text || '').trim();

    if (
      normalizedText &&
      blockedTopics.some((topic) =>
        normalizedText.toLowerCase().includes(topic),
      )
    ) {
      return {
        text: 'I cannot help with that topic. I can still help with art, museums, and cultural context.',
        metadata: {},
      };
    }

    const recentHistory = applyHistoryWindow(input.history, env.llm.maxHistoryMessages);
    const guideLevel = input.context?.guideLevel ?? 'beginner';

    const baseMessages: Array<HumanMessage | AIMessage | SystemMessage> = [
      new SystemMessage(
        buildSystemPrompt(input.locale, input.museumMode, guideLevel),
      ),
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

      baseMessages.push(
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
      baseMessages.push(new HumanMessage(finalText));
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

    const sectionPlan = createLlmSectionPlan({
      locale: input.locale,
      museumMode: input.museumMode,
      guideLevel,
      parallelEnabled: env.llm.parallelEnabled,
      timeoutSummaryMs: env.llm.timeoutSummaryMs,
      timeoutExpertCompactMs: env.llm.timeoutExpertCompactMs,
    });

    const tasks: SectionTask<string>[] = sectionPlan.map((section) => {
      const sectionMessages: Array<HumanMessage | AIMessage | SystemMessage> = [
        ...baseMessages,
        new SystemMessage(section.prompt),
      ];
      const payloadBytes = estimatePayloadBytes(sectionMessages);

      return {
        name: section.name,
        timeoutMs: section.timeoutMs,
        payloadBytes,
        run: async (signal: AbortSignal) => {
          const result = await this.semaphore.use(async () =>
            model.invoke(sectionMessages, { signal }),
          );

          return toContentString(result.content);
        },
      };
    });

    const sectionResults = await runSectionTasks(tasks, {
      maxConcurrent: env.llm.parallelEnabled
        ? env.llm.sectionsMaxConcurrent
        : 1,
      retries: env.llm.retries,
      retryBaseDelayMs: env.llm.retryBaseDelayMs,
      totalBudgetMs: env.llm.totalBudgetMs,
      requestId: input.requestId,
      shouldRetry: (error, status) => {
        if (status === 'timeout') return true;
        return isRetryableError(error);
      },
      hooks: {
        onStart: (event) => {
          logger.info('llm_section_start', {
            requestId: event.requestId,
            section: event.name,
            attempt: event.attempt,
            timeoutMs: event.timeoutMs,
            payloadBytes: event.payloadBytes,
            provider: env.llm.provider,
            model: env.llm.model,
          });
        },
        onSuccess: (event) => {
          logger.info('llm_section_success', {
            requestId: event.requestId,
            section: event.name,
            attempt: event.attempt,
            latencyMs: event.latencyMs,
            timeoutMs: event.timeoutMs,
            payloadBytes: event.payloadBytes,
            provider: env.llm.provider,
            model: env.llm.model,
          });
        },
        onRetry: (event) => {
          logger.warn('llm_section_retry', {
            requestId: event.requestId,
            section: event.name,
            attempt: event.attempt,
            latencyMs: event.latencyMs,
            timeoutMs: event.timeoutMs,
            payloadBytes: event.payloadBytes,
            error: event.error,
            provider: env.llm.provider,
            model: env.llm.model,
          });
        },
        onTimeout: (event) => {
          logger.warn('llm_section_timeout', {
            requestId: event.requestId,
            section: event.name,
            attempt: event.attempt,
            latencyMs: event.latencyMs,
            timeoutMs: event.timeoutMs,
            payloadBytes: event.payloadBytes,
            error: event.error,
            provider: env.llm.provider,
            model: env.llm.model,
          });
        },
        onError: (event) => {
          logger.warn('llm_section_error', {
            requestId: event.requestId,
            section: event.name,
            attempt: event.attempt,
            latencyMs: event.latencyMs,
            timeoutMs: event.timeoutMs,
            payloadBytes: event.payloadBytes,
            error: event.error,
            provider: env.llm.provider,
            model: env.llm.model,
          });
        },
      },
    });

    const bySection = new Map<LlmSectionName, SectionRunResult<string>>();
    sectionResults.forEach((result) => {
      bySection.set(result.name as LlmSectionName, result);
    });

    const summaryResult = bySection.get('summary');
    let summaryText = '';
    let metadata: ChatAssistantMetadata = {};
    let degraded = false;
    let summaryFallbackApplied = false;

    if (summaryResult && summaryResult.status === 'success') {
      const parsed = parseAssistantResponse(summaryResult.value);
      summaryText = parsed.answer;
      metadata = parsed.metadata;
    } else {
      summaryFallbackApplied = true;
      degraded = true;
      summaryText = createSummaryFallback({
        history: recentHistory,
        question: normalizedText,
        location: input.context?.location,
        locale: input.locale,
        museumMode: input.museumMode,
      });

      logger.warn('llm_section_fallback', {
        requestId: input.requestId,
        section: 'summary',
        reason:
          summaryResult?.status === 'timeout'
            ? 'timeout'
            : summaryResult?.status || 'missing-result',
      });
    }

    let expertCompactText: string | undefined;
    let expertFallbackApplied = false;
    const expertResult = bySection.get('expertCompact');

    if (expertResult && expertResult.status === 'success') {
      expertCompactText = expertResult.value.trim();
    } else if (sectionPlan.some((section) => section.name === 'expertCompact')) {
      degraded = true;
      expertFallbackApplied = true;
      expertCompactText = createExpertCompactFallback({
        summaryText,
        locale: input.locale,
        location: input.context?.location,
      });

      logger.warn('llm_section_fallback', {
        requestId: input.requestId,
        section: 'expertCompact',
        reason:
          expertResult?.status === 'timeout'
            ? 'timeout'
            : expertResult?.status || 'missing-result',
      });
    }

    const text = mergeSectionTexts(summaryText, expertCompactText);
    const totalLatencyMs = Date.now() - startedAt;
    const profile: ChatAssistantDiagnostics['profile'] = env.llm.parallelEnabled
      ? 'parallel_sections'
      : 'single_section';

    const diagnosticsSections: ChatAssistantDiagnostics['sections'] = sectionPlan.map(
      (section) => {
      const result = bySection.get(section.name);
      const fallbackApplied =
        (section.name === 'summary' && summaryFallbackApplied) ||
        (section.name === 'expertCompact' && expertFallbackApplied);

      if (!result) {
        return {
          name: section.name,
          status: fallbackApplied ? 'fallback' : 'error',
          attempts: 0,
          latencyMs: 0,
          timeoutMs: section.timeoutMs,
          payloadBytes: 0,
          error: 'No section result',
        };
      }

      return {
        name: section.name,
        status: fallbackApplied
          ? 'fallback'
          : result.status,
        attempts: result.attempts,
        latencyMs: result.latencyMs,
        timeoutMs: result.timeoutMs,
        payloadBytes: result.payloadBytes,
        ...(result.status !== 'success' ? { error: result.error } : {}),
      };
    });

    logger.info('llm_orchestration_complete', {
      requestId: input.requestId,
      profile,
      provider: env.llm.provider,
      model: env.llm.model,
      degraded,
      totalLatencyMs,
      sections: diagnosticsSections.map((section) => ({
        name: section.name,
        status: section.status,
        attempts: section.attempts,
        latencyMs: section.latencyMs,
      })),
    });

    if (env.llm.includeDiagnostics) {
      metadata = {
        ...metadata,
        diagnostics: {
          profile,
          degraded,
          totalLatencyMs,
          sections: diagnosticsSections,
        },
      };
    }

    return {
      text,
      metadata,
    };
  }
}
