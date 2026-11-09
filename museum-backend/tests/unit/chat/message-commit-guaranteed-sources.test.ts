import { commitAssistantResponse } from '@modules/chat/useCase/orchestration/message-commit';
import type { CitationSource } from '@modules/chat/domain/chat.types';
import type { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';

import { makeArtOutput } from '../../helpers/chat/orchestratorOutput.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';
import { makeMessage, makeSession } from '../../helpers/chat/message.fixtures';

const WEB_FACT = 'Mona Lisa overview: A celebrated 16th-century portrait painting by Leonardo.';

const routerSource: CitationSource = {
  url: 'https://example.org/mona-lisa',
  type: 'web',
  title: 'Mona Lisa overview',
  quote: 'A celebrated 16th-century portrait painting by Leonardo.',
};

const guardrail = (allowed: boolean): GuardrailEvaluationService =>
  ({
    evaluateOutput: jest.fn(async ({ metadata }: { metadata: Record<string, unknown> }) => ({
      text: allowed ? 'Answer.' : 'Refusal.',
      metadata: allowed ? { ...metadata } : {},
      allowed,
    })),
  }) as unknown as GuardrailEvaluationService;

const commit = async (
  llmSources: CitationSource[] | undefined,
  options: { allowed?: boolean; routerSources?: CitationSource[] } = {},
) => {
  const repository = makeChatRepo({
    persistMessage: jest
      .fn()
      .mockResolvedValue(makeMessage({ id: 'assistant-1', role: 'assistant' })),
  });
  await commitAssistantResponse(
    { guardrail: guardrail(options.allowed ?? true), repository },
    'session-1',
    makeSession({ id: 'session-1' }),
    makeArtOutput({ metadata: llmSources ? { sources: llmSources } : {} }),
    {
      requestedLocale: 'en',
      ownerId: 1,
      routerFacts: [WEB_FACT],
      ...(options.routerSources ? { routerSources: options.routerSources } : {}),
    },
  );
  const persisted = (repository.persistMessage as jest.Mock).mock.calls[0][0] as {
    metadata?: { sources?: CitationSource[] };
  };
  return persisted.metadata?.sources;
};

describe('assistant answers grounded on web pages always show their sources', () => {
  it('attaches the web pages the answer relied on when the model cited none', async () => {
    await expect(commit(undefined, { routerSources: [routerSource] })).resolves.toEqual([
      routerSource,
    ]);
  });

  it('keeps the model citations when it gave valid ones', async () => {
    const llmSource: CitationSource = { ...routerSource, title: 'Cited by the model' };

    await expect(commit([llmSource], { routerSources: [routerSource] })).resolves.toEqual([
      llmSource,
    ]);
  });

  it('falls back to the web pages when every model citation was rejected', async () => {
    const invented: CitationSource = {
      ...routerSource,
      quote: 'A sentence that appears in no fetched page.',
    };

    await expect(commit([invented], { routerSources: [routerSource] })).resolves.toEqual([
      routerSource,
    ]);
  });

  it('never attaches sources to a refused answer', async () => {
    await expect(
      commit(undefined, { allowed: false, routerSources: [routerSource] }),
    ).resolves.toBeUndefined();
  });

  it('adds nothing when the answer was not grounded on the web', async () => {
    await expect(commit(undefined)).resolves.toBeUndefined();
  });
});
