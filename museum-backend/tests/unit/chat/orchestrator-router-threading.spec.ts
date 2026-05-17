/**
 * C4 / T3.5 — Orchestrator → KnowledgeRouter result threading.
 *
 * Verifies that `LangChainChatOrchestrator` propagates the `facts` +
 * `factsSource` fields from `OrchestratorInput` (populated upstream by
 * `PrepareMessagePipeline` from `KnowledgeRouter.resolve()`) into every call
 * to `buildSectionMessages`. The Spotlighting envelope (T2.3 / T3.4) is the
 * SECOND SystemMessage when `facts.length > 0 && factsSource !== 'none'`.
 *
 * Entry points covered (2 of 2 — see editor notes — there is NO separate
 * orchestrator-level "repair" or "judge fallback" path; the judge lives
 * inside `KnowledgeRouterService`, not in the orchestrator):
 *
 *   1. `generate` (full-shot)   → `buildSectionTasks` → `buildSectionMessages`
 *   2. `generate` (walk intent) → `generateWalk`      → `buildSectionMessages`
 *
 * Backward-compat (NFR8): when `facts`/`factsSource` are absent on
 * `OrchestratorInput`, the legacy `knowledgeBaseBlock` / `webSearchBlock` path
 * remains active and no Spotlighting envelope is emitted.
 */
jest.mock('@src/config/env', () => ({
  env: {
    llm: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      maxHistoryMessages: 10,
      maxConcurrent: 2,
      timeoutMs: 10000,
      timeoutSummaryMs: 10000,
      totalBudgetMs: 30000,
      retries: 0,
      retryBaseDelayMs: 100,
      temperature: 0.3,
      maxOutputTokens: 800,
      maxTextLength: 4000,
      includeDiagnostics: false,
      openAiApiKey: 'test-key',
    },
  },
}));

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@shared/observability/sentry', () => ({
  startSpan: jest.fn((_ctx: unknown, cb: (span: unknown) => unknown) => cb({})),
}));

jest.mock('@sentry/node', () => ({
  getActiveSpan: jest.fn(() => ({
    setAttribute: jest.fn(),
  })),
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn(),
}));

jest.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: jest.fn(),
}));

/* eslint-disable import/first -- jest.mock must hoist first */
import { SystemMessage } from '@langchain/core/messages';

import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';

import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';
/* eslint-enable import/first */

interface CapturedCall {
  messages: SystemMessage[];
}

function makeFakeModel(
  response: string,
  captured: CapturedCall[],
): {
  invoke: jest.Mock;
  stream: jest.Mock;
  withStructuredOutput: jest.Mock;
} {
  return {
    invoke: jest.fn().mockImplementation((messages: SystemMessage[]) => {
      captured.push({ messages });
      return Promise.resolve({ content: response });
    }),
    stream: jest.fn().mockImplementation((messages: SystemMessage[]) => {
      captured.push({ messages });

      return Promise.resolve(
        (async function* () {
          for (const word of response.split(' ')) {
            yield { content: word + ' ' };
          }
        })(),
      );
    }),
    withStructuredOutput: jest.fn().mockImplementation(() => ({
      invoke: jest.fn().mockImplementation((messages: SystemMessage[]) => {
        captured.push({ messages });
        return Promise.resolve({ answer: response, suggestions: [] });
      }),
    })),
  };
}

function makeInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    history: [],
    text: 'Tell me about the Mona Lisa',
    museumMode: false,
    locale: 'en',
    requestId: 'test-req-1',
    ...overrides,
  };
}

const findEnvelope = (messages: SystemMessage[]): string | null => {
  for (const m of messages) {
    if (!(m instanceof SystemMessage)) continue;
    const content = m.content as string;
    if (typeof content === 'string' && content.includes('[BEGIN UNTRUSTED EXTERNAL DATA')) {
      return content;
    }
  }
  return null;
};

describe('LangChainChatOrchestrator — KnowledgeRouter facts threading (T3.5)', () => {
  describe('full-shot path (generate)', () => {
    it('injects Spotlighting envelope when facts + factsSource are provided', async () => {
      const captured: CapturedCall[] = [];
      const model = makeFakeModel(
        'The Mona Lisa is a famous painting by Leonardo da Vinci.',
        captured,
      );
      const orchestrator = new LangChainChatOrchestrator({ model });

      await orchestrator.generate(
        makeInput({
          facts: ['Mona Lisa (Wikidata Q12418).', 'Artist: Leonardo da Vinci.'],
          factsSource: 'wikidata',
        }),
      );

      expect(captured.length).toBeGreaterThan(0);
      const envelope = findEnvelope(captured[0].messages);
      expect(envelope).not.toBeNull();
      expect(envelope).toContain('<untrusted_content source="wikidata"');
      expect(envelope).toContain('Mona Lisa (Wikidata Q12418).');
      expect(envelope).toContain('Artist: Leonardo da Vinci.');
    });

    it('preserves legacy behavior when facts are absent (no envelope, knowledgeBaseBlock still wired)', async () => {
      const captured: CapturedCall[] = [];
      const model = makeFakeModel('Reply.', captured);
      const orchestrator = new LangChainChatOrchestrator({ model });

      await orchestrator.generate(
        makeInput({
          knowledgeBaseBlock: 'Legacy KB block content.',
          // facts / factsSource intentionally omitted
        }),
      );

      expect(captured.length).toBeGreaterThan(0);
      const envelope = findEnvelope(captured[0].messages);
      expect(envelope).toBeNull();

      // Legacy knowledge_base block still rendered downstream
      const legacyBlock = captured[0].messages.find(
        (m): m is SystemMessage =>
          m instanceof SystemMessage &&
          typeof m.content === 'string' &&
          m.content.includes('<untrusted_content source="knowledge_base"'),
      );
      expect(legacyBlock).toBeDefined();
    });

    it('skips envelope when factsSource is "none" even if facts.length > 0', async () => {
      const captured: CapturedCall[] = [];
      const model = makeFakeModel('Reply.', captured);
      const orchestrator = new LangChainChatOrchestrator({ model });

      await orchestrator.generate(
        makeInput({
          facts: ['Some stray fact'],
          factsSource: 'none',
        }),
      );

      expect(captured.length).toBeGreaterThan(0);
      const envelope = findEnvelope(captured[0].messages);
      expect(envelope).toBeNull();
    });
  });

  describe('walk-intent path (generateWalk)', () => {
    it('injects Spotlighting envelope into walk messages when facts provided', async () => {
      const captured: CapturedCall[] = [];
      const model = makeFakeModel('Walk reply.', captured);
      const orchestrator = new LangChainChatOrchestrator({ model });

      await orchestrator.generate(
        makeInput({
          intent: 'walk',
          text: 'Where should I go next?',
          facts: ['Louvre — Mona Lisa is in Salle 711.', 'Open until 18h.'],
          factsSource: 'web',
        }),
      );

      // walk path uses withStructuredOutput → captured via that adapter
      expect(captured.length).toBeGreaterThan(0);
      const envelope = findEnvelope(captured[0].messages);
      expect(envelope).not.toBeNull();
      expect(envelope).toContain('<untrusted_content source="web"');
      expect(envelope).toContain('Louvre — Mona Lisa is in Salle 711.');
    });
  });
});
