import { ChatOpenAI } from '@langchain/openai';
import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/langchain.orchestrator';
import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

const AI_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

/** Test utility: flag indicating whether live AI tests should execute (requires RUN_AI_TESTS=true). */
export const shouldRunAiTests = process.env.RUN_AI_TESTS === 'true';

/**
 * Test utility: builds a real LangChain orchestrator configured with a live OpenAI key for AI integration tests.
 * @returns LangChainChatOrchestrator wired to the configured model.
 */
export const buildAiTestOrchestrator = (): LangChainChatOrchestrator => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for AI tests');
  }

  const model = new ChatOpenAI({
    openAIApiKey: apiKey,
    model: AI_MODEL,
    temperature: 0.3,
  });

  return new LangChainChatOrchestrator({ model } as unknown as ConstructorParameters<
    typeof LangChainChatOrchestrator
  >[0]);
};

/** Test utility: builds a ChatService backed by a live AI orchestrator for end-to-end AI tests. */
export const buildAiTestService = () => {
  return buildChatTestService(buildAiTestOrchestrator());
};

/**
 * Test utility: asserts that an AI-generated response looks like a valid art-related answer.
 * @param text - The assistant response text to validate.
 */
export const assertArtResponse = (text: string): void => {
  expect(text).toBeDefined();
  expect(text.length).toBeGreaterThan(20);
  expect(text).not.toContain('running without an LLM key');
};

/** Test utility: base64-encoded 1x1 red pixel PNG used as minimal valid image input for vision pipeline tests. */
export const TEST_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
