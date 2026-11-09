import type { ChatModel } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-support';
import type { MainAssistantOutput } from '@modules/chat/useCase/llm/llm-sections';
import type { BaseMessage } from '@langchain/core/messages';

export interface FakeChatModelConfig {
  text: string;
}

export interface FakeChatModelHandle {
  model: ChatModel;
  invokeCount: number;
  capturedMessages: BaseMessage[] | null;
}

const buildAssistantOutput = (text: string): MainAssistantOutput => ({
  text,
  deeperContext: null,
  openQuestion: null,
  imageDescription: null,
  suggestedImages: null,
  detectedArtwork: null,
  recommendations: null,
  expertiseSignal: null,
  citations: null,
  sources: null,
});

export const makeFakeChatModel = (config: FakeChatModelConfig): FakeChatModelHandle => {
  const handle: FakeChatModelHandle = {
    model: undefined as unknown as ChatModel,
    invokeCount: 0,
    capturedMessages: null,
  };

  const model: ChatModel = {
    invoke() {
      return Promise.reject(
        new Error('fake chat model: bare invoke() is not used by the orchestrator default path'),
      );
    },
    stream() {
      return Promise.reject(
        new Error('fake chat model: stream() is not used by the orchestrator default path'),
      );
    },
    withStructuredOutput<T>() {
      return {
        invoke(messages: unknown): Promise<T> {
          handle.invokeCount += 1;
          handle.capturedMessages = messages as BaseMessage[];
          return Promise.resolve(buildAssistantOutput(config.text) as unknown as T);
        },
      };
    },
  };

  handle.model = model;
  return handle;
};
