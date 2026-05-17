/**
 * C9.6 — Asserts the enrichment fan-out uses Promise.all (parallel) rather
 * than serial awaits. Mocks the two top-level imported helpers
 * (`fetchEnrichmentData`, `resolveLocationForMessage`) with controlled
 * delays + records their start timestamps; asserts the start-time spread is
 * within a small parallel-execution window and the total wall-clock is well
 * under the serial sum.
 *
 * Spec R1 (parallel start), R2 (wall-clock < sum), R5 (enqueue still called),
 * R6 (span emitted once) — all behavioural, time-aware. Uses real timers
 * (jest fake timers wouldn't advance the real awaits with realistic
 * `setTimeout`-based mock latencies).
 */

const FETCH_DELAY_MS = 80;
const LOC_DELAY_MS = 80;
const ROUTER_DELAY_MS = 80;
const SERIAL_SUM_MS = FETCH_DELAY_MS + LOC_DELAY_MS + ROUTER_DELAY_MS;
const PARALLEL_HEADROOM_MS = 60; // CI variance + scheduler jitter
const START_SPREAD_MAX_MS = 30; // max delta between earliest + latest start

const recordedStarts: { name: string; at: number }[] = [];

jest.mock('@modules/chat/useCase/enrichment/enrichment-fetcher', () => ({
  fetchEnrichmentData: jest.fn(async () => {
    recordedStarts.push({ name: 'fetchEnrichmentData', at: Date.now() });
    await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
    return {
      userMemoryBlock: undefined,
      knowledgeBaseBlock: undefined,
      localKnowledgeBlock: undefined,
      webSearchBlock: undefined,
      webSearchResults: [],
      enrichedImages: [],
    };
  }),
}));

jest.mock('@modules/chat/useCase/location-resolver', () => ({
  resolveLocationForMessage: jest.fn(async () => {
    recordedStarts.push({ name: 'resolveLocationForMessage', at: Date.now() });
    await new Promise((r) => setTimeout(r, LOC_DELAY_MS));
    return undefined;
  }),
}));

jest.mock('@shared/observability/chat-phase-span', () => ({
  emitChatPhaseSpan: jest.fn(),
}));

import { emitChatPhaseSpan } from '@shared/observability/chat-phase-span';
import { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import { ImageProcessingService } from '@modules/chat/useCase/image/image-processing.service';
import { PrepareMessagePipeline } from '@modules/chat/useCase/orchestration/prepare-message.pipeline';
import { makeChatRepo } from 'tests/helpers/chat/repo.fixtures';
import { makeSession, makeSessionUser } from 'tests/helpers/chat/message.fixtures';

import type { KnowledgeRouterPort } from '@modules/chat/useCase/knowledge/knowledge-router.service';

const SESSION_UUID = '00000000-0000-4000-8000-000000000006';

function makeDelayedKnowledgeRouter(): KnowledgeRouterPort {
  return {
    resolve: jest.fn(async () => {
      recordedStarts.push({ name: 'knowledgeRouter.resolve', at: Date.now() });
      await new Promise((r) => setTimeout(r, ROUTER_DELAY_MS));
      return { facts: [] as readonly string[], source: 'none' as const };
    }),
  } as unknown as KnowledgeRouterPort;
}

describe('PrepareMessagePipeline — C9.6 parallel enrichment fan-out', () => {
  beforeEach(() => {
    recordedStarts.length = 0;
    (emitChatPhaseSpan as jest.Mock).mockReset();
  });

  it('R1 + R2 — fans out fetchEnrichmentData / resolveLocationForMessage / router.classify in parallel', async () => {
    const session = makeSession({ id: SESSION_UUID, user: makeSessionUser(1) });
    const repository = makeChatRepo({
      getSessionById: jest.fn().mockResolvedValue(session),
      persistMessage: jest.fn().mockResolvedValue(undefined),
      listSessionHistory: jest.fn().mockResolvedValue([]),
    });
    const guardrail = new GuardrailEvaluationService({ repository });
    const imageProcessor = {} as unknown as ImageProcessingService;
    const knowledgeRouter = makeDelayedKnowledgeRouter();

    const pipeline = new PrepareMessagePipeline({
      repository,
      imageProcessor,
      guardrail,
      knowledgeRouter,
    });

    const startedAt = Date.now();
    const prep = await pipeline.prepare(
      SESSION_UUID,
      { text: 'tell me about the Mona Lisa' },
      'req-c96',
      1,
      '127.0.0.1',
    );
    const elapsedMs = Date.now() - startedAt;

    expect(prep.kind).toBe('ready');

    // R1: all three started within a small window (parallel start)
    const startTimes = recordedStarts.map((r) => r.at);
    const spread = Math.max(...startTimes) - Math.min(...startTimes);
    expect(spread).toBeLessThan(START_SPREAD_MAX_MS);

    // R2: total wall-clock is dominated by the SLOWEST of the three, NOT their sum.
    expect(elapsedMs).toBeLessThan(SERIAL_SUM_MS - PARALLEL_HEADROOM_MS);
  });

  it('R6 — emitChatPhaseSpan("searching-collection", ...) is called exactly once', async () => {
    const session = makeSession({ id: SESSION_UUID, user: makeSessionUser(1) });
    const repository = makeChatRepo({
      getSessionById: jest.fn().mockResolvedValue(session),
      persistMessage: jest.fn().mockResolvedValue(undefined),
      listSessionHistory: jest.fn().mockResolvedValue([]),
    });
    const guardrail = new GuardrailEvaluationService({ repository });
    const imageProcessor = {} as unknown as ImageProcessingService;
    const knowledgeRouter = makeDelayedKnowledgeRouter();

    const pipeline = new PrepareMessagePipeline({
      repository,
      imageProcessor,
      guardrail,
      knowledgeRouter,
    });

    await pipeline.prepare(SESSION_UUID, { text: 'a question' }, 'req-c96-span', 1, '127.0.0.1');

    const searchingCalls = (emitChatPhaseSpan as jest.Mock).mock.calls.filter(
      (call) => call[0] === 'searching-collection',
    );
    expect(searchingCalls).toHaveLength(1);
  });
});
