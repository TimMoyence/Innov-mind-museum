import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ChatOpenAI } from '@langchain/openai';
import { config as loadDotenv } from 'dotenv';
import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';
import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

// The `unit-integration` Jest project only pins PGDATABASE (see jest.config.ts);
// it does NOT inject the host `.env`. Real-LLM ai-tests need `OPENAI_API_KEY`
// (+ LLM_MODEL / LLM_PROVIDER) which live in `museum-backend/.env`. Load them
// here, at module-import time, before any test reads `process.env`. `override:
// false` (dotenv default) means an explicitly-exported env var (e.g. CI secret)
// still wins over the file — we only fill gaps, never clobber.
loadDotenv({ path: resolve(__dirname, '../../../.env') });

const AI_MODEL = process.env.LLM_MODEL?.trim() ? process.env.LLM_MODEL.trim() : 'gpt-4o-mini';

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
    apiKey,
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

// ---------------------------------------------------------------------------
// Real-image fixtures (public-domain, committed under tests/ai/fixtures/).
//   art-mona-lisa.jpg      — Leonardo da Vinci, Mona Lisa (ART)
//   building-monument.jpg  — Pont de Pierre, Bordeaux (MONUMENT / outdoors)
//   nonart-banana.jpg      — a single banana (NON-ART everyday object)
// Sourced from Wikimedia Commons (see RETURN note in the test report).
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(__dirname, '../fixtures');

/**
 * Reads a committed image fixture and returns its raw base64 (no data-URL prefix).
 * @param filename - Fixture file name under tests/ai/fixtures/ (literal allow-list).
 * @returns The file contents base64-encoded.
 */
export const readFixtureBase64 = (filename: string): string => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filename is a hard-coded literal from the fixtures allow-list below, never user input.
  return readFileSync(resolve(FIXTURES_DIR, filename)).toString('base64');
};

/**
 * Reads a committed image fixture and returns a `data:<mime>;base64,...` URL.
 * @param filename - Fixture file name under tests/ai/fixtures/.
 * @param mime - MIME type for the data URL (default image/jpeg).
 * @returns A `data:` URL string consumable by the chat image input.
 */
export const readFixtureDataUrl = (filename: string, mime = 'image/jpeg'): string =>
  `data:${mime};base64,${readFixtureBase64(filename)}`;

/** The three committed real-image fixtures, by semantic role. */
export const AI_IMAGE_FIXTURES = {
  art: 'art-mona-lisa.jpg',
  monument: 'building-monument.jpg',
  nonArt: 'nonart-banana.jpg',
} as const;

// ---------------------------------------------------------------------------
// Robust assertion helpers — tolerant to LLM nondeterminism. Assert SHAPE /
// CATEGORY (non-empty, no throw, refusal-citation present/absent, language),
// never exact wording.
// ---------------------------------------------------------------------------

/** All `policy:*` refusal citations the V1 keyword guardrail can emit. */
export const REFUSAL_CITATIONS = [
  'policy:insult',
  'policy:prompt_injection',
  'policy:off_topic',
  'policy:unsafe_output',
  'policy:service_unavailable',
] as const;

/**
 * True when the response metadata carries ANY guardrail-refusal citation.
 * @param citations - The `metadata.citations` array (or undefined).
 * @returns True if any `policy:*` refusal citation is present.
 */
export const hasRefusalCitation = (citations: string[] | undefined): boolean => {
  const list = citations ?? [];
  return REFUSAL_CITATIONS.some((c) => list.includes(c));
};

/**
 * Asserts a real, substantive assistant answer was produced (NOT a refusal,
 * NOT empty, NOT the no-LLM-key stub). Use for cases that MUST go through to
 * the model and come back with content.
 * @param result - The postMessage result ({ message.text, metadata.citations }).
 */
export const assertSubstantiveAnswer = (result: {
  message: { text: string };
  metadata: { citations?: string[] };
}): void => {
  expect(result.message.text).toBeDefined();
  expect(typeof result.message.text).toBe('string');
  expect(result.message.text.trim().length).toBeGreaterThan(20);
  expect(result.message.text).not.toContain('running without an LLM key');
  expect(hasRefusalCitation(result.metadata.citations)).toBe(false);
};

/**
 * Asserts the response is a graceful, non-empty reply (no crash) WITHOUT
 * asserting whether it's an answer or a refusal — used for inputs where either
 * a polite redirect or a substantive answer is acceptable (off-topic, ambiguous
 * image, monument). The key contract is: pipeline did not throw, text non-empty.
 * @param result - The postMessage result ({ message.text }).
 */
export const assertGracefulNonEmpty = (result: { message: { text: string } }): void => {
  expect(result.message.text).toBeDefined();
  expect(typeof result.message.text).toBe('string');
  expect(result.message.text.trim().length).toBeGreaterThan(0);
  expect(result.message.text).not.toContain('running without an LLM key');
};

/**
 * Heuristic French-language detector for response-language fidelity assertions.
 * Looks for French function words / accented forms that are extremely unlikely
 * in an English sentence of comparable length. Returns true if ≥2 signals hit.
 * @param text - The assistant response text to classify.
 * @returns True if the text looks French (≥2 signals).
 */
export const looksFrench = (text: string): boolean => {
  const t = ` ${text.toLowerCase()} `;
  const signals = [
    ' le ',
    ' la ',
    ' les ',
    ' une ',
    ' un ',
    ' des ',
    ' est ',
    ' avec ',
    ' pour ',
    ' dans ',
    ' cette ',
    ' œuvre',
    ' peintre',
    ' tableau',
    'é',
    'è',
    'à',
  ];
  return signals.filter((s) => t.includes(s)).length >= 2;
};

/**
 * Heuristic English-language detector (mirror of {@link looksFrench}). Returns
 * true if ≥2 common English function words are present.
 * @param text - The assistant response text to classify.
 * @returns True if the text looks English (≥2 signals).
 */
export const looksEnglish = (text: string): boolean => {
  const t = ` ${text.toLowerCase()} `;
  const signals = [
    ' the ',
    ' is ',
    ' was ',
    ' this ',
    ' that ',
    ' with ',
    ' painting',
    ' artist',
    ' you ',
    ' it ',
    ' of ',
    ' and ',
  ];
  return signals.filter((s) => t.includes(s)).length >= 2;
};
