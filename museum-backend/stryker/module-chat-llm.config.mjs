/**
 * module/chat carve-out — LLM orchestration (LangChain wrapper + section
 * prompts + provider adapters).
 *
 * Includes:
 *   - useCase/llm/* + useCase/llm/llm-sections/* — section prompt builders
 *     (intro/art/museum/context), LangChain orchestrator wrapper.
 *   - adapters/secondary/llm/* — OpenAI/Deepseek/Google provider adapters,
 *     ChatOrchestrator implementations.
 *
 * Carve-out rationale: dense StringLiteral mutants on prompt templates that
 * need fixture-driven assertions. Mid-size scope (~25-30 files).
 *
 * Usage: `pnpm stryker run stryker/module-chat-llm.config.mjs`
 */
import { defineConfig } from './config.mjs';

export default defineConfig({
  mutate: [
    'src/modules/chat/useCase/llm/**/*.ts',
    'src/modules/chat/adapters/secondary/llm/**/*.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.types.ts',
  ],
});
