/**
 * TDD: suggestions[] plumbing through commitAssistantResponse.
 * Verifies sanitization via sanitizePromptInput(s, 60) and omit-when-absent semantics.
 */

import { commitAssistantResponse } from '@modules/chat/useCase/orchestration/message-commit';
import type { OrchestratorOutput } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';
import { makeSession, makeMessage } from '../../helpers/chat/message.fixtures';

// ── Minimal CommitDeps stub ─────────────────────────────────────────────

const makeGuardrail = (text: string): GuardrailEvaluationService =>
  ({
    evaluateOutput: jest.fn().mockResolvedValue({
      text,
      metadata: {},
      allowed: true,
    }),
  }) as unknown as GuardrailEvaluationService;

const makeRepo = (text: string) =>
  makeChatRepo({
    persistMessage: jest.fn().mockResolvedValue(
      makeMessage({
        id: 'msg-assistant-001',
        role: 'assistant',
        text,
        createdAt: new Date('2025-06-01T10:00:00.000Z'),
      }),
    ),
  });

const baseAiResult = (overrides: Partial<OrchestratorOutput> = {}): OrchestratorOutput => ({
  text: 'Voici la Joconde.',
  metadata: {},
  ...overrides,
});

const baseSession = makeSession({ id: 'session-abc' });

const baseOptions = {
  requestedLocale: 'fr',
  ownerId: 1,
};

// ── Tests ───────────────────────────────────────────────────────────────

describe('commitAssistantResponse — suggestions plumbing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns suggestions when aiResult.suggestions is populated', async () => {
    const text = 'Voici la Joconde.';
    const aiResult = baseAiResult({ suggestions: ['Mona Lisa', 'Vénus'] });

    const result = await commitAssistantResponse(
      {
        guardrail: makeGuardrail(text),
        repository: makeRepo(text),
      },
      'session-abc',
      baseSession,
      aiResult,
      baseOptions,
    );

    expect(result.message.suggestions).toEqual(['Mona Lisa', 'Vénus']);
  });

  it('omits suggestions key when aiResult.suggestions is undefined', async () => {
    const text = 'Voici la Joconde.';
    const aiResult = baseAiResult(); // no suggestions field

    const result = await commitAssistantResponse(
      {
        guardrail: makeGuardrail(text),
        repository: makeRepo(text),
      },
      'session-abc',
      baseSession,
      aiResult,
      baseOptions,
    );

    expect('suggestions' in result.message).toBe(false);
  });

  it('strips zero-width characters and trims whitespace from suggestion strings', async () => {
    const text = 'Response.';
    // U+200B = zero-width space
    const aiResult = baseAiResult({ suggestions: ['  weird​ text  '] });

    const result = await commitAssistantResponse(
      {
        guardrail: makeGuardrail(text),
        repository: makeRepo(text),
      },
      'session-abc',
      baseSession,
      aiResult,
      baseOptions,
    );

    expect(result.message.suggestions).toEqual(['weird text']);
  });

  it('truncates suggestions longer than 60 chars to exactly 60 chars', async () => {
    const text = 'Response.';
    const longSuggestion = 'A'.repeat(100);
    const aiResult = baseAiResult({ suggestions: [longSuggestion] });

    const result = await commitAssistantResponse(
      {
        guardrail: makeGuardrail(text),
        repository: makeRepo(text),
      },
      'session-abc',
      baseSession,
      aiResult,
      baseOptions,
    );

    expect(result.message.suggestions).toEqual(['A'.repeat(60)]);
  });

  it('omits suggestions key when aiResult.suggestions is an empty array', async () => {
    const text = 'Response.';
    const aiResult = baseAiResult({ suggestions: [] });

    const result = await commitAssistantResponse(
      {
        guardrail: makeGuardrail(text),
        repository: makeRepo(text),
      },
      'session-abc',
      baseSession,
      aiResult,
      baseOptions,
    );

    expect('suggestions' in result.message).toBe(false);
  });

  it('omits the suggestions field when sanitization collapses every item to empty', async () => {
    const text = 'Response.';
    // Each item: whitespace + zero-width chars only (U+200B). sanitizePromptInput
    // strips the zero-width chars and trims, leaving an empty string.
    const aiResult = baseAiResult({ suggestions: ['  ​  ', '​​', '   '] });

    const result = await commitAssistantResponse(
      {
        guardrail: makeGuardrail(text),
        repository: makeRepo(text),
      },
      'session-abc',
      baseSession,
      aiResult,
      baseOptions,
    );

    expect(result.message.suggestions).toBeUndefined();
    expect('suggestions' in result.message).toBe(false);
  });
});
